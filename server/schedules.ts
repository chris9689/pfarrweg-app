import { findConflict, type Conflict } from '../shared/conflicts.js';
import { addDays, firstOccurrenceDate, isOccurrenceDate } from '../shared/recurrence.js';
import type { EditScope, Schedule, ScheduleException } from '../shared/types.js';
import { validateScheduleInput, type NormalizedSchedule } from '../shared/validation.js';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { ApiError, badRequest, forbidden, notFound } from './errors.js';
import * as repo from './repo.js';
import { assertReservationsCovered } from './reservations.js';

export type Actor = { kind: 'apartment'; apartmentId: string } | { kind: 'admin' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function conflictError(conflict: Conflict, spaceNumber: number) {
  return new ApiError(409, 'conflict', {
    spaceNumber,
    start: new Date(conflict.existing.start).toISOString(),
    end: new Date(conflict.existing.end).toISOString(),
  });
}

function validate(body: unknown, config: AppConfig, allowRepeat: boolean): NormalizedSchedule {
  const result = validateScheduleInput(body, config.timezone, config.now(), { allowRepeat });
  if (!result.ok) throw badRequest(result.code);
  return result.value;
}

function parseScope(value: unknown): EditScope {
  if (value === 'occurrence' || value === 'future' || value === 'series') return value;
  throw badRequest();
}

function logDetails(spaceNumber: number, s: Partial<Schedule>, extra: Record<string, unknown> = {}) {
  return {
    spaceNumber,
    start: s.start,
    end: s.end,
    recurrenceType: s.recurrenceType,
    recurrenceDays: s.recurrenceDays,
    recurrenceEndDate: s.recurrenceEndDate,
    ...extra,
  };
}

/** Loads a schedule and its space, enforcing that apartment actors own the space. */
async function loadOwned(db: Db, actor: Actor, scheduleId: unknown) {
  if (!isUuid(scheduleId)) throw notFound();
  const schedule = await repo.getSchedule(db, scheduleId);
  if (!schedule) throw notFound();
  const space = await repo.getSpace(db, schedule.parkingSpaceId);
  if (!space) throw notFound();
  if (actor.kind === 'apartment' && space.apartmentId !== actor.apartmentId) throw notFound();
  return { schedule, space };
}

/** Runs `fn` under the space lock with a fresh view of that space's schedules. */
async function withSpace<T>(
  db: Db,
  spaceId: string,
  scheduleId: string | null,
  fn: (tx: Db, ctx: { current: Schedule | null; others: Schedule[]; exceptions: ScheduleException[] }) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await repo.lockSpace(tx, spaceId);
    const all = await repo.listSchedules(tx, [spaceId]);
    const exceptions = await repo.listExceptions(
      tx,
      all.map((s) => s.id),
    );
    const current = scheduleId ? (all.find((s) => s.id === scheduleId) ?? null) : null;
    if (scheduleId && !current) throw notFound();
    return fn(tx, { current, others: all.filter((s) => s.id !== scheduleId), exceptions });
  });
}

const draft = (base: Partial<Schedule>, fields: NormalizedSchedule, id = 'draft'): Schedule => ({
  id,
  parkingSpaceId: base.parkingSpaceId!,
  timezone: base.timezone!,
  isActive: base.isActive ?? true,
  createdAt: '',
  updatedAt: '',
  ...fields,
});

const fieldsOf = (s: Schedule): repo.ScheduleFields => ({
  start: s.start,
  end: s.end,
  recurrenceType: s.recurrenceType,
  recurrenceDays: s.recurrenceDays,
  recurrenceEndDate: s.recurrenceEndDate,
  timezone: s.timezone,
  isActive: s.isActive,
});

