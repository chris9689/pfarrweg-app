import { DAY_MS, expandAll } from './recurrence.js';
import type { Occurrence, Schedule, ScheduleException } from './types.js';

/** Weekly patterns repeat; one year past the latest start also covers every DST variation. */
export const CONFLICT_HORIZON_DAYS = 371;

export interface Conflict {
  candidate: Occurrence;
  existing: Occurrence;
}

/**
 * Finds the first future overlap involving any candidate schedule.
 * `others` are the remaining schedules of the same parking space.
 */
export function findConflict(
  candidates: Schedule[],
  others: Schedule[],
  exceptions: ScheduleException[],
  now: number,
): Conflict | null {
  if (candidates.length === 0) return null;
  const all = [...candidates, ...others];
  const latestStart = Math.max(now, ...all.map((s) => Date.parse(s.start)));
  const occurrences = expandAll(all, exceptions, now, latestStart + CONFLICT_HORIZON_DAYS * DAY_MS);
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (let i = 0; i < occurrences.length; i++) {
    const a = occurrences[i];
    for (let j = i + 1; j < occurrences.length && occurrences[j].start < a.end; j++) {
      const b = occurrences[j];
      const aCandidate = candidateIds.has(a.scheduleId);
      const bCandidate = candidateIds.has(b.scheduleId);
      if (!aCandidate && !bCandidate) continue;
      return aCandidate && !bCandidate ? { candidate: a, existing: b } : { candidate: b, existing: a };
    }
  }
  return null;
}
