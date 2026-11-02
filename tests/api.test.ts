import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App, type AppResponse } from '../server/app';
import type { AppConfig } from '../server/config';
import type { Db } from '../server/db';
import { createPgliteDb } from '../server/db-pglite';
import * as repo from '../server/repo';
import { hashSecret } from '../server/security';
import type { MeResponse, OverviewResponse } from '../shared/types';
import { at, TZ } from './helpers';

const CODES = ['11111111', '22222222', '33333333', '44444444'];
const ADMIN_PASSWORD = 'correct horse battery staple';

let db: Db;
let app: App;
let clock = at('2026-11-02T09:00');
let adminHash: string;
const config: AppConfig = {
  timezone: TZ,
  buildingName: 'Test',
  adminPasswordHash: null,
  secureCookies: true,
  now: () => clock,
};

let ipCounter = 0;

/** Minimal cookie-aware client calling the framework-agnostic handler. */
function client(ip = `10.0.0.${++ipCounter}`) {
  const jar = new Map<string, string>();
  return {
    jar,
    async call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<AppResponse & { json: any }> {
      const res = await app.handle({
        method,
        url,
        ip,
        body,
        headers: {
          host: 'parkshare.test',
          'content-type': 'application/json',
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          ...headers,
        },
      });
      for (const c of ([] as string[]).concat(res.headers['Set-Cookie'] ?? [])) {
        const [pair] = c.split(';');
        const [name, value] = pair.split('=');
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
      return { ...res, json: res.body };
    },
  };
}

async function apartmentClient(index: number) {
  const c = client();
  const res = await c.call('POST', '/api/auth/login', { code: CODES[index] });
  expect(res.status).toBe(200);
  return c;
}

const oneOff = (spaceId: string, date: string, startTime: string, endTime: string) => ({
  parkingSpaceId: spaceId,
  startDate: date,
  startTime,
  endDate: date,
  endTime,
  repeat: null,
});

let spaces: repo.SpaceRow[];
const spaceId = (n: number) => spaces.find((s) => s.number === n)!.id;

beforeAll(async () => {
  db = await createPgliteDb();
  adminHash = await hashSecret(ADMIN_PASSWORD);
  const apartments = await repo.listApartments(db);
  for (const [i, a] of apartments.entries()) await repo.setApartmentCode(db, a.id, await hashSecret(CODES[i]));
  spaces = await repo.listSpaces(db);
  app = createApp({ db, config });
});

beforeEach(async () => {
  clock = at('2026-11-02T09:00');
  config.adminPasswordHash = adminHash;
  await db.query('delete from availability_schedules');
  await db.query('delete from login_attempts');
});

describe('database setup', () => {
  it('seeds 4 apartments with 2 spaces each, all occupied by default', async () => {
    const res = await client().call('GET', '/api/overview');
    const body = res.json as OverviewResponse;
    expect(body.spaces).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(body.blocks).toEqual([]);
    const counts = new Map<string, number>();
    for (const s of spaces) counts.set(s.apartmentId!, (counts.get(s.apartmentId!) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2, 2]);
  });
});

describe('public overview', () => {
  it('is accessible without login and exposes only space numbers and times', async () => {
    const apt = await apartmentClient(0);
    await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '08:00', '12:00'));
    const res = await client().call('GET', '/api/overview');
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    const text = JSON.stringify(res.json);
    expect(text).not.toMatch(/apartment|hash|scrypt|code|parkingSpaceId|scheduleId/i);
    expect((res.json as OverviewResponse).blocks).toEqual([
      { space: 1, start: '2026-11-02T07:00:00.000Z', end: '2026-11-02T11:00:00.000Z' },
    ]);
  });

  it('drops periods automatically after they end (no background job)', async () => {
    const apt = await apartmentClient(0);
    await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '08:00', '12:00'));
    clock = at('2026-11-02T12:00');
    expect(((await client().call('GET', '/api/overview')).json as OverviewResponse).blocks).toEqual([]);
  });
});