export async function createSchedule(db: Db, config: AppConfig, actor: Actor, body: Record<string, unknown>) {
  const spaceId = body.parkingSpaceId;
  if (!isUuid(spaceId)) throw badRequest();
  const space = await repo.getSpace(db, spaceId);
  if (!space) throw notFound();
  if (actor.kind === 'apartment' && space.apartmentId !== actor.apartmentId) throw forbidden();
  const fields = validate(body, config, true);
  const candidate = draft({ parkingSpaceId: spaceId, timezone: config.timezone }, fields);

  return withSpace(db, spaceId, null, async (tx, { others, exceptions }) => {
    const conflict = findConflict([candidate], others, exceptions, config.now());
    if (conflict) throw conflictError(conflict, space.number);
    const created = await repo.insertSchedule(tx, spaceId, fieldsOf(candidate));
    await repo.logActivity(tx, {
      actor: actor.kind,
      action: 'schedule.created',
      apartmentId: space.apartmentId,
      parkingSpaceId: space.id,
      details: logDetails(space.number, created),
    });
    return created;
  });
}

export async function updateSchedule(
  db: Db,
  config: AppConfig,
  actor: Actor,
  scheduleId: string,
  body: Record<string, unknown>,
) {
  const { schedule, space } = await loadOwned(db, actor, scheduleId);
  let scope: EditScope = schedule.recurrenceType === 'none' ? 'series' : parseScope(body.scope);
  const occurrenceDate = body.occurrenceDate;
  if (scope !== 'series') {
    if (typeof occurrenceDate !== 'string' || !DATE_RE.test(occurrenceDate) || !isOccurrenceDate(schedule, occurrenceDate)) {
      throw badRequest();
    }
    if (scope === 'future' && (firstOccurrenceDate(schedule) ?? '') >= occurrenceDate) scope = 'series';
  }
  const fields = validate(body, config, scope !== 'occurrence');
  const now = config.now();

  return withSpace(db, space.id, schedule.id, async (tx, { current, others, exceptions }) => {
    const cur = current!;
    const log = (action: string, extra: Record<string, unknown>) =>
      repo.logActivity(tx, {
        actor: actor.kind,
        action,
        apartmentId: space.apartmentId,
        parkingSpaceId: space.id,
        details: logDetails(space.number, fields, extra),
      });

    if (scope === 'series') {
      const updated = draft({ ...cur, timezone: config.timezone }, fields, cur.id);
      const keepExceptions = updated.recurrenceType !== 'none';
      const exc = keepExceptions ? exceptions : exceptions.filter((e) => e.scheduleId !== cur.id);
      const conflict = findConflict([updated], others, exc, now);
      if (conflict) throw conflictError(conflict, space.number);
      await assertReservationsCovered(tx, space, [...others, updated], exc, now);
      await repo.updateSchedule(tx, cur.id, fieldsOf(updated));
      if (!keepExceptions) await repo.deleteExceptions(tx, cur.id);
      await log('schedule.updated', { scope });
      return;
    }

    const date = occurrenceDate as string;
    if (scope === 'occurrence') {
      const exception: ScheduleException = {
        id: 'draft',
        scheduleId: cur.id,
        occurrenceDate: date,
        type: 'modified',
        modifiedStart: fields.start,
        modifiedEnd: fields.end,
      };
      const exc = [...exceptions.filter((e) => !(e.scheduleId === cur.id && e.occurrenceDate === date)), exception];
      const conflict = findConflict([cur], others, exc, now);
      if (conflict) throw conflictError(conflict, space.number);
      await assertReservationsCovered(tx, space, [...others, cur], exc, now);
      await repo.upsertException(tx, exception);
      await log('occurrence.modified', { scope, occurrenceDate: date });
      return;
    }

    // scope === 'future': end the current series the day before and start a new one.
    const truncated: Schedule = { ...cur, recurrenceEndDate: addDays(date, -1) };
    const next = draft({ parkingSpaceId: cur.parkingSpaceId, timezone: config.timezone }, fields);
    const exc = exceptions.filter((e) => !(e.scheduleId === cur.id && e.occurrenceDate >= date));
    const conflict = findConflict([truncated, next], others, exc, now);
    if (conflict) throw conflictError(conflict, space.number);
    await assertReservationsCovered(tx, space, [...others, truncated, next], exc, now);
    await repo.updateSchedule(tx, cur.id, fieldsOf(truncated));
    await repo.deleteExceptions(tx, cur.id, date);
    await repo.insertSchedule(tx, space.id, fieldsOf({ ...next, isActive: true }));
    await log('schedule.updated', { scope, occurrenceDate: date });
  });
}

