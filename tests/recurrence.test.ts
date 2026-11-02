import { describe, expect, it } from 'vitest';
import {
  HOUR_MS,
  expandSchedule,
  firstOccurrenceDate,
  isFinished,
  isOccurrenceDate,
  mergeBlocks,
} from '../shared/recurrence';
import { at, exception, localOf, schedule, utc } from './helpers';

const range = (s: string, e: string) => [at(s), at(e)] as const;
const locals = (occ: { start: number; end: number }[]) => occ.map((o) => `${localOf(o.start)}/${localOf(o.end)}`);

describe('one-off schedules', () => {
  const s = schedule({ start: '2026-11-02T14:00', end: '2026-11-02T22:00' });

  it('is returned when it overlaps the range', () => {
    expect(locals(expandSchedule(s, [], ...range('2026-11-02T00:00', '2026-11-03T00:00')))).toEqual([
      '2026-11-02T14:00/2026-11-02T22:00',
    ]);
  });

  it('is not returned outside the range', () => {
    expect(expandSchedule(s, [], ...range('2026-11-02T22:00', '2026-11-04T00:00'))).toEqual([]);
  });

  it('is ignored while paused', () => {
    expect(expandSchedule({ ...s, isActive: false }, [], ...range('2026-11-01T00:00', '2026-11-05T00:00'))).toEqual([]);
  });
});

