import type { ActivityEntry, AppNotification, Reservation, Schedule, ScheduleException } from '../shared/types.js';
import type { Db } from './db.js';

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString();
const pgArray = (values: (string | number)[]) => `{${values.join(',')}}`;

// ---------- apartments & spaces ----------

export interface ApartmentRow {
  id: string;
  name: string;
  codeHash: string | null;
  codeUpdatedAt: string | null;
}

export interface SpaceRow {
  id: string;
  number: number;
  apartmentId: string | null;
}

const toApartment = (r: Record<string, unknown>): ApartmentRow => ({
  id: r.id as string,
  name: r.name as string,
  codeHash: (r.access_code_hash as string | null) ?? null,
  codeUpdatedAt: r.code_updated_at ? iso(r.code_updated_at) : null,
});

const toSpace = (r: Record<string, unknown>): SpaceRow => ({
  id: r.id as string,
  number: Number(r.space_number),
  apartmentId: (r.apartment_id as string | null) ?? null,
});

export async function listApartments(db: Db): Promise<ApartmentRow[]> {
  const rows = await db.query('select * from apartments order by name, created_at');
  return rows.map(toApartment);
}

export async function getApartment(db: Db, id: string): Promise<ApartmentRow | null> {
  const [row] = await db.query('select * from apartments where id = $1', [id]);
  return row ? toApartment(row) : null;
}

export async function createApartment(db: Db, name: string): Promise<ApartmentRow> {
  const [row] = await db.query('insert into apartments (name) values ($1) returning *', [name]);
  return toApartment(row);
}

export async function renameApartment(db: Db, id: string, name: string): Promise<void> {
  await db.query('update apartments set name = $2 where id = $1', [id, name]);
}

export async function deleteApartment(db: Db, id: string): Promise<void> {
  await db.query('delete from apartments where id = $1', [id]);
}

export async function setApartmentCode(db: Db, id: string, codeHash: string): Promise<void> {
  await db.query('update apartments set access_code_hash = $2, code_updated_at = now() where id = $1', [id, codeHash]);
}

export async function listSpaces(db: Db, apartmentId?: string): Promise<SpaceRow[]> {
  const rows = apartmentId
    ? await db.query('select * from parking_spaces where apartment_id = $1 order by space_number', [apartmentId])
    : await db.query('select * from parking_spaces order by space_number');
  return rows.map(toSpace);
}

export async function getSpace(db: Db, id: string): Promise<SpaceRow | null> {
  const [row] = await db.query('select * from parking_spaces where id = $1', [id]);
  return row ? toSpace(row) : null;
}

export async function getSpaceByNumber(db: Db, spaceNumber: number): Promise<SpaceRow | null> {
  const [row] = await db.query('select * from parking_spaces where space_number = $1', [spaceNumber]);
  return row ? toSpace(row) : null;
}

export async function assignSpace(db: Db, id: string, apartmentId: string | null): Promise<void> {
  await db.query('update parking_spaces set apartment_id = $2 where id = $1', [id, apartmentId]);
}

/** Serialises all schedule changes for one space inside the current transaction. */
export async function lockSpace(db: Db, spaceId: string): Promise<void> {
  await db.query('select pg_advisory_xact_lock(hashtext($1))', [`space:${spaceId}`]);
}

// ---------- schedules ----------

const SCHEDULE_COLUMNS = `id, parking_space_id, start_datetime, end_datetime, recurrence_type, recurrence_days,
  recurrence_end_date::text as recurrence_end_date, timezone, is_active, created_at, updated_at`;

