import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { binKind, houseRulesDuty, nextPickups, parseWasteCalendar } from '../src/lib/info';

describe('house rules rotation', () => {
  it('rotates weekly (Monday–Sunday) through the three households', () => {
    expect(houseRulesDuty('2026-11-09')).toEqual({ current: 'Schmidt', next: 'Gross/Meixner' });
    expect(houseRulesDuty('2026-11-15')).toEqual({ current: 'Schmidt', next: 'Gross/Meixner' });
    expect(houseRulesDuty('2026-11-16')).toEqual({ current: 'Gross/Meixner', next: 'Junker/Jehnichen' });
    expect(houseRulesDuty('2026-11-25')).toEqual({ current: 'Junker/Jehnichen', next: 'Schmidt' });
    expect(houseRulesDuty('2026-11-30').current).toBe('Schmidt');
    expect(houseRulesDuty('2027-04-05').current).toBe('Schmidt'); // 21 weeks later, across DST
  });

  it('also works for weeks before the reference week', () => {
    expect(houseRulesDuty('2026-11-08').current).toBe('Junker/Jehnichen');
    expect(houseRulesDuty('2026-10-19').current).toBe('Schmidt');
  });
});

describe('waste calendar', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261121',
    'SUMMARY;LANGUAGE=de:Gelber Sack\\, Gelbe',
    '  Tonne',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261116',
    'SUMMARY;LANGUAGE=de:Restmuelltonne 02-woechentl.',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261130',
    'SUMMARY:Restmuelltonne 02-woechentl.',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261201',
    'SUMMARY:Schadstoffmobil',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('reads date and summary of every event (folded lines, escapes, parameters)', () => {
    expect(parseWasteCalendar(ics)).toEqual([
      { date: '2026-11-16', kind: 'residual', summary: 'Restmuelltonne 02-woechentl.' },
      { date: '2026-11-21', kind: 'yellow', summary: 'Gelber Sack, Gelbe Tonne' },
      { date: '2026-11-30', kind: 'residual', summary: 'Restmuelltonne 02-woechentl.' },
      { date: '2026-12-01', kind: 'other', summary: 'Schadstoffmobil' },
    ]);
  });

  it('classifies the common bin types', () => {
    expect(binKind('Papiertonne 04-woechentl.')).toBe('paper');
    expect(binKind('Biotonne')).toBe('organic');
    expect(binKind('Gelbe Tonne')).toBe('yellow');
  });

  it('lists the next pickup per bin type from today on', () => {
    const pickups = parseWasteCalendar(ics);
    expect(nextPickups(pickups, '2026-11-16').map((p) => p.date)).toEqual(['2026-11-16', '2026-11-21', '2026-12-01']);
    expect(nextPickups(pickups, '2026-11-17').map((p) => p.date)).toEqual(['2026-11-21', '2026-11-30', '2026-12-01']);
    expect(nextPickups(pickups, '2027-01-01')).toEqual([]);
  });

  it('parses the calendar file shipped in public/', () => {
    const pickups = parseWasteCalendar(readFileSync('public/abfuhrtermine.ics', 'utf8'));
    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.every((p) => p.kind !== 'other')).toBe(true);
  });
});
