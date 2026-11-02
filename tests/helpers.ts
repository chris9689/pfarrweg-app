import { DateTime } from 'luxon';
import type { Schedule, ScheduleException } from '../shared/types';

export const TZ = 'Europe/Berlin';

/** Local wall-clock time in the building timezone → epoch ms. */
export const at = (local: string) => DateTime.fromISO(local, { zone: TZ }).toMillis();
export const utc = (local: string) => DateTime.fromISO(local, { zone: TZ }).toUTC().toISO()!;
export const localOf = (ms: number) => DateTime.fromMillis(ms, { zone: TZ }).toFormat("yyyy-MM-dd'T'HH:mm");

let counter = 0;
export function schedule(p: Partial<Schedule> & { start: string; end: string }): Schedule {
  counter += 1;
  return {
    id: p.id ?? `s${counter}`,
    parkingSpaceId: p.parkingSpaceId ?? 'space-1',
    recurrenceType: 'none',
    recurrenceDays: [],
    recurrenceEndDate: null,
    timezone: TZ,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...p,
    start: utc(p.start),
    end: utc(p.end),
  };
}

export function exception(p: Partial<ScheduleException> & { scheduleId: string; occurrenceDate: string }): ScheduleException {
  return {
    id: `e-${p.scheduleId}-${p.occurrenceDate}`,
    type: 'cancelled',
    modifiedStart: null,
    modifiedEnd: null,
    ...p,
  };
}