const toSchedule = (r: Record<string, unknown>): Schedule => ({
  id: r.id as string,
  parkingSpaceId: r.parking_space_id as string,
  start: iso(r.start_datetime),
  end: iso(r.end_datetime),
  recurrenceType: r.recurrence_type as Schedule['recurrenceType'],
  recurrenceDays: ((r.recurrence_days as number[] | null) ?? []).map(Number),
  recurrenceEndDate: (r.recurrence_end_date as string | null) ?? null,
  timezone: r.timezone as string,
  isActive: Boolean(r.is_active),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export type ScheduleFields = Pick<
  Schedule,
  'start' | 'end' | 'recurrenceType' | 'recurrenceDays' | 'recurrenceEndDate' | 'timezone' | 'isActive'
>;

export async function listSchedules(db: Db, spaceIds?: string[]): Promise<Schedule[]> {
  const rows = spaceIds
    ? await db.query(
        `select ${SCHEDULE_COLUMNS} from availability_schedules where parking_space_id = any($1::uuid[]) order by start_datetime`,
        [pgArray(spaceIds)],
      )
    : await db.query(`select ${SCHEDULE_COLUMNS} from availability_schedules order by start_datetime`);
  return rows.map(toSchedule);
}

export async function getSchedule(db: Db, id: string): Promise<Schedule | null> {
  const [row] = await db.query(`select ${SCHEDULE_COLUMNS} from availability_schedules where id = $1`, [id]);
  return row ? toSchedule(row) : null;
}

export async function insertSchedule(db: Db, spaceId: string, f: ScheduleFields): Promise<Schedule> {
  const [row] = await db.query(
    `insert into availability_schedules
       (parking_space_id, start_datetime, end_datetime, recurrence_type, recurrence_days, recurrence_end_date, timezone, is_active)
     values ($1, $2, $3, $4, $5::smallint[], $6::date, $7, $8)
     returning ${SCHEDULE_COLUMNS}`,
    [spaceId, f.start, f.end, f.recurrenceType, pgArray(f.recurrenceDays), f.recurrenceEndDate, f.timezone, f.isActive],
  );
  return toSchedule(row);
}

export async function updateSchedule(db: Db, id: string, f: ScheduleFields): Promise<void> {
  await db.query(
    `update availability_schedules set start_datetime = $2, end_datetime = $3, recurrence_type = $4,
       recurrence_days = $5::smallint[], recurrence_end_date = $6::date, timezone = $7, is_active = $8, updated_at = now()
     where id = $1`,
    [id, f.start, f.end, f.recurrenceType, pgArray(f.recurrenceDays), f.recurrenceEndDate, f.timezone, f.isActive],
  );
}

export async function deleteSchedule(db: Db, id: string): Promise<void> {
  await db.query('delete from availability_schedules where id = $1', [id]);
}

// ---------- exceptions ----------

const toException = (r: Record<string, unknown>): ScheduleException => ({
  id: r.id as string,
  scheduleId: r.schedule_id as string,
  occurrenceDate: r.occurrence_date as string,
  type: r.exception_type as ScheduleException['type'],
  modifiedStart: r.modified_start_datetime ? iso(r.modified_start_datetime) : null,
  modifiedEnd: r.modified_end_datetime ? iso(r.modified_end_datetime) : null,
});

export async function listExceptions(db: Db, scheduleIds: string[]): Promise<ScheduleException[]> {
  if (scheduleIds.length === 0) return [];
  const rows = await db.query(
    `select id, schedule_id, occurrence_date::text as occurrence_date, exception_type,
       modified_start_datetime, modified_end_datetime
     from availability_exceptions where schedule_id = any($1::uuid[]) order by occurrence_date`,
    [pgArray(scheduleIds)],
  );
  return rows.map(toException);
}

export async function upsertException(db: Db, e: Omit<ScheduleException, 'id'>): Promise<void> {
  await db.query(
    `insert into availability_exceptions (schedule_id, occurrence_date, exception_type, modified_start_datetime, modified_end_datetime)
     values ($1, $2::date, $3, $4, $5)
     on conflict (schedule_id, occurrence_date) do update set exception_type = excluded.exception_type,
       modified_start_datetime = excluded.modified_start_datetime, modified_end_datetime = excluded.modified_end_datetime`,
    [e.scheduleId, e.occurrenceDate, e.type, e.modifiedStart, e.modifiedEnd],
  );
}

export async function deleteExceptions(db: Db, scheduleId: string, fromDate?: string): Promise<void> {
  if (fromDate) {
    await db.query('delete from availability_exceptions where schedule_id = $1 and occurrence_date >= $2::date', [
      scheduleId,
      fromDate,
    ]);
  } else {
    await db.query('delete from availability_exceptions where schedule_id = $1', [scheduleId]);
  }
}

// ---------- sessions & login attempts ----------

export interface SessionRow {
  kind: 'apartment' | 'admin';
  apartmentId: string | null;
}

export async function createSession(
  db: Db,
  tokenHash: string,
  kind: SessionRow['kind'],
  apartmentId: string | null,
  expiresAt: Date,
): Promise<void> {
  await db.query('insert into sessions (token_hash, kind, apartment_id, expires_at) values ($1, $2, $3, $4)', [
    tokenHash,
    kind,
    apartmentId,
    expiresAt,
  ]);
}

export async function findSession(db: Db, tokenHash: string, kind: SessionRow['kind'], now: Date) {
  const [row] = await db.query<{ kind: SessionRow['kind']; apartment_id: string | null }>(
    'select kind, apartment_id from sessions where token_hash = $1 and kind = $2 and expires_at > $3',
    [tokenHash, kind, now],
  );
  return row ? { kind: row.kind, apartmentId: row.apartment_id } : null;
}

export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [tokenHash]);
}