describe('recurring schedules', () => {
  it('daily repeats every day at the same local time', () => {
    const s = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T17:00', recurrenceType: 'daily' });
    expect(locals(expandSchedule(s, [], ...range('2026-11-02T00:00', '2026-11-05T00:00')))).toEqual([
      '2026-11-02T08:00/2026-11-02T17:00',
      '2026-11-03T08:00/2026-11-03T17:00',
      '2026-11-04T08:00/2026-11-04T17:00',
    ]);
  });

  it('weekly repeats on the weekday of the start date', () => {
    const s = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T12:00', recurrenceType: 'weekly' });
    const occ = expandSchedule(s, [], ...range('2026-11-01T00:00', '2026-11-24T00:00'));
    expect(occ.map((o) => localOf(o.start))).toEqual(['2026-11-02T08:00', '2026-11-09T08:00', '2026-11-16T08:00', '2026-11-23T08:00']);
  });

  it('selected weekdays only produce matching days (first may be after the start date)', () => {
    const s = schedule({
      start: '2026-11-03T07:00',
      end: '2026-11-03T18:00',
      recurrenceType: 'weekdays',
      recurrenceDays: [1, 3],
    });
    const occ = expandSchedule(s, [], ...range('2026-11-01T00:00', '2026-11-12T00:00'));
    expect(occ.map((o) => o.occurrenceDate)).toEqual(['2026-11-04', '2026-11-09', '2026-11-11']);
    expect(firstOccurrenceDate(s)).toBe('2026-11-04');
  });

  it('respects the inclusive recurrence end date', () => {
    const s = schedule({
      start: '2026-11-02T08:00',
      end: '2026-11-02T09:00',
      recurrenceType: 'daily',
      recurrenceEndDate: '2026-11-04',
    });
    const occ = expandSchedule(s, [], ...range('2026-11-01T00:00', '2026-11-30T00:00'));
    expect(occ.map((o) => o.occurrenceDate)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('handles periods that cross midnight, including one that started before the range', () => {
    const s = schedule({ start: '2026-11-02T22:00', end: '2026-11-03T06:00', recurrenceType: 'daily' });
    const occ = expandSchedule(s, [], ...range('2026-11-04T01:00', '2026-11-04T23:00'));
    expect(locals(occ)).toEqual(['2026-11-03T22:00/2026-11-04T06:00', '2026-11-04T22:00/2026-11-05T06:00']);
  });

  it('identifies valid occurrence dates', () => {
    const s = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T09:00', recurrenceType: 'weekly' });
    expect(isOccurrenceDate(s, '2026-11-09')).toBe(true);
    expect(isOccurrenceDate(s, '2026-11-10')).toBe(false);
    expect(isOccurrenceDate(s, '2026-10-26')).toBe(false);
  });
});

describe('daylight saving time (Europe/Berlin)', () => {
  it('keeps the local time across the spring change (29 Mar 2026)', () => {
    const s = schedule({ start: '2026-03-28T08:00', end: '2026-03-28T17:00', recurrenceType: 'daily' });
    const occ = expandSchedule(s, [], ...range('2026-03-28T00:00', '2026-03-31T00:00'));
    expect(locals(occ)).toEqual([
      '2026-03-28T08:00/2026-03-28T17:00',
      '2026-03-29T08:00/2026-03-29T17:00',
      '2026-03-30T08:00/2026-03-30T17:00',
    ]);
    expect(new Date(occ[0].start).toISOString()).toBe('2026-03-28T07:00:00.000Z');
    expect(new Date(occ[1].start).toISOString()).toBe('2026-03-29T06:00:00.000Z');
  });

  it('keeps the local time across the autumn change (25 Oct 2026)', () => {
    const s = schedule({ start: '2026-10-24T09:00', end: '2026-10-24T10:00', recurrenceType: 'weekly' });
    const occ = expandSchedule(s, [], ...range('2026-10-20T00:00', '2026-11-01T00:00'));
    expect(occ.map((o) => new Date(o.start).toISOString())).toEqual(['2026-10-24T07:00:00.000Z', '2026-10-31T08:00:00.000Z']);
  });

  it('overnight periods over the change are one hour shorter / longer', () => {
    const spring = schedule({ start: '2026-03-28T22:00', end: '2026-03-29T06:00', recurrenceType: 'daily' });
    const [s1] = expandSchedule(spring, [], ...range('2026-03-28T00:00', '2026-03-28T23:00'));
    expect((s1.end - s1.start) / HOUR_MS).toBe(7);

    const autumn = schedule({ start: '2026-10-24T22:00', end: '2026-10-25T06:00', recurrenceType: 'daily' });
    const [a1, a2] = expandSchedule(autumn, [], ...range('2026-10-24T00:00', '2026-10-25T23:00'));
    expect((a1.end - a1.start) / HOUR_MS).toBe(9);
    expect((a2.end - a2.start) / HOUR_MS).toBe(8);
  });

  it('back-to-back daily periods stay seamless across DST', () => {
    const s = schedule({ start: '2026-10-24T12:00', end: '2026-10-25T12:00', recurrenceType: 'daily' });
    const occ = expandSchedule(s, [], ...range('2026-10-24T00:00', '2026-10-28T00:00'));
    for (let i = 1; i < occ.length; i++) expect(occ[i].start).toBe(occ[i - 1].end);
  });
});

describe('exceptions', () => {
  const s = schedule({ id: 'weekly', start: '2026-11-02T08:00', end: '2026-11-02T12:00', recurrenceType: 'weekly' });
  const window = range('2026-11-01T00:00', '2026-11-20T00:00');

  it('cancelled occurrences are skipped', () => {
    const occ = expandSchedule(s, [exception({ scheduleId: 'weekly', occurrenceDate: '2026-11-09' })], ...window);
    expect(occ.map((o) => o.occurrenceDate)).toEqual(['2026-11-02', '2026-11-16']);
  });

  it('modified occurrences replace the regular one', () => {
    const occ = expandSchedule(
      s,
      [
        exception({
          scheduleId: 'weekly',
          occurrenceDate: '2026-11-09',
          type: 'modified',
          modifiedStart: utc('2026-11-09T13:00'),
          modifiedEnd: utc('2026-11-09T18:00'),
        }),
      ],
      ...window,
    );
    expect(locals(occ)).toEqual([
      '2026-11-02T08:00/2026-11-02T12:00',
      '2026-11-09T13:00/2026-11-09T18:00',
      '2026-11-16T08:00/2026-11-16T12:00',
    ]);
    expect(occ[1].modified).toBe(true);
  });

  it('exceptions for other schedules or invalid dates are ignored', () => {
    const occ = expandSchedule(
      s,
      [
        exception({ scheduleId: 'other', occurrenceDate: '2026-11-09' }),
        exception({
          scheduleId: 'weekly',
          occurrenceDate: '2026-11-10',
          type: 'modified',
          modifiedStart: utc('2026-11-10T08:00'),
          modifiedEnd: utc('2026-11-10T09:00'),
        }),
      ],
      ...window,
    );
    expect(occ.map((o) => o.occurrenceDate)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
  });
});

describe('helpers', () => {
  it('merges overlapping and adjacent blocks', () => {
    expect(
      mergeBlocks([
        { start: 10, end: 20 },
        { start: 0, end: 5 },
        { start: 20, end: 30 },
        { start: 25, end: 27 },
      ]),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 30 },
    ]);
  });

  it('detects finished schedules', () => {
    const now = at('2026-11-10T12:00');
    expect(isFinished(schedule({ start: '2026-11-01T08:00', end: '2026-11-01T09:00' }), now)).toBe(true);
    expect(isFinished(schedule({ start: '2026-11-01T08:00', end: '2026-11-01T09:00', recurrenceType: 'daily' }), now)).toBe(false);
    expect(
      isFinished(
        schedule({ start: '2026-11-01T08:00', end: '2026-11-01T09:00', recurrenceType: 'daily', recurrenceEndDate: '2026-11-09' }),
        now,
      ),
    ).toBe(true);
  });
});
