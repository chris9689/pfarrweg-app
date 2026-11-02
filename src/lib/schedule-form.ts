import { DateTime } from 'luxon';
import { addDays, templateOf } from '../../shared/recurrence';
import type { Occurrence, RecurrenceType, Schedule, ScheduleInput } from '../../shared/types';

export interface FormValues {
  spaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Explicit end date for multi-day periods ("More options"); null = same day / next day. */
  endDate: string | null;
  repeatType: RecurrenceType;
  days: number[];
  until: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const clock = (d: DateTime) => `${pad(d.hour)}:${pad(d.minute)}`;

/** End date implied by the times alone: ending at or before the start time means "next day". */
export const impliedEndDate = (date: string, startTime: string, endTime: string) =>
  endTime <= startTime ? addDays(date, 1) : date;

export function toScheduleInput(v: FormValues): ScheduleInput {
  const endDate = v.repeatType === 'none' && v.endDate ? v.endDate : impliedEndDate(v.date, v.startTime, v.endTime);
  return {
    startDate: v.date,
    startTime: v.startTime,
    endDate,
    endTime: v.endTime,
    repeat:
      v.repeatType === 'none'
        ? null
        : { type: v.repeatType, days: v.repeatType === 'weekdays' ? v.days : [], until: v.until || null },
  };
}

/** Starts at the current quarter hour (so the space is free right away) and lasts three hours. */
export function defaultFormValues(spaceId: string, now: number, zone: string): FormValues {
  const local = DateTime.fromMillis(now, { zone });
  const date = local.toISODate()!;
  const start = Math.floor((local.hour * 60 + local.minute) / 15) * 15;
  return {
    spaceId,
    date,
    startTime: hhmm(start),
    endTime: hhmm((start + 180) % 1440),
    endDate: null,
    repeatType: 'none',
    days: [DateTime.fromISO(date).weekday],
    until: null,
  };
}

function explicitEnd(date: string, startTime: string, endDate: string, endTime: string) {
  return endDate === impliedEndDate(date, startTime, endTime) ? null : endDate;
}

/** Values for editing a whole series (or a one-off), or "this and following" from a given date. */
export function valuesFromSchedule(s: Schedule, fromDate?: string): FormValues {
  const t = templateOf(s);
  const date = fromDate ?? t.startDate;
  const startTime = `${pad(t.startHour)}:${pad(t.startMinute)}`;
  const endTime = `${pad(t.endHour)}:${pad(t.endMinute)}`;
  return {
    spaceId: s.parkingSpaceId,
    date,
    startTime,
    endTime,
    endDate: explicitEnd(date, startTime, addDays(date, t.dayOffset), endTime),
    repeatType: s.recurrenceType,
    days: s.recurrenceType === 'weekdays' ? s.recurrenceDays : [t.weekday],
    until: s.recurrenceEndDate,
  };
}

/** Values for changing a single occurrence (no repetition). */
export function valuesFromOccurrence(s: Schedule, o: Occurrence): FormValues {
  const start = DateTime.fromMillis(o.start, { zone: s.timezone });
  const end = DateTime.fromMillis(o.end, { zone: s.timezone });
  const date = start.toISODate()!;
  return {
    spaceId: s.parkingSpaceId,
    date,
    startTime: clock(start),
    endTime: clock(end),
    endDate: explicitEnd(date, clock(start), end.toISODate()!, clock(end)),
    repeatType: 'none',
    days: [start.weekday],
    until: null,
  };
}

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => hhmm(i * 15));
