import { describe, expect, it } from 'vitest';
import { findConflict } from '../shared/conflicts';
import { buildOverview, spaceState } from '../shared/status';
import { validateScheduleInput } from '../shared/validation';
import { at, exception, schedule, TZ, utc } from './helpers';

describe('space status', () => {
  const periods = [
    { start: at('2026-11-02T08:00'), end: at('2026-11-02T12:00') },
    { start: at('2026-11-02T12:00'), end: at('2026-11-02T18:00') },
    { start: at('2026-11-04T08:00'), end: at('2026-11-04T10:00') },
  ];

  it('is available during a period, until the end of back-to-back periods', () => {
    expect(spaceState(periods, at('2026-11-02T09:00'))).toEqual({ kind: 'available', until: at('2026-11-02T18:00') });
  });

  it('is upcoming before the next period (within 7 days)', () => {
    expect(spaceState(periods, at('2026-11-02T07:00'))).toEqual({
      kind: 'upcoming',
      from: at('2026-11-02T08:00'),
      until: at('2026-11-02T18:00'),
    });
  });

  it('returns to occupied automatically once the period has ended', () => {
    expect(spaceState(periods, at('2026-11-04T10:00')).kind).toBe('occupied');
    expect(spaceState([], at('2026-11-04T10:00')).kind).toBe('occupied');
  });

  it('treats periods more than 7 days away as occupied', () => {
    expect(spaceState([{ start: at('2026-11-20T08:00'), end: at('2026-11-20T10:00') }], at('2026-11-02T08:00')).kind).toBe(
      'occupied',
    );
  });

  it('builds the overview: available now, upcoming chronologically, all spaces', () => {
    const now = at('2026-11-02T10:00');
    const model = buildOverview(
      [8, 1, 2, 3],
      [
        { space: 3, start: utc('2026-11-02T09:00'), end: utc('2026-11-02T18:00') },
        { space: 2, start: utc('2026-11-03T08:00'), end: utc('2026-11-03T12:00') },
        { space: 8, start: utc('2026-11-02T15:00'), end: utc('2026-11-02T16:00') },
      ],
      now,
    );
    expect(model.availableNow).toEqual([{ space: 3, until: at('2026-11-02T18:00') }]);
    expect(model.upcoming.map((u) => u.space)).toEqual([8, 2]);
    expect(model.spaces.map((s) => [s.space, s.state.kind])).toEqual([
      [1, 'occupied'],
      [2, 'upcoming'],
      [3, 'available'],
      [8, 'upcoming'],
    ]);
  });
});

describe('conflict detection', () => {
  const now = at('2026-11-02T07:00');

  it('detects overlapping one-off periods', () => {
    const existing = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T12:00' });
    const candidate = schedule({ start: '2026-11-02T11:00', end: '2026-11-02T14:00' });
    const conflict = findConflict([candidate], [existing], [], now);
    expect(conflict?.existing.scheduleId).toBe(existing.id);
  });

  it('allows back-to-back periods', () => {
    const existing = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T12:00' });
    const candidate = schedule({ start: '2026-11-02T12:00', end: '2026-11-02T14:00' });
    expect(findConflict([candidate], [existing], [], now)).toBeNull();
  });

  it('detects a one-off clashing with a weekly series weeks later', () => {
    const weekly = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T17:00', recurrenceType: 'weekly' });
    const candidate = schedule({ start: '2026-11-23T16:00', end: '2026-11-23T20:00' });
    expect(findConflict([candidate], [weekly], [], now)).not.toBeNull();
  });

  it('allows recurring series on different days', () => {
    const monday = schedule({ start: '2026-11-02T08:00', end: '2026-11-02T17:00', recurrenceType: 'weekly' });
    const tuesday = schedule({ start: '2026-11-03T08:00', end: '2026-11-03T17:00', recurrenceType: 'weekly' });
    expect(findConflict([tuesday], [monday], [], now)).toBeNull();
  });

  it('detects selected weekdays clashing with a weekly series', () => {
    const days = schedule({
      start: '2026-11-02T08:00',
      end: '2026-11-02T12:00',
      recurrenceType: 'weekdays',
      recurrenceDays: [1, 3],
    });
    const wednesday = schedule({ start: '2026-11-04T11:00', end: '2026-11-04T13:00', recurrenceType: 'weekly' });
    expect(findConflict([wednesday], [days], [], now)).not.toBeNull();
  });

  it('detects clashes far in the future with an open-ended series', () => {
    const daily = schedule({ start: '2026-11-02T20:00', end: '2026-11-02T22:00', recurrenceType: 'daily' });
    const later = schedule({ start: '2027-06-15T21:00', end: '2027-06-15T23:00' });
    expect(findConflict([later], [daily], [], now)).not.toBeNull();
  });

  it('detects clashes with a series that only starts in the future', () => {
    const existing = schedule({ start: '2027-08-02T08:00', end: '2027-08-02T09:00', recurrenceType: 'weekly' });
    const candidate = schedule({ start: '2026-11-02T08:30', end: '2026-11-02T10:00', recurrenceType: 'daily' });
    expect(findConflict([candidate], [existing], [], now)).not.toBeNull();
  });

  it('ignores cancelled occurrences, paused schedules and the past', () => {
    const weekly = schedule({ id: 'w', start: '2026-11-02T08:00', end: '2026-11-02T17:00', recurrenceType: 'weekly', recurrenceEndDate: '2026-11-09' });
    const candidate = schedule({ start: '2026-11-09T10:00', end: '2026-11-09T11:00' });
    expect(findConflict([candidate], [weekly], [exception({ scheduleId: 'w', occurrenceDate: '2026-11-09' })], now)).toBeNull();
    expect(findConflict([candidate], [{ ...weekly, isActive: false }], [], now)).toBeNull();

    const past = schedule({ start: '2026-11-01T08:00', end: '2026-11-01T12:00' });
    const candidatePast = schedule({ start: '2026-11-01T09:00', end: '2026-11-02T09:00' });
    expect(findConflict([candidatePast], [past], [], now)).toBeNull();
  });

  it('detects a modified occurrence overlapping the next one of the same series', () => {
    const daily = schedule({ id: 'd', start: '2026-11-02T08:00', end: '2026-11-02T12:00', recurrenceType: 'daily' });
    const modified = exception({
      scheduleId: 'd',
      occurrenceDate: '2026-11-03',
      type: 'modified',
      modifiedStart: utc('2026-11-03T20:00'),
      modifiedEnd: utc('2026-11-04T09:00'),
    });
    expect(findConflict([daily], [], [modified], now)).not.toBeNull();
  });
});

