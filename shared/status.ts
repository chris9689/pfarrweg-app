import { DAY_MS, mergeBlocks } from './recurrence.js';
import type { AvailabilityBlock } from './types.js';

export const UPCOMING_WINDOW_MS = 7 * DAY_MS;

export type SpaceState =
  | { kind: 'available'; until: number }
  | { kind: 'upcoming'; from: number; until: number }
  | { kind: 'occupied' };

export interface Period {
  start: number;
  end: number;
}

/** Status of one space at `now`, derived purely from its availability periods. */
export function spaceState(periods: Period[], now: number): SpaceState {
  const blocks = mergeBlocks(periods);
  const current = blocks.find((b) => b.start <= now && b.end > now);
  if (current) return { kind: 'available', until: current.end };
  const next = blocks.find((b) => b.start > now && b.start - now <= UPCOMING_WINDOW_MS);
  if (next) return { kind: 'upcoming', from: next.start, until: next.end };
  return { kind: 'occupied' };
}

export interface OverviewModel {
  availableNow: { space: number; until: number }[];
  upcoming: { space: number; start: number; end: number }[];
  spaces: { space: number; state: SpaceState }[];
}

export function buildOverview(
  spaces: number[],
  blocks: AvailabilityBlock[],
  now: number,
  upcomingLimit = 6,
): OverviewModel {
  const bySpace = new Map<number, Period[]>();
  for (const b of blocks) {
    const list = bySpace.get(b.space) ?? [];
    list.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
    bySpace.set(b.space, list);
  }

  const states = [...spaces]
    .sort((a, b) => a - b)
    .map((space) => ({ space, state: spaceState(bySpace.get(space) ?? [], now) }));

  const availableNow = states.flatMap(({ space, state }) =>
    state.kind === 'available' ? [{ space, until: state.until }] : [],
  );

  const upcoming = [...bySpace.entries()]
    .flatMap(([space, periods]) =>
      mergeBlocks(periods)
        .filter((b) => b.start > now && b.start - now <= UPCOMING_WINDOW_MS)
        .map((b) => ({ space, start: b.start, end: b.end })),
    )
    .sort((a, b) => a.start - b.start || a.space - b.space)
    .slice(0, upcomingLimit);

  return { availableNow, upcoming, spaces: states };
}