describe('apartment authentication', () => {
  it('rejects wrong codes and accepts the right one with a secure session cookie', async () => {
    const c = client();
    expect((await c.call('POST', '/api/auth/login', { code: '00000000' })).status).toBe(401);
    expect((await c.call('GET', '/api/me')).status).toBe(401);
    const res = await c.call('POST', '/api/auth/login', { code: '1111 1111' });
    expect(res.status).toBe(200);
    const cookie = ([] as string[]).concat(res.headers['Set-Cookie'])[0];
    expect(cookie).toMatch(/^ps_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/api');
    expect(JSON.stringify(res.json)).not.toContain('1111');
  });

  it('remembers the session and only returns the apartment’s own spaces', async () => {
    const apt = await apartmentClient(1);
    const me = (await apt.call('GET', '/api/me')).json as MeResponse;
    expect(me.spaces.map((s) => s.number)).toEqual([3, 4]);
    expect(JSON.stringify(me)).not.toMatch(/hash|scrypt/);
  });

  it('rate-limits repeated failed attempts per client', async () => {
    const c = client();
    for (let i = 0; i < 10; i++) expect((await c.call('POST', '/api/auth/login', { code: '99999999' })).status).toBe(401);
    const blocked = await c.call('POST', '/api/auth/login', { code: CODES[0] });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('rate_limited');
    clock += 16 * 60_000;
    expect((await c.call('POST', '/api/auth/login', { code: CODES[0] })).status).toBe(200);
  });

  it('logout ends the session', async () => {
    const apt = await apartmentClient(0);
    await apt.call('POST', '/api/auth/logout', {});
    expect((await apt.call('GET', '/api/me')).status).toBe(401);
  });
});

describe('permissions and apartment isolation', () => {
  it('lets an apartment manage its own spaces only', async () => {
    const apt1 = await apartmentClient(0);
    expect((await apt1.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '10:00', '12:00'))).status).toBe(200);
    const res = await apt1.call('POST', '/api/schedules', oneOff(spaceId(3), '2026-11-02', '10:00', '12:00'));
    expect(res.status).toBe(403);
  });

  it('prevents editing another apartment’s schedule by manipulating requests', async () => {
    const apt1 = await apartmentClient(0);
    const apt2 = await apartmentClient(1);
    const created = await apt1.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '10:00', '12:00'));
    const id = created.json.schedule.id;
    const update = { ...oneOff(spaceId(1), '2026-11-02', '10:00', '13:00'), scope: 'series' };
    expect((await apt2.call('PUT', `/api/schedules/${id}`, update)).status).toBe(404);
    expect((await apt2.call('DELETE', `/api/schedules/${id}?scope=series`)).status).toBe(404);
    expect((await apt2.call('POST', `/api/schedules/${id}/pause`, {})).status).toBe(404);
    expect((await client().call('PUT', `/api/schedules/${id}`, update)).status).toBe(401);
    expect((await apt1.call('PUT', `/api/schedules/${id}`, update)).status).toBe(200);
  });

  it('follows space reassignment by the administrator', async () => {
    const admin = client();
    await admin.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    const apartments = await repo.listApartments(db);
    expect((await admin.call('PATCH', `/api/admin/spaces/${spaceId(2)}`, { apartmentId: apartments[1].id })).status).toBe(200);
    const apt1 = await apartmentClient(0);
    const apt2 = await apartmentClient(1);
    expect((await apt1.call('POST', '/api/schedules', oneOff(spaceId(2), '2026-11-02', '10:00', '12:00'))).status).toBe(403);
    expect((await apt2.call('POST', '/api/schedules', oneOff(spaceId(2), '2026-11-02', '10:00', '12:00'))).status).toBe(200);
    await admin.call('PATCH', `/api/admin/spaces/${spaceId(2)}`, { apartmentId: apartments[0].id });
  });

  it('rejects cross-site requests', async () => {
    const apt = await apartmentClient(0);
    const body = oneOff(spaceId(1), '2026-11-02', '10:00', '12:00');
    expect((await apt.call('POST', '/api/schedules', body, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await apt.call('POST', '/api/schedules', body, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await apt.call('POST', '/api/schedules', body, { origin: 'https://parkshare.test' })).status).toBe(200);
  });
});

