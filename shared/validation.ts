import { DateTime } from 'luxon';
import { DAY_MS, addDays, localDateTime, templateOf, wallClockMinutes } from './recurrence.js';
import type { RecurrenceType, ScheduleInput } from './types.js';

export type ValidationCode =
  | 'invalid_input'
  | 'end_before_start'
  | 'end_in_past'
  | 'too_long'
  | 'too_long_repeat'
  | 'too_far_ahead'
  | 'days_required'
  | 'until_before_start';

export interface NormalizedSchedule {
  start: string;
  end: string;
  recurrenceType: RecurrenceType;
  recurrenceDays: number[];
  recurrenceEndDate: string | null;
}

export type ValidationResult = { ok: true; value: NormalizedSchedule } | { ok: false; code: ValidationCode };

export const MAX_ONE_OFF_DAYS = 366;
export const MAX_DAYS_AHEAD = 365;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && DATE_RE.test(v) && DateTime.fromISO(v, { zone: 'utc' }).isValid;
const isTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v);

/** Validates and converts wall-clock input (building timezone) into a schedule definition. */
export function validateScheduleInput(
  input: unknown,
  timezone: string,
  now: number,
  options: { allowRepeat?: boolean } = {},
): ValidationResult {
  const fail = (code: ValidationCode): ValidationResult => ({ ok: false, code });
  if (!input || typeof input !== 'object') return fail('invalid_input');
  const raw = input as Partial<ScheduleInput>;
  if (!isDate(raw.startDate) || !isDate(raw.endDate) || !isTime(raw.startTime) || !isTime(raw.endTime)) {
    return fail('invalid_input');
  }

  let repeat: ScheduleInput['repeat'] = null;
  if (raw.repeat != null && options.allowRepeat !== false) {
    const r = raw.repeat as Partial<NonNullable<ScheduleInput['repeat']>>;
    if (r.type !== 'daily' && r.type !== 'weekly' && r.type !== 'weekdays') return fail('invalid_input');
    const days = Array.isArray(r.days) ? r.days : [];
    if (!days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return fail('invalid_input');
    if (r.until != null && !isDate(r.until)) return fail('invalid_input');
    repeat = { type: r.type, days: [...new Set(days)].sort((a, b) => a - b), until: r.until ?? null };
  }

  const start = localDateTime(raw.startDate, raw.startTime, timezone);
  const end = localDateTime(raw.endDate, raw.endTime, timezone);
  if (!start.isValid || !end.isValid) return fail('invalid_input');
  if (end <= start) return fail('end_before_start');

  const today = DateTime.fromMillis(now, { zone: timezone }).toISODate()!;
  if (raw.startDate > addDays(today, MAX_DAYS_AHEAD)) return fail('too_far_ahead');

  const value: NormalizedSchedule = {
    start: start.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    recurrenceType: repeat?.type ?? 'none',
    recurrenceDays: repeat?.type === 'weekdays' ? repeat.days : [],
    recurrenceEndDate: repeat?.until ?? null,
  };

  if (!repeat) {
    if (end.toMillis() - start.toMillis() > MAX_ONE_OFF_DAYS * DAY_MS) return fail('too_long');
    if (end.toMillis() <= now) return fail('end_in_past');
    return { ok: true, value };
  }

  if (repeat.type === 'weekdays' && repeat.days.length === 0) return fail('days_required');
  if (repeat.until && repeat.until < raw.startDate) return fail('until_before_start');

  const template = templateOf({ start: value.start, end: value.end, timezone });
  const maxMinutes = repeat.type === 'weekly' ? 7 * 1440 : 1440;
  if (wallClockMinutes(template) > maxMinutes) return fail('too_long_repeat');

  if (repeat.until) {
    const lastEnd = localDateTime(addDays(repeat.until, template.dayOffset), raw.endTime, timezone);
    if (lastEnd.toMillis() <= now) return fail('end_in_past');
  }
  return { ok: true, value };
}