export async function deleteApartmentSessions(db: Db, apartmentId: string): Promise<void> {
  await db.query('delete from sessions where apartment_id = $1', [apartmentId]);
}

export async function recordLoginAttempt(
  db: Db,
  clientKey: string,
  kind: SessionRow['kind'],
  success: boolean,
  at: Date,
) {
  await db.query('insert into login_attempts (client_key, kind, success, attempted_at) values ($1, $2, $3, $4)', [
    clientKey,
    kind,
    success,
    at,
  ]);
}

export async function countFailedAttempts(db: Db, kind: SessionRow['kind'], since: Date, clientKey?: string) {
  const [row] = clientKey
    ? await db.query<{ n: number }>(
        'select count(*)::int as n from login_attempts where kind = $1 and success = false and attempted_at > $2 and client_key = $3',
        [kind, since, clientKey],
      )
    : await db.query<{ n: number }>(
        'select count(*)::int as n from login_attempts where kind = $1 and success = false and attempted_at > $2',
        [kind, since],
      );
  return Number(row?.n ?? 0);
}

/** Housekeeping without background jobs: runs opportunistically on login. */
export async function purgeStaleAuthData(db: Db, now: Date): Promise<void> {
  await db.query('delete from sessions where expires_at < $1', [now]);
  await db.query("delete from login_attempts where attempted_at < $1::timestamptz - interval '2 days'", [now]);
  await db.query("delete from notifications where created_at < $1::timestamptz - interval '30 days'", [now]);
}

// ---------- reservations ----------

const toReservation = (r: Record<string, unknown>): Reservation => ({
  id: r.id as string,
  parkingSpaceId: r.parking_space_id as string,
  spaceNumber: Number(r.space_number),
  apartmentId: r.apartment_id as string,
  apartmentName: r.apartment_name as string,
  start: iso(r.start_datetime),
  end: iso(r.end_datetime),
  createdAt: iso(r.created_at),
});

const RESERVATION_SELECT = `select r.id, r.parking_space_id, s.space_number, r.apartment_id, a.name as apartment_name,
    r.start_datetime, r.end_datetime, r.created_at
  from reservations r
  join parking_spaces s on s.id = r.parking_space_id
  join apartments a on a.id = r.apartment_id`;