export async function deleteSchedule(
  db: Db,
  config: AppConfig,
  actor: Actor,
  scheduleId: string,
  scopeParam: unknown,
  occurrenceDate: unknown,
) {
  const { schedule, space } = await loadOwned(db, actor, scheduleId);
  let scope: EditScope = schedule.recurrenceType === 'none' ? 'series' : parseScope(scopeParam ?? 'series');
  if (scope !== 'series') {
    if (typeof occurrenceDate !== 'string' || !DATE_RE.test(occurrenceDate) || !isOccurrenceDate(schedule, occurrenceDate)) {
      throw badRequest();
    }
    if (scope === 'future' && (firstOccurrenceDate(schedule) ?? '') >= occurrenceDate) scope = 'series';
  }

  await withSpace(db, space.id, schedule.id, async (tx, { current, others, exceptions }) => {
    const cur = current!;
    const date = occurrenceDate as string;
    const details = logDetails(space.number, cur, { scope, occurrenceDate: scope === 'series' ? undefined : occurrenceDate });
    const ownExceptions = (keep: (e: ScheduleException) => boolean) =>
      exceptions.filter((e) => e.scheduleId !== cur.id || keep(e));
    const cancelled: ScheduleException = {
      id: 'draft',
      scheduleId: cur.id,
      occurrenceDate: date,
      type: 'cancelled',
      modifiedStart: null,
      modifiedEnd: null,
    };
    const truncated: Schedule = { ...cur, recurrenceEndDate: scope === 'future' ? addDays(date, -1) : cur.recurrenceEndDate };

    if (scope === 'series') {
      await assertReservationsCovered(tx, space, others, ownExceptions(() => false), config.now());
      await repo.deleteSchedule(tx, cur.id);
    } else if (scope === 'occurrence') {
      const exc = [...ownExceptions((e) => e.occurrenceDate !== date), cancelled];
      await assertReservationsCovered(tx, space, [...others, cur], exc, config.now());
      await repo.upsertException(tx, cancelled);
    } else {
      const exc = ownExceptions((e) => e.occurrenceDate < date);
      await assertReservationsCovered(tx, space, [...others, truncated], exc, config.now());
      await repo.updateSchedule(tx, cur.id, fieldsOf(truncated));
      await repo.deleteExceptions(tx, cur.id, date);
    }
    await repo.logActivity(tx, {
      actor: actor.kind,
      action: scope === 'occurrence' ? 'occurrence.cancelled' : 'schedule.deleted',
      apartmentId: space.apartmentId,
      parkingSpaceId: space.id,
      details,
    });
  });
}

export async function setScheduleActive(db: Db, config: AppConfig, actor: Actor, scheduleId: string, active: boolean) {
  const { schedule, space } = await loadOwned(db, actor, scheduleId);
  await withSpace(db, space.id, schedule.id, async (tx, { current, others, exceptions }) => {
    const updated = { ...current!, isActive: active };
    if (active) {
      const conflict = findConflict([updated], others, exceptions, config.now());
      if (conflict) throw conflictError(conflict, space.number);
    } else {
      await assertReservationsCovered(tx, space, [...others, updated], exceptions, config.now());
    }
    await repo.updateSchedule(tx, updated.id, fieldsOf(updated));
    await repo.logActivity(tx, {
      actor: actor.kind,
      action: active ? 'schedule.resumed' : 'schedule.paused',
      apartmentId: space.apartmentId,
      parkingSpaceId: space.id,
      details: logDetails(space.number, updated),
    });
  });
}
