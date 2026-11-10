import { DateTime } from 'luxon';

/** Calendar export from the waste management portal; to update, replace the file under the same name. */
export const WASTE_CALENDAR_URL = '/abfuhrtermine.ics';

/** House-rules duty rotates weekly (Monday–Sunday) in this order. */
export const HOUSE_RULES_ROTATION = ['Schmidt', 'Gross/Meixner', 'Junker/Jehnichen'];
/** Monday of a week in which the first entry of the rotation is on duty. */
const HOUSE_RULES_ANCHOR = '2026-11-09';

export function houseRulesDuty(today: string): { current: string; next: string } {
  const monday = DateTime.fromISO(today, { zone: 'utc' }).startOf('week');
  const weeks = Math.round(monday.diff(DateTime.fromISO(HOUSE_RULES_ANCHOR, { zone: 'utc' }), 'weeks').weeks);
  const n = HOUSE_RULES_ROTATION.length;
  const at = (offset: number) => HOUSE_RULES_ROTATION[(((weeks + offset) % n) + n) % n];
  return { current: at(0), next: at(1) };
}

export type BinKind = 'residual' | 'paper' | 'yellow' | 'organic' | 'other';

export interface Pickup {
  /** Local date YYYY-MM-DD. */
  date: string;
  kind: BinKind;
  summary: string;
}

export function binKind(summary: string): BinKind {
  const s = summary.toLowerCase();
  if (s.includes('rest')) return 'residual';
  if (s.includes('papier') || s.includes('pappe')) return 'paper';
  if (s.includes('gelb') || s.includes('wertstoff') || s.includes('verpackung')) return 'yellow';
  if (s.includes('bio')) return 'organic';
  return 'other';
}

/** Minimal iCalendar reader: one pickup per VEVENT (DTSTART date + SUMMARY). */
export function parseWasteCalendar(text: string): Pickup[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '') // unfold continuation lines
    .split('\n');
  const pickups: Pickup[] = [];
  let event: { date?: string; summary?: string } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT') {
      if (event?.date && event.summary) pickups.push({ date: event.date, summary: event.summary, kind: binKind(event.summary) });
      event = null;
    } else if (event) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(';')[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (name === 'DTSTART') {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
        if (m) event.date = `${m[1]}-${m[2]}-${m[3]}`;
      } else if (name === 'SUMMARY') {
        event.summary = value.replace(/\\n/gi, ' ').replace(/\\(.)/g, '$1').trim();
      }
    }
  }
  return pickups.sort((a, b) => a.date.localeCompare(b.date));
}

/** The next pickup (today or later) of each bin type, soonest first. */
export function nextPickups(pickups: Pickup[], today: string): Pickup[] {
  const next = new Map<string, Pickup>();
  for (const p of pickups) {
    const key = p.kind === 'other' ? p.summary : p.kind;
    if (p.date >= today && !next.has(key)) next.set(key, p);
  }
  return [...next.values()].sort((a, b) => a.date.localeCompare(b.date));
}
