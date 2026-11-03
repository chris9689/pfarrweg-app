import { DAY_MS, mergeBlocks } from './recurrence.js';
import type { AvailabilityBlock, ReservationBlock } from './types.js';

export const UPCOMING_WINDOW_MS = 7 * DAY_MS;

export type SpaceState =
  | { kind: 'available'; until: number }
  | { kind: 'upcoming'; from: number; until: number }
  | { kind: 'reserved'; until: number; by: string | null }
  | { kind: 'occupied' };

export interface Period {
  start: number;
  end: number;
}

export interface ReservedPeriod extends Period {
  by?: string | null;
}

/** Availability minus reserved time: the periods anybody may still use or reserve. */
export function freePeriods(availability: Period[], reserved: Period[]): Period[] {
  const cuts = mergeBlocks(reserved);
  const out: Period[] = [];
  for (const block of mergeBlocks(availability)) {
    let cursor = block.start;
    for (const r of cuts) {
      if (r.end <= cursor || r.start >= block.end) continue;
      if (r.start > cursor) out.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    }
    if (cursor < block.end) out.push({ start: cursor, end: block.end });
  }
  return out;
}

/** Status of one space at `now`, derived purely from its availability and reservations. */
export function spaceState(availability: Period[], now: number, reserved: ReservedPeriod[] = []): SpaceState {
  const reservation = reserved.find((r) => r.start <= now && r.end > now);
  if (reservation) return { kind: 'reserved', until: reservation.end, by: reservation.by ?? null };
  const free = freePeriods(availability, reserved);
  const current = free.find((b) => b.start <= now && b.end > now);
  if (current) return { kind: 'available', until: current.end };
  const next = free.find((b) => b.start > now && b.start - now <= UPCOMING_WINDOW_MS);
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
  { reservations = [], upcomingLimit = 6 }: { reservations?: ReservationBlock[]; upcomingLimit?: number } = {},
): OverviewModel {
  const group = <T extends { space: number }, P>(items: T[], map: (item: T) => P) => {
    const bySpace = new Map<number, P[]>();
    for (const item of items) bySpace.set(item.space, [...(bySpace.get(item.space) ?? []), map(item)]);
    return bySpace;
  };
  const availability = group(blocks, (b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const reserved = group(reservations, (r) => ({ start: Date.parse(r.start), end: Date.parse(r.end), by: r.apartment }));

  const sorted = [...spaces].sort((a, b) => a - b);
  const states = sorted.map((space) => ({
    space,
    state: spaceState(availability.get(space) ?? [], now, reserved.get(space) ?? []),
  }));

  const availableNow = states.flatMap(({ space, state }) =>
    state.kind === 'available' ? [{ space, until: state.until }] : [],
  );

  const upcoming = sorted
    .flatMap((space) =>
      freePeriods(availability.get(space) ?? [], reserved.get(space) ?? [])
        .filter((b) => b.start > now && b.start - now <= UPCOMING_WINDOW_MS)
        .map((b) => ({ space, start: b.start, end: b.end })),
    )
    .sort((a, b) => a.start - b.start || a.space - b.space)
    .slice(0, upcomingLimit);

  return { availableNow, upcoming, spaces: states };
}