describe('input validation', () => {
  const now = at('2026-11-02T10:00');
  const base = { startDate: '2026-11-02', startTime: '14:00', endDate: '2026-11-02', endTime: '18:00', repeat: null };
  const code = (input: unknown) => {
    const r = validateScheduleInput(input, TZ, now);
    return r.ok ? 'ok' : r.code;
  };

  it('accepts a valid one-off period and stores it in UTC', () => {
    const r = validateScheduleInput(base, TZ, now);
    expect(r.ok && r.value).toMatchObject({ start: '2026-11-02T13:00:00.000Z', end: '2026-11-02T17:00:00.000Z', recurrenceType: 'none' });
  });

  it('rejects malformed input', () => {
    expect(code(null)).toBe('invalid_input');
    expect(code({ ...base, startTime: '25:00' })).toBe('invalid_input');
    expect(code({ ...base, startDate: '2026-02-30' })).toBe('invalid_input');
    expect(code({ ...base, repeat: { type: 'hourly', days: [] } })).toBe('invalid_input');
    expect(code({ ...base, repeat: { type: 'weekdays', days: [8] } })).toBe('invalid_input');
  });

  it('checks ordering, past and limits', () => {
    expect(code({ ...base, endTime: '13:00' })).toBe('end_before_start');
    expect(code({ ...base, startTime: '06:00', endTime: '09:00' })).toBe('end_in_past');
    expect(code({ ...base, endDate: '2027-12-01' })).toBe('too_long');
    expect(code({ ...base, startDate: '2027-12-01', endDate: '2027-12-01' })).toBe('too_far_ahead');
  });

  it('accepts periods crossing midnight', () => {
    expect(code({ ...base, startTime: '22:00', endDate: '2026-11-03', endTime: '06:00' })).toBe('ok');
  });

  it('validates repetition', () => {
    expect(code({ ...base, repeat: { type: 'weekdays', days: [], until: null } })).toBe('days_required');
    expect(code({ ...base, repeat: { type: 'daily', days: [], until: '2026-11-01' } })).toBe('until_before_start');
    expect(code({ ...base, endDate: '2026-11-03', endTime: '15:00', repeat: { type: 'daily', days: [], until: null } })).toBe(
      'too_long_repeat',
    );
    expect(code({ ...base, endDate: '2026-11-04', repeat: { type: 'weekly', days: [], until: null } })).toBe('ok');
    expect(code({ ...base, repeat: { type: 'weekdays', days: [3, 1, 1], until: '2026-12-31' } })).toBe('ok');
    const r = validateScheduleInput({ ...base, repeat: { type: 'weekdays', days: [3, 1, 1], until: null } }, TZ, now);
    expect(r.ok && r.value.recurrenceDays).toEqual([1, 3]);
  });

  it('allows a recurring series that started in the past', () => {
    expect(code({ ...base, startDate: '2026-10-01', endDate: '2026-10-01', repeat: { type: 'weekly', days: [], until: null } })).toBe('ok');
  });

  it('handles a non-existent local time on the DST spring day', () => {
    const r = validateScheduleInput(
      { startDate: '2026-03-29', startTime: '02:30', endDate: '2026-03-29', endTime: '05:00', repeat: null },
      TZ,
      at('2026-03-01T00:00'),
    );
    expect(r.ok).toBe(true);
  });
});
