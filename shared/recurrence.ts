import { DateTime } from 'luxon';
import type { Occurrence, Schedule, ScheduleException } from './types.js';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface Template {
  startDate: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  /** Calendar days between the local start date and local end date. */
  dayOffset: number;
  weekday: number;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
}

export function daysBetween(from: string, to: string): number {
  const a = DateTime.fromISO(from, { zone: 'utc' });
  const b = DateTime.fromISO(to, { zone: 'utc' });
  return Math.round(b.diff(a, 'days').days);
}

export function isoWeekday(date: string): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday;
}

export function localDateTime(date: string, time: string, zone: string): DateTime;
export function localDateTime(date: string, hour: number, minute: number, zone: string): DateTime;
export function localDateTime(date: string, a: string | number, b: number | string, c?: string): DateTime {
  const [year, month, day] = date.split('-').map(Number);
  let hour: number;
  let minute: number;
  let zone: string;
  if (typeof a === 'string') {
    [hour, minute] = a.split(':').map(Number);
    zone = b as string;
  } else {
    hour = a;
    minute = b as number;
    zone = c!;
  }
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone });
}

export function localDate(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toISODate()!;
}

export function templateOf(s: Pick<Schedule, 'start' | 'end' | 'timezone'>): Template {
  const start = DateTime.fromISO(s.start, { zone: s.timezone });
  const end = DateTime.fromISO(s.end, { zone: s.timezone });
  const startDate = start.toISODate()!;
  return {
    startDate,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    dayOffset: daysBetween(startDate, end.toISODate()!),
    weekday: start.weekday,
  };
}

/** Wall-clock length of one occurrence in minutes (independent of DST shifts). */
export function wallClockMinutes(t: Template): number {
  return t.dayOffset * 1440 + t.endHour * 60 + t.endMinute - (t.startHour * 60 + t.startMinute);
}

function matches(s: Schedule, t: Template, date: string): boolean {
  if (date < t.startDate) return false;
  if (s.recurrenceEndDate && date > s.recurrenceEndDate) return false;
  switch (s.recurrenceType) {
    case 'none':
      return date === t.startDate;
    case 'daily':
      return true;
    case 'weekly':
      return isoWeekday(date) === t.weekday;
    case 'weekdays':
      return s.recurrenceDays.includes(isoWeekday(date));
  }
}

export function isOccurrenceDate(s: Schedule, date: string): boolean {
  return matches(s, templateOf(s), date);
}

/** First local date on or after the series start that produces an occurrence. */
export function firstOccurrenceDate(s: Schedule): string | null {
  const t = templateOf(s);
  for (let i = 0; i < 7; i++) {
    const date = addDays(t.startDate, i);
    if (s.recurrenceEndDate && date > s.recurrenceEndDate) return null;
    if (matches(s, t, date)) return date;
  }
  return null;
}

/** Regular (unmodified) occurrence of a series on a given local date. Wall-clock times are preserved across DST. */
export function occurrenceTimes(s: Schedule, t: Template, date: string): { start: number; end: number } {
  return {
    start: localDateTime(date, t.startHour, t.startMinute, s.timezone).toMillis(),
    end: localDateTime(addDays(date, t.dayOffset), t.endHour, t.endMinute, s.timezone).toMillis(),
  };
}

/** All occurrences of a schedule that overlap [from, to). */
export function expandSchedule(
  s: Schedule,
  exceptions: ScheduleException[],
  from: number,
  to: number,
): Occurrence[] {
  if (!s.isActive) return [];
  const overlaps = (start: number, end: number) => start < to && end > from;
  const base = {
    scheduleId: s.id,
    parkingSpaceId: s.parkingSpaceId,
    recurring: s.recurrenceType !== 'none',
  };
  const t = templateOf(s);

  if (s.recurrenceType === 'none') {
    const start = Date.parse(s.start);
    const end = Date.parse(s.end);
    return overlaps(start, end) ? [{ ...base, occurrenceDate: t.startDate, start, end, modified: false }] : [];
  }

  const own = exceptions.filter((e) => e.scheduleId === s.id);
  const exceptionDates = new Set(own.map((e) => e.occurrenceDate));
  const result: Occurrence[] = [];

  // Start early enough to catch occurrences that began before `from` and are still running.
  const scanFrom = addDays(localDate(from, s.timezone), -(t.dayOffset + 1));
  const scanTo = localDate(to, s.timezone);
  let date = scanFrom > t.startDate ? scanFrom : t.startDate;
  const last = s.recurrenceEndDate && s.recurrenceEndDate < scanTo ? s.recurrenceEndDate : scanTo;

  for (; date <= last; date = addDays(date, 1)) {
    if (exceptionDates.has(date) || !matches(s, t, date)) continue;
    const { start, end } = occurrenceTimes(s, t, date);
    if (end > start && overlaps(start, end)) {
      result.push({ ...base, occurrenceDate: date, start, end, modified: false });
    }
  }

  for (const e of own) {
    if (e.type !== 'modified' || !e.modifiedStart || !e.modifiedEnd) continue;
    if (!matches(s, t, e.occurrenceDate)) continue;
    const start = Date.parse(e.modifiedStart);
    const end = Date.parse(e.modifiedEnd);
    if (end > start && overlaps(start, end)) {
      result.push({ ...base, occurrenceDate: e.occurrenceDate, start, end, modified: true });
    }
  }

  return result.sort((a, b) => a.start - b.start);
}

export function expandAll(
  schedules: Schedule[],
  exceptions: ScheduleException[],
  from: number,
  to: number,
): Occurrence[] {
  return schedules.flatMap((s) => expandSchedule(s, exceptions, from, to)).sort((a, b) => a.start - b.start);
}

/** Merge overlapping or back-to-back periods into continuous blocks. */
export function mergeBlocks<T extends { start: number; end: number }>(items: T[]): { start: number; end: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const { start, end } of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out;
}

/** True when a schedule can no longer produce an occurrence ending after `now`. */
export function isFinished(s: Schedule, now: number): boolean {
  if (s.recurrenceType === 'none') return Date.parse(s.end) <= now;
  if (!s.recurrenceEndDate) return false;
  const t = templateOf(s);
  const lastEnd = localDateTime(addDays(s.recurrenceEndDate, t.dayOffset), t.endHour, t.endMinute, s.timezone);
  return lastEnd.toMillis() <= now;
}
