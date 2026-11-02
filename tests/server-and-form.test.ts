import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { createPgliteDb } from '../server/db-pglite';
import { handleNodeRequest } from '../server/node';
import { generateAccessCode, hashSecret, normalizeCode, verifySecret } from '../server/security';
import { defaultFormValues, toScheduleInput, valuesFromOccurrence, valuesFromSchedule } from '../src/lib/schedule-form';
import { expandSchedule } from '../shared/recurrence';
import { at, schedule, TZ } from './helpers';

describe('secrets', () => {
  it('hashes and verifies with scrypt (unique salts)', async () => {
    const a = await hashSecret('12345678');
    const b = await hashSecret('12345678');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifySecret('12345678', a)).toBe(true);
    expect(await verifySecret('12345679', a)).toBe(false);
    expect(await verifySecret('12345678', 'garbage')).toBe(false);
  });

  it('generates 8-digit codes and normalises user input', () => {
    expect(generateAccessCode()).toMatch(/^\d{8}$/);
    expect(normalizeCode(' 1234-5678 ')).toBe('12345678');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('form helpers', () => {
  it('defaults to the current quarter hour for three hours', () => {
    const v = defaultFormValues('sp', at('2026-11-02T14:07'), TZ);
    expect(v).toMatchObject({ date: '2026-11-02', startTime: '14:00', endTime: '17:00', repeatType: 'none' });
  });

  it('wraps past midnight late in the evening', () => {
    const v = defaultFormValues('sp', at('2026-11-02T23:50'), TZ);
    expect(v).toMatchObject({ date: '2026-11-02', startTime: '23:45', endTime: '02:45' });
    expect(toScheduleInput(v).endDate).toBe('2026-11-03');
  });

  it('treats an end time before the start time as the next day', () => {
    const input = toScheduleInput({ ...defaultFormValues('sp', at('2026-11-02T10:00'), TZ), startTime: '22:00', endTime: '06:00' });
    expect(input).toMatchObject({ startDate: '2026-11-02', endDate: '2026-11-03' });
  });

  it('round-trips schedules and occurrences into form values', () => {
    const s = schedule({ start: '2026-11-02T22:00', end: '2026-11-03T06:00', recurrenceType: 'weekdays', recurrenceDays: [1, 3] });
    const v = valuesFromSchedule(s);
    expect(v).toMatchObject({ date: '2026-11-02', startTime: '22:00', endTime: '06:00', endDate: null, repeatType: 'weekdays', days: [1, 3] });
    expect(toScheduleInput(v)).toMatchObject({ endDate: '2026-11-03', repeat: { type: 'weekdays', days: [1, 3], until: null } });

    const future = valuesFromSchedule(s, '2026-11-09');
    expect(future.date).toBe('2026-11-09');

    const [occ] = expandSchedule(s, [], at('2026-11-04T00:00'), at('2026-11-05T00:00'));
    expect(valuesFromOccurrence(s, occ)).toMatchObject({ date: '2026-11-04', startTime: '22:00', endTime: '06:00', repeatType: 'none' });

    const multiDay = schedule({ start: '2026-11-02T08:00', end: '2026-11-05T18:00' });
    expect(valuesFromSchedule(multiDay).endDate).toBe('2026-11-05');
  });
});

describe('Node/Vercel adapter', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = createApp({
      db: await createPgliteDb(),
      config: { timezone: TZ, buildingName: '', adminPasswordHash: null, secureCookies: true, now: () => Date.now() },
    });
    server = createServer((req, res) => void handleNodeRequest(app, req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('serves original /api paths', async () => {
    const res = await fetch(`${base}/api/overview`);
    expect(res.status).toBe(200);
    expect((await res.json()).spaces).toHaveLength(8);
  });

  it('serves rewritten paths (?route=...)', async () => {
    const res = await fetch(`${base}/api/handler?route=overview`);
    expect(res.status).toBe(200);
  });

  it('parses JSON bodies and rejects invalid JSON', async () => {
    const wrong = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '00000000' }),
    });
    expect(wrong.status).toBe(401);
    const invalid = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect(invalid.status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });
});