describe('creating and updating availability', () => {
  it('validates input server-side', async () => {
    const apt = await apartmentClient(0);
    const res = await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '12:00', '10:00'));
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('end_before_start');
  });

  it('prevents overlapping availability and explains the conflict', async () => {
    const apt = await apartmentClient(0);
    await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '10:00', '12:00'));
    const res = await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-02', '11:00', '13:00'));
    expect(res.status).toBe(409);
    expect(res.json.error).toEqual({
      code: 'conflict',
      details: { spaceNumber: 1, start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T11:00:00.000Z' },
    });
    // Other spaces are independent.
    expect((await apt.call('POST', '/api/schedules', oneOff(spaceId(2), '2026-11-02', '11:00', '13:00'))).status).toBe(200);
  });

  it('supports the recurring lifecycle: occurrence, future and series edits, pause, delete', async () => {
    const apt = await apartmentClient(0);
    const weekly = {
      ...oneOff(spaceId(1), '2026-11-02', '08:00', '17:00'),
      repeat: { type: 'weekly', days: [], until: null },
    };
    const id = (await apt.call('POST', '/api/schedules', weekly)).json.schedule.id as string;

    // This occurrence only
    let res = await apt.call('PUT', `/api/schedules/${id}`, {
      ...oneOff(spaceId(1), '2026-11-09', '10:00', '12:00'),
      scope: 'occurrence',
      occurrenceDate: '2026-11-09',
    });
    expect(res.status).toBe(200);
    let me = (await apt.call('GET', '/api/me')).json as MeResponse;
    expect(me.exceptions).toMatchObject([{ occurrenceDate: '2026-11-09', type: 'modified' }]);

    // Invalid occurrence date is rejected
    res = await apt.call('PUT', `/api/schedules/${id}`, {
      ...oneOff(spaceId(1), '2026-11-10', '10:00', '12:00'),
      scope: 'occurrence',
      occurrenceDate: '2026-11-10',
    });
    expect(res.status).toBe(400);

    // This and future: split from 16 Nov with new times
    res = await apt.call('PUT', `/api/schedules/${id}`, {
      ...weekly,
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      startTime: '13:00',
      endTime: '18:00',
      scope: 'future',
      occurrenceDate: '2026-11-16',
    });
    expect(res.status).toBe(200);
    me = (await apt.call('GET', '/api/me')).json as MeResponse;
    expect(me.schedules).toHaveLength(2);
    const original = me.schedules.find((s) => s.id === id)!;
    const successor = me.schedules.find((s) => s.id !== id)!;
    expect(original.recurrenceEndDate).toBe('2026-11-15');
    expect(successor.start).toBe('2026-11-16T12:00:00.000Z');
    expect(me.exceptions).toHaveLength(1);

    // Entire series
    res = await apt.call('PUT', `/api/schedules/${successor.id}`, {
      ...weekly,
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      startTime: '07:00',
      endTime: '09:00',
      scope: 'series',
    });
    expect(res.status).toBe(200);

    // Cancel one occurrence, then delete this-and-future of the successor
    expect((await apt.call('DELETE', `/api/schedules/${successor.id}?scope=occurrence&date=2026-11-23`)).status).toBe(200);
    expect((await apt.call('DELETE', `/api/schedules/${successor.id}?scope=future&date=2026-11-30`)).status).toBe(200);
    me = (await apt.call('GET', '/api/me')).json as MeResponse;
    const s2 = me.schedules.find((s) => s.id === successor.id)!;
    expect(s2.recurrenceEndDate).toBe('2026-11-29');
    expect(me.exceptions.find((e) => e.scheduleId === successor.id)).toMatchObject({ occurrenceDate: '2026-11-23', type: 'cancelled' });

    // Pause and resume
    expect((await apt.call('POST', `/api/schedules/${id}/pause`, {})).status).toBe(200);
    me = (await apt.call('GET', '/api/me')).json as MeResponse;
    expect(me.schedules.find((s) => s.id === id)!.isActive).toBe(false);
    expect((await apt.call('POST', `/api/schedules/${id}/resume`, {})).status).toBe(200);

    // Delete entire series
    expect((await apt.call('DELETE', `/api/schedules/${id}?scope=series`)).status).toBe(200);
    expect((await apt.call('DELETE', `/api/schedules/${successor.id}`)).status).toBe(200);
    me = (await apt.call('GET', '/api/me')).json as MeResponse;
    expect(me.schedules).toEqual([]);
  });

  it('refuses to resume a paused series that would now overlap', async () => {
    const apt = await apartmentClient(0);
    const daily = {
      ...oneOff(spaceId(1), '2026-11-02', '18:00', '20:00'),
      repeat: { type: 'daily', days: [], until: null },
    };
    const id = (await apt.call('POST', '/api/schedules', daily)).json.schedule.id;
    await apt.call('POST', `/api/schedules/${id}/pause`, {});
    expect((await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-05', '19:00', '21:00'))).status).toBe(200);
    const res = await apt.call('POST', `/api/schedules/${id}/resume`, {});
    expect(res.status).toBe(409);
  });

  it('shows recurring availability in the public overview', async () => {
    const apt = await apartmentClient(0);
    await apt.call('POST', '/api/schedules', {
      ...oneOff(spaceId(2), '2026-11-02', '08:00', '17:00'),
      repeat: { type: 'weekdays', days: [1, 3], until: null },
    });
    const body = (await client().call('GET', '/api/overview')).json as OverviewResponse;
    expect(body.blocks.map((b) => b.start)).toEqual([
      '2026-11-02T07:00:00.000Z',
      '2026-11-04T07:00:00.000Z',
      '2026-11-09T07:00:00.000Z',
    ]);
  });
});

