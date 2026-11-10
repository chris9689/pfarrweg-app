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

const MAX_MESSAGE_LENGTH = 200;

function parseMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > MAX_MESSAGE_LENGTH) throw badRequest();
  return value.trim() || null;
}

const oneOffFields = (timezone: string, start: number, end: number): repo.ScheduleFields => ({
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
  recurrenceType: 'none',
  recurrenceDays: [],
  recurrenceEndDate: null,
  timezone,
  isActive: true,
});

/**
 * Cuts [start, end) out of a space's availability: one-off periods are shortened, split or deleted;
 * recurring dates get a `modified`/`cancelled` exception (plus a one-off for a remainder after the gap).
 */
async function removeAvailability(tx: Db, spaceId: string, start: number, end: number) {
  const schedules = await repo.listSchedules(tx, [spaceId]);
  const exceptions = await repo.listExceptions(
    tx,
    schedules.map((s) => s.id),
  );
  for (const o of expandAll(schedules, exceptions, start, end)) {
    const s = schedules.find((x) => x.id === o.scheduleId)!;
    const [keep, rest] = [
      { start: o.start, end: start },
      { start: end, end: o.end },
    ].filter((p) => p.end > p.start);
    if (s.recurrenceType === 'none') {
      if (keep) await repo.updateSchedule(tx, s.id, oneOffFields(s.timezone, keep.start, keep.end));
      else await repo.deleteSchedule(tx, s.id);
    } else {
      await repo.upsertException(tx, {
        scheduleId: s.id,
        occurrenceDate: o.occurrenceDate,
        type: keep ? 'modified' : 'cancelled',
        modifiedStart: keep ? new Date(keep.start).toISOString() : null,
        modifiedEnd: keep ? new Date(keep.end).toISOString() : null,
      });
    }
    if (rest) await repo.insertSchedule(tx, spaceId, oneOffFields(s.timezone, rest.start, rest.end));
  }
}

/**
 * The reserving apartment, the space owner (only before the reservation starts) or the administrator can cancel.
 * When someone else cancels, the reserving apartment gets an in-app notice.
 */
export async function cancelReservation(
  db: Db,
  config: AppConfig,
  actor: Actor,
  id: unknown,
  body: Record<string, unknown> = {},
) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw notFound();
  const reservation = await repo.getReservation(db, id);
  if (!reservation) throw notFound();
  const space = await repo.getSpace(db, reservation.parkingSpaceId);
  const byGuest = actor.kind === 'apartment' && reservation.apartmentId === actor.apartmentId;
  const ownerId =
    !byGuest && actor.kind === 'apartment' && space?.apartmentId === actor.apartmentId ? actor.apartmentId : null;
  if (actor.kind === 'apartment' && !byGuest && !ownerId) throw notFound();
  if (ownerId && Date.parse(reservation.start) <= config.now()) throw new ApiError(409, 'reservation_started');
  const message = byGuest ? null : parseMessage(body.message);
  const cutAvailability = ownerId !== null && body.removeAvailability === true;
  const owner = ownerId ? await repo.getApartment(db, ownerId) : null;

  await db.transaction(async (tx) => {
    await repo.lockSpace(tx, reservation.parkingSpaceId);
    if (!(await repo.deleteReservation(tx, id))) throw notFound();
    if (cutAvailability) {
      await removeAvailability(tx, reservation.parkingSpaceId, Date.parse(reservation.start), Date.parse(reservation.end));
    }
    if (!byGuest) {
      await repo.insertNotification(tx, reservation.apartmentId, 'reservation_cancelled', {
        spaceNumber: reservation.spaceNumber,
        start: reservation.start,
        end: reservation.end,
        cancelledBy: owner?.name ?? null,
        message,
      });
    }
    const details = { spaceNumber: reservation.spaceNumber, start: reservation.start, end: reservation.end };
    if (ownerId) {
      await repo.logActivity(tx, {
        actor: 'apartment',
        action: 'reservation.removed',
        apartmentId: ownerId,
        parkingSpaceId: reservation.parkingSpaceId,
        details: { ...details, name: reservation.apartmentName, availabilityRemoved: cutAvailability },
      });
    } else {
      await repo.logActivity(tx, {
        actor: actor.kind,
        action: 'reservation.cancelled',
        apartmentId: reservation.apartmentId,
        parkingSpaceId: reservation.parkingSpaceId,
        details,
      });
    }
  });
}