/** Reservations still running or in the future, optionally filtered. */
export async function listReservations(
  db: Db,
  endsAfter: Date,
  filter: { spaceIds?: string[]; apartmentId?: string } = {},
): Promise<Reservation[]> {
  const conditions = ['r.end_datetime > $1'];
  const params: unknown[] = [endsAfter];
  if (filter.spaceIds) {
    params.push(pgArray(filter.spaceIds));
    conditions.push(`r.parking_space_id = any($${params.length}::uuid[])`);
  }
  if (filter.apartmentId) {
    params.push(filter.apartmentId);
    conditions.push(`r.apartment_id = $${params.length}`);
  }
  const rows = await db.query(
    `${RESERVATION_SELECT} where ${conditions.join(' and ')} order by r.start_datetime`,
    params,
  );
  return rows.map(toReservation);
}

export async function getReservation(db: Db, id: string): Promise<Reservation | null> {
  const [row] = await db.query(`${RESERVATION_SELECT} where r.id = $1`, [id]);
  return row ? toReservation(row) : null;
}

export async function insertReservation(
  db: Db,
  r: { spaceId: string; apartmentId: string; start: string; end: string },
): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    'insert into reservations (parking_space_id, apartment_id, start_datetime, end_datetime) values ($1, $2, $3, $4) returning id',
    [r.spaceId, r.apartmentId, r.start, r.end],
  );
  return row.id;
}

/** Returns false if the reservation no longer existed. */
export async function deleteReservation(db: Db, id: string): Promise<boolean> {
  const rows = await db.query('delete from reservations where id = $1 returning id', [id]);
  return rows.length > 0;
}

// ---------- notifications ----------

export async function insertNotification(
  db: Db,
  apartmentId: string,
  kind: AppNotification['kind'],
  details: Record<string, unknown>,
): Promise<void> {
  await db.query('insert into notifications (apartment_id, kind, details) values ($1, $2, $3::jsonb)', [
    apartmentId,
    kind,
    JSON.stringify(details),
  ]);
}

export async function listUnreadNotifications(db: Db, apartmentId: string): Promise<AppNotification[]> {
  const rows = await db.query(
    'select id, kind, details, created_at from notifications where apartment_id = $1 and read_at is null order by created_at',
    [apartmentId],
  );
  return rows.map((r) => {
    const d = (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) as Record<string, unknown>;
    return {
      id: r.id as string,
      kind: r.kind as AppNotification['kind'],
      createdAt: iso(r.created_at),
      spaceNumber: Number(d.spaceNumber),
      start: String(d.start),
      end: String(d.end),
      cancelledBy: (d.cancelledBy as string | null) ?? null,
      message: (d.message as string | null) ?? null,
    };
  });
}

export async function markNotificationRead(db: Db, apartmentId: string, id: string, at: Date): Promise<void> {
  await db.query('update notifications set read_at = $3 where id = $1 and apartment_id = $2 and read_at is null', [
    id,
    apartmentId,
    at,
  ]);
}

// ---------- activity log ----------

export interface ActivityInput {
  actor: 'apartment' | 'admin';
  action: string;
  apartmentId?: string | null;
  parkingSpaceId?: string | null;
  details?: Record<string, unknown>;
}

export async function logActivity(db: Db, a: ActivityInput): Promise<void> {
  await db.query(
    'insert into activity_log (actor, action, apartment_id, parking_space_id, details) values ($1, $2, $3, $4, $5::jsonb)',
    [a.actor, a.action, a.apartmentId ?? null, a.parkingSpaceId ?? null, JSON.stringify(a.details ?? {})],
  );
}

export async function listActivity(db: Db, limit = 200): Promise<ActivityEntry[]> {
  const rows = await db.query(
    `select l.id, l.created_at, l.actor, l.action, l.details, a.name as apartment_name, s.space_number
     from activity_log l
     left join apartments a on a.id = l.apartment_id
     left join parking_spaces s on s.id = l.parking_space_id
     order by l.created_at desc, l.id desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    createdAt: iso(r.created_at),
    actor: r.actor as ActivityEntry['actor'],
    action: r.action as string,
    apartmentName: (r.apartment_name as string | null) ?? null,
    spaceNumber: r.space_number == null ? null : Number(r.space_number),
    details: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) as Record<string, unknown>,
  }));
}
