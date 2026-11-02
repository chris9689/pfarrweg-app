import { DateTime, Info } from 'luxon';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { localeFor } from '../i18n/detect';
import { DAY_MS, HOUR_MS, MINUTE_MS, templateOf } from '../../shared/recurrence';
import type { Schedule } from '../../shared/types';

export type Formatters = ReturnType<typeof createFormatters>;

/** Display helpers: language decides wording/format, the building timezone decides the clock. */
export function createFormatters(t: TFunction, language: string, zone: string) {
  const locale = localeFor(language);
  const dt = (ms: number) => DateTime.fromMillis(ms, { zone }).setLocale(locale);
  const dayKey = (ms: number) => dt(ms).toISODate();

  const time = (ms: number) => dt(ms).toLocaleString(DateTime.TIME_24_SIMPLE);

  const day = (ms: number, now: number) => {
    if (dayKey(ms) === dayKey(now)) return t('date.today');
    if (dayKey(ms) === dayKey(now + DAY_MS)) return t('date.tomorrow');
    return dt(ms).toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' });
  };

  const dayTime = (ms: number, now: number) => t('date.dayTime', { day: day(ms, now), time: time(ms) });

  const range = (start: number, end: number, now: number) =>
    dayKey(start) === dayKey(end)
      ? t('date.sameDayRange', { day: day(start, now), start: time(start), end: time(end) })
      : t('date.range', { start: dayTime(start, now), end: dayTime(end, now) });

  /** Compact form for use inside a sentence: "14:45", "tomorrow, 08:00", "Tue, 08:00", "12 Nov, 08:00". */
  const moment = (ms: number, now: number) => {
    if (dayKey(ms) === dayKey(now)) return time(ms);
    if (dayKey(ms) === dayKey(now + DAY_MS)) return t('date.tomorrowAt', { time: time(ms) });
    const dayLabel =
      ms - now < 6 * DAY_MS
        ? dt(ms).toLocaleString({ weekday: 'short' })
        : dt(ms).toLocaleString({ day: 'numeric', month: 'short' });
    return t('date.dayTime', { day: dayLabel, time: time(ms) });
  };

  const duration = (ms: number) => {
    const totalMinutes = Math.max(1, Math.round(ms / MINUTE_MS));
    if (ms >= 2 * DAY_MS) return t('duration.days', { count: Math.floor(ms / DAY_MS) });
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return t('duration.minutes', { m });
    if (m === 0 || ms >= 10 * HOUR_MS) return t('duration.hours', { h });
    return t('duration.hoursMinutes', { h, m });
  };

  const isoDate = (date: string, withYear = false) =>
    DateTime.fromISO(date, { zone: 'utc' })
      .setLocale(locale)
      .toLocaleString({ weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

  const fullDateTime = (ms: number) =>
    dt(ms).toLocaleString({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const weekdayShort = (isoDay: number) => Info.weekdays('short', { locale })[isoDay - 1];
  const weekdayLong = (isoDay: number) => Info.weekdays('long', { locale })[isoDay - 1];

  /** "Every Monday · 08:00 – 17:00" style summary of a recurring schedule. */
  const recurrence = (s: Schedule) => {
    const tpl = templateOf(s);
    const pattern =
      s.recurrenceType === 'daily'
        ? t('recurrence.daily')
        : s.recurrenceType === 'weekly'
          ? t('recurrence.weekly', { day: weekdayLong(tpl.weekday) })
          : t('recurrence.weekdays', { days: s.recurrenceDays.map(weekdayShort).join(', ') });
    const pad = (n: number) => String(n).padStart(2, '0');
    const times = t('date.range', {
      start: `${pad(tpl.startHour)}:${pad(tpl.startMinute)}`,
      end: `${pad(tpl.endHour)}:${pad(tpl.endMinute)}`,
    });
    return `${pattern} · ${times}`;
  };

  const clockLabel = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return DateTime.fromObject({ hour: h, minute: m }).setLocale(locale).toLocaleString(DateTime.TIME_24_SIMPLE);
  };

  return { time, day, dayTime, range, moment, duration, isoDate, fullDateTime, weekdayShort, weekdayLong, recurrence, clockLabel };
}

export function useFormatters(zone: string): Formatters {
  const { t, i18n } = useTranslation();
  return useMemo(() => createFormatters(t, i18n.language, zone), [t, i18n.language, zone]);
}