describe('administration', () => {
  it('requires a separate admin session', async () => {
    const apt = await apartmentClient(0);
    expect((await apt.call('GET', '/api/admin/state')).status).toBe(401);
    expect((await client().call('GET', '/api/admin/activity')).status).toBe(401);
    const admin = client();
    expect((await admin.call('POST', '/api/admin/login', { password: 'wrong' })).status).toBe(401);
    const res = await admin.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(([] as string[]).concat(res.headers['Set-Cookie'])[0]).toContain('Path=/api/admin');
    const state = await admin.call('GET', '/api/admin/state');
    expect(state.status).toBe(200);
    expect(JSON.stringify(state.json)).not.toMatch(/scrypt|access_code_hash/);
    expect(state.json.apartments.every((a: { hasCode: boolean }) => a.hasCode)).toBe(true);
  });

  it('is disabled without a configured password hash', async () => {
    config.adminPasswordHash = null;
    expect((await client().call('POST', '/api/admin/login', { password: ADMIN_PASSWORD })).status).toBe(503);
  });

  it('accepts a plain ADMIN_PASSWORD as alternative to the hash', async () => {
    config.adminPasswordHash = null;
    config.adminPassword = ADMIN_PASSWORD;
    try {
      expect((await client().call('POST', '/api/admin/login', { password: 'nope' })).status).toBe(401);
      expect((await client().call('POST', '/api/admin/login', { password: ADMIN_PASSWORD })).status).toBe(200);
    } finally {
      config.adminPassword = null;
    }
  });

  it('resets codes: old code and sessions stop working, new code works', async () => {
    const apt = await apartmentClient(3);
    const admin = client();
    await admin.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    const apartment = (await repo.listApartments(db))[3];
    const res = await admin.call('POST', `/api/admin/apartments/${apartment.id}/reset-code`, {});
    expect(res.json.code).toMatch(/^\d{8}$/);
    expect((await apt.call('GET', '/api/me')).status).toBe(401);
    expect((await client().call('POST', '/api/auth/login', { code: CODES[3] })).status).toBe(401);
    expect((await client().call('POST', '/api/auth/login', { code: res.json.code })).status).toBe(200);
    await repo.setApartmentCode(db, apartment.id, await hashSecret(CODES[3]));
  });

  it('manages apartments and schedules and records activity', async () => {
    const admin = client();
    await admin.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    const created = await admin.call('POST', '/api/admin/apartments', { name: '5' });
    expect(created.status).toBe(200);
    expect((await admin.call('PATCH', `/api/admin/apartments/${created.json.id}`, { name: 'EG links' })).status).toBe(200);
    expect((await admin.call('POST', '/api/admin/apartments', { name: '' })).json.error.code).toBe('invalid_name');

    const withSpaces = (await repo.listApartments(db))[0];
    expect((await admin.call('DELETE', `/api/admin/apartments/${withSpaces.id}`)).status).toBe(409);
    expect((await admin.call('DELETE', `/api/admin/apartments/${created.json.id}`)).status).toBe(200);

    const apt = await apartmentClient(0);
    const id = (await apt.call('POST', '/api/schedules', oneOff(spaceId(1), '2026-11-03', '10:00', '12:00'))).json.schedule.id;
    expect((await admin.call('DELETE', `/api/admin/schedules/${id}?scope=series`)).status).toBe(200);

    const activity = await admin.call('GET', '/api/admin/activity');
    const actions = activity.json.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['apartment.created', 'apartment.renamed', 'apartment.deleted', 'schedule.created', 'schedule.deleted']));
  });
});
