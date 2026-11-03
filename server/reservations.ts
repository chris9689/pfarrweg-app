import { DAY_MS, expandAll, mergeBlocks } from '../shared/recurrence.js';
import type { Schedule, ScheduleException } from '../shared/types.js';
import { validateScheduleInput } from '../shared/validation.js';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { ApiError, badRequest, notFound } from './errors.js';
import * as repo from './repo.js';
import type { Actor } from './schedules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when [start, end) lies completely inside one continuous availability period. */
function isCovered(schedules: Schedule[], exceptions: ScheduleException[], start: number, end: number) {
  const blocks = mergeBlocks(expandAll(schedules, exceptions, start - DAY_MS, end + DAY_MS));
  return blocks.some((b) => b.start <= start && b.end >= end);
}

/**
 * Owners must not remove time that someone has reserved: throws if any future reservation of the
 * space would no longer be covered by the space's availability after a change.
 */
export async function assertReservationsCovered(
  tx: Db,
  space: { id: string; number: number },
  schedulesAfter: Schedule[],
  exceptionsAfter: ScheduleException[],
  now: number,
) {
  const reservations = await repo.listReservations(tx, new Date(now), { spaceIds: [space.id] });
  for (const r of reservations) {
    const start = Math.max(Date.parse(r.start), now);
    if (!isCovered(schedulesAfter, exceptionsAfter, start, Date.parse(r.end))) {
      throw new ApiError(409, 'reserved', { spaceNumber: space.number, start: r.start, end: r.end });
    }
  }
}

export async function createReservation(db: Db, config: AppConfig, apartmentId: string, body: Record<string, unknown>) {
  const spaceNumber = body.spaceNumber;
  if (typeof spaceNumber !== 'number' || !Number.isInteger(spaceNumber)) throw badRequest();
  const space = await repo.getSpaceByNumber(db, spaceNumber);
  if (!space) throw notFound();
  if (space.apartmentId === apartmentId) throw badRequest('own_space');

  const now = config.now();
  const result = validateScheduleInput({ ...body, repeat: null }, config.timezone, now, { allowRepeat: false });
  if (!result.ok) throw badRequest(result.code);
  const { start, end } = result.value;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  return db.transaction(async (tx) => {
    await repo.lockSpace(tx, space.id);
    const schedules = await repo.listSchedules(tx, [space.id]);
    const exceptions = await repo.listExceptions(
      tx,
      schedules.map((s) => s.id),
    );
    if (!isCovered(schedules, exceptions, Math.max(startMs, now), endMs)) {
      throw new ApiError(409, 'not_available', { spaceNumber: space.number });
    }
    const existing = await repo.listReservations(tx, new Date(now), { spaceIds: [space.id] });
    const clash = existing.find((r) => Date.parse(r.start) < endMs && Date.parse(r.end) > startMs);
    if (clash) {
      throw new ApiError(409, 'already_reserved', { spaceNumber: space.number, start: clash.start, end: clash.end });
    }
    const id = await repo.insertReservation(tx, { spaceId: space.id, apartmentId, start, end });
    await repo.logActivity(tx, {
      actor: 'apartment',
      action: 'reservation.created',
      apartmentId,
      parkingSpaceId: space.id,
      details: { spaceNumber: space.number, start, end },
    });
    return { id, spaceNumber: space.number, start, end };
  });
}

/** Only the reserving apartment (or the administrator) can cancel – not the space owner. */
export async function cancelReservation(db: Db, actor: Actor, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw notFound();
  const reservation = await repo.getReservation(db, id);
  if (!reservation) throw notFound();
  if (actor.kind === 'apartment' && reservation.apartmentId !== actor.apartmentId) throw notFound();
  await repo.deleteReservation(db, id);
  await repo.logActivity(db, {
    actor: actor.kind,
    action: 'reservation.cancelled',
    apartmentId: reservation.apartmentId,
    parkingSpaceId: reservation.parkingSpaceId,
    details: { spaceNumber: reservation.spaceNumber, start: reservation.start, end: reservation.end },
  });
}
