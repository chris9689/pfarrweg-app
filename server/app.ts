import { timingSafeEqual } from 'node:crypto';
import { expandAll, isFinished, mergeBlocks, DAY_MS } from '../shared/recurrence.js';
import type {
  AdminStateResponse,
  AvailabilityBlock,
  MeResponse,
  OverviewResponse,
} from '../shared/types.js';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { ApiError, badRequest, forbidden, notFound, unauthorized } from './errors.js';
import * as repo from './repo.js';
import * as schedules from './schedules.js';
import { isUuid, type Actor } from './schedules.js';
import { generateAccessCode, hashSecret, newSessionToken, normalizeCode, sha256, verifySecret } from './security.js';

export interface AppRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  ip: string;
}

export interface AppResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: unknown;
}

interface Ctx {
  req: AppRequest;
  params: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  cookies: Record<string, string>;
  setCookies: string[];
}

type Handler = (ctx: Ctx) => Promise<unknown>;

const APARTMENT_COOKIE = 'ps_session';
const ADMIN_COOKIE = 'ps_admin';
const APARTMENT_SESSION_DAYS = 180;
const ADMIN_SESSION_HOURS = 8;
const OVERVIEW_DAYS = 7;

/** Failed attempts allowed per client (15 min) and across all clients (1 h). */
const RATE_LIMITS = {
  apartment: { perClient: 10, global: 100 },
  admin: { perClient: 5, global: 30 },
} as const;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createApp({ db, config }: { db: Db; config: AppConfig }) {
  const now = () => new Date(config.now());

  const cookie = (name: string, value: string, path: string, maxAgeSeconds: number) =>
    `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${config.secureCookies ? '; Secure' : ''}`;

  // ---------- auth helpers ----------

  async function apartmentSession(ctx: Ctx): Promise<{ apartmentId: string }> {
    const token = ctx.cookies[APARTMENT_COOKIE];
    const session = token ? await repo.findSession(db, sha256(token), 'apartment', now()) : null;
    if (!session?.apartmentId) {
      if (token) ctx.setCookies.push(cookie(APARTMENT_COOKIE, '', '/api', 0));
      throw unauthorized();
    }
    return { apartmentId: session.apartmentId };
  }

  async function requireAdmin(ctx: Ctx): Promise<void> {
    const token = ctx.cookies[ADMIN_COOKIE];
    const session = token ? await repo.findSession(db, sha256(token), 'admin', now()) : null;
    if (!session) {
      if (token) ctx.setCookies.push(cookie(ADMIN_COOKIE, '', '/api/admin', 0));
      throw unauthorized();
    }
  }

  async function enforceRateLimit(kind: 'apartment' | 'admin', clientKey: string) {
    const t = config.now();
    const limits = RATE_LIMITS[kind];
    const perClient = await repo.countFailedAttempts(db, kind, new Date(t - 15 * 60_000), clientKey);
    const global = await repo.countFailedAttempts(db, kind, new Date(t - 60 * 60_000));
    if (perClient >= limits.perClient || global >= limits.global) throw new ApiError(429, 'rate_limited');
  }

  const actorFor = async (ctx: Ctx): Promise<Actor> => ({ kind: 'apartment', ...(await apartmentSession(ctx)) });

  // ---------- handlers ----------

  const overview: Handler = async () => {
    const t = config.now();
    const spaces = await repo.listSpaces(db);
    const all = await repo.listSchedules(db);
    const active = all.filter((s) => s.isActive && !isFinished(s, t));
    const exceptions = await repo.listExceptions(
      db,
      active.map((s) => s.id),
    );
    const numberById = new Map(spaces.map((s) => [s.id, s.number]));
    const occurrences = expandAll(active, exceptions, t, t + OVERVIEW_DAYS * DAY_MS);
    const blocks: AvailabilityBlock[] = spaces.flatMap((space) =>
      mergeBlocks(occurrences.filter((o) => o.parkingSpaceId === space.id)).map((b) => ({
        space: numberById.get(space.id)!,
        start: new Date(b.start).toISOString(),
        end: new Date(b.end).toISOString(),
      })),
    );
    const body: OverviewResponse = {
      timezone: config.timezone,
      buildingName: config.buildingName,
      generatedAt: new Date(t).toISOString(),
      spaces: spaces.map((s) => s.number),
      blocks,
    };
    return body;
  };

  const login: Handler = async (ctx) => {
    const clientKey = sha256(`apartment:${ctx.req.ip}`);
    await enforceRateLimit('apartment', clientKey);
    const code = normalizeCode(ctx.body.code);
    let match: repo.ApartmentRow | null = null;
    if (code.length >= 6 && code.length <= 32) {
      // Check every apartment so response time does not reveal which one matched.
      for (const apartment of await repo.listApartments(db)) {
        if (apartment.codeHash && (await verifySecret(code, apartment.codeHash)) && !match) match = apartment;
      }
    }
    await repo.recordLoginAttempt(db, clientKey, 'apartment', Boolean(match), now());
    if (!match) throw unauthorized('invalid_code');

    await repo.purgeStaleAuthData(db, now());
    const token = newSessionToken();
    const maxAge = APARTMENT_SESSION_DAYS * 86_400;
    await repo.createSession(db, sha256(token), 'apartment', match.id, new Date(config.now() + maxAge * 1000));
    ctx.setCookies.push(cookie(APARTMENT_COOKIE, token, '/api', maxAge));
    return { apartment: { id: match.id, name: match.name } };
  };

  const logout: Handler = async (ctx) => {
    const token = ctx.cookies[APARTMENT_COOKIE];
    if (token) await repo.deleteSession(db, sha256(token));
    ctx.setCookies.push(cookie(APARTMENT_COOKIE, '', '/api', 0));
    return { ok: true };
  };

  const me: Handler = async (ctx) => {
    const { apartmentId } = await apartmentSession(ctx);
    const apartment = await repo.getApartment(db, apartmentId);
    if (!apartment) throw unauthorized();
    const spaces = await repo.listSpaces(db, apartmentId);
    const t = config.now();
    const list = spaces.length
      ? (await repo.listSchedules(
          db,
          spaces.map((s) => s.id),
        )).filter((s) => !isFinished(s, t))
      : [];
    const body: MeResponse = {
      timezone: config.timezone,
      apartment: { id: apartment.id, name: apartment.name },
      spaces: spaces.map((s) => ({ id: s.id, number: s.number })),
      schedules: list,
      exceptions: await repo.listExceptions(
        db,
        list.map((s) => s.id),
      ),
    };
    return body;
  };

  const createSchedule: Handler = async (ctx) => ({
    schedule: await schedules.createSchedule(db, config, await actorFor(ctx), ctx.body),
  });

  const updateSchedule: Handler = async (ctx) => {
    await schedules.updateSchedule(db, config, await actorFor(ctx), ctx.params[0], ctx.body);
    return { ok: true };
  };

  const deleteSchedule: Handler = async (ctx) => {
    await schedules.deleteSchedule(
      db,
      await actorFor(ctx),
      ctx.params[0],
      ctx.query.get('scope'),
      ctx.query.get('date'),
    );
    return { ok: true };
  };

  const pauseResume: Handler = async (ctx) => {
    await schedules.setScheduleActive(db, config, await actorFor(ctx), ctx.params[0], ctx.params[1] === 'resume');
    return { ok: true };
  };

  // ---------- admin ----------

  const adminLogin: Handler = async (ctx) => {
    if (!config.adminPasswordHash && !config.adminPassword) throw new ApiError(503, 'admin_not_configured');
    const clientKey = sha256(`admin:${ctx.req.ip}`);
    await enforceRateLimit('admin', clientKey);
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    const ok =
      password.length > 0 &&
      password.length <= 200 &&
      (config.adminPasswordHash
        ? await verifySecret(password, config.adminPasswordHash)
        : timingSafeEqual(Buffer.from(sha256(password)), Buffer.from(sha256(config.adminPassword!))));
    await repo.recordLoginAttempt(db, clientKey, 'admin', ok, now());
    if (!ok) throw unauthorized('invalid_password');
    await repo.purgeStaleAuthData(db, now());
    const token = newSessionToken();
    const maxAge = ADMIN_SESSION_HOURS * 3600;
    await repo.createSession(db, sha256(token), 'admin', null, new Date(config.now() + maxAge * 1000));
    ctx.setCookies.push(cookie(ADMIN_COOKIE, token, '/api/admin', maxAge));
    return { ok: true };
  };

  const adminLogout: Handler = async (ctx) => {
    const token = ctx.cookies[ADMIN_COOKIE];
    if (token) await repo.deleteSession(db, sha256(token));
    ctx.setCookies.push(cookie(ADMIN_COOKIE, '', '/api/admin', 0));
    return { ok: true };
  };

  const admin =
    (fn: Handler): Handler =>
    async (ctx) => {
      await requireAdmin(ctx);
      return fn(ctx);
    };

  const adminState: Handler = async () => {
    const t = config.now();
    const apartments = await repo.listApartments(db);
    const spaces = await repo.listSpaces(db);
    const all = await repo.listSchedules(db);
    const list = all.filter((s) => !isFinished(s, t));
    const body: AdminStateResponse = {
      timezone: config.timezone,
      apartments: apartments.map((a) => ({
        id: a.id,
        name: a.name,
        hasCode: Boolean(a.codeHash),
        codeUpdatedAt: a.codeUpdatedAt,
      })),
      spaces: spaces.map((s) => ({ id: s.id, number: s.number, apartmentId: s.apartmentId })),
      schedules: list,
      exceptions: await repo.listExceptions(
        db,
        list.map((s) => s.id),
      ),
    };
    return body;
  };

  const apartmentName = (value: unknown) => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name.length < 1 || name.length > 60) throw badRequest('invalid_name');
    return name;
  };

  const loadApartment = async (id: string) => {
    const apartment = isUuid(id) ? await repo.getApartment(db, id) : null;
    if (!apartment) throw notFound();
    return apartment;
  };

  const createApartment: Handler = async (ctx) => {
    const apartment = await repo.createApartment(db, apartmentName(ctx.body.name));
    await repo.logActivity(db, {
      actor: 'admin',
      action: 'apartment.created',
      apartmentId: apartment.id,
      details: { name: apartment.name },
    });
    return { id: apartment.id };
  };

  const renameApartment: Handler = async (ctx) => {
    const apartment = await loadApartment(ctx.params[0]);
    const name = apartmentName(ctx.body.name);
    await repo.renameApartment(db, apartment.id, name);
    await repo.logActivity(db, {
      actor: 'admin',
      action: 'apartment.renamed',
      apartmentId: apartment.id,
      details: { from: apartment.name, to: name },
    });
    return { ok: true };
  };

  const deleteApartment: Handler = async (ctx) => {
    const apartment = await loadApartment(ctx.params[0]);
    if ((await repo.listSpaces(db, apartment.id)).length > 0) throw new ApiError(409, 'apartment_has_spaces');
    await repo.deleteApartment(db, apartment.id);
    await repo.logActivity(db, { actor: 'admin', action: 'apartment.deleted', details: { name: apartment.name } });
    return { ok: true };
  };

  const resetCode: Handler = async (ctx) => {
    const apartment = await loadApartment(ctx.params[0]);
    const code = generateAccessCode();
    await repo.setApartmentCode(db, apartment.id, await hashSecret(code));
    await repo.deleteApartmentSessions(db, apartment.id);
    await repo.logActivity(db, { actor: 'admin', action: 'apartment.code_reset', apartmentId: apartment.id });
    // The plain code is returned exactly once and never stored.
    return { code };
  };

  const assignSpace: Handler = async (ctx) => {
    const id = ctx.params[0];
    const space = isUuid(id) ? await repo.getSpace(db, id) : null;
    if (!space) throw notFound();
    const apartmentId = ctx.body.apartmentId ?? null;
    if (apartmentId !== null) {
      if (typeof apartmentId !== 'string') throw badRequest();
      await loadApartment(apartmentId);
    }
    await repo.assignSpace(db, space.id, apartmentId as string | null);
    await repo.logActivity(db, {
      actor: 'admin',
      action: 'space.assigned',
      apartmentId: apartmentId as string | null,
      parkingSpaceId: space.id,
      details: { spaceNumber: space.number },
    });
    return { ok: true };
  };

  const adminActivity: Handler = async () => ({ entries: await repo.listActivity(db, 200) });

  const adminPauseResume: Handler = async (ctx) => {
    await schedules.setScheduleActive(db, config, { kind: 'admin' }, ctx.params[0], ctx.params[1] === 'resume');
    return { ok: true };
  };

  const adminDeleteSchedule: Handler = async (ctx) => {
    await schedules.deleteSchedule(
      db,
      { kind: 'admin' },
      ctx.params[0],
      ctx.query.get('scope'),
      ctx.query.get('date'),
    );
    return { ok: true };
  };

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/overview$/, overview],
    ['POST', /^\/api\/auth\/login$/, login],
    ['POST', /^\/api\/auth\/logout$/, logout],
    ['GET', /^\/api\/me$/, me],
    ['POST', /^\/api\/schedules$/, createSchedule],
    ['PUT', /^\/api\/schedules\/([^/]+)$/, updateSchedule],
    ['DELETE', /^\/api\/schedules\/([^/]+)$/, deleteSchedule],
    ['POST', /^\/api\/schedules\/([^/]+)\/(pause|resume)$/, pauseResume],
    ['POST', /^\/api\/admin\/login$/, adminLogin],
    ['POST', /^\/api\/admin\/logout$/, adminLogout],
    ['GET', /^\/api\/admin\/state$/, admin(adminState)],
    ['GET', /^\/api\/admin\/activity$/, admin(adminActivity)],
    ['POST', /^\/api\/admin\/apartments$/, admin(createApartment)],
    ['PATCH', /^\/api\/admin\/apartments\/([^/]+)$/, admin(renameApartment)],
    ['DELETE', /^\/api\/admin\/apartments\/([^/]+)$/, admin(deleteApartment)],
    ['POST', /^\/api\/admin\/apartments\/([^/]+)\/reset-code$/, admin(resetCode)],
    ['PATCH', /^\/api\/admin\/spaces\/([^/]+)$/, admin(assignSpace)],
    ['POST', /^\/api\/admin\/schedules\/([^/]+)\/(pause|resume)$/, admin(adminPauseResume)],
    ['DELETE', /^\/api\/admin\/schedules\/([^/]+)$/, admin(adminDeleteSchedule)],
  ];

  /** Blocks cross-site form posts and requests from foreign origins (cookies are also SameSite=Strict). */
  function checkRequestOrigin(req: AppRequest) {
    if (req.method === 'GET') return;
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (!host || originHost !== host) throw forbidden();
    }
    if (req.method !== 'DELETE' && !(req.headers['content-type'] ?? '').includes('application/json')) {
      throw new ApiError(415, 'unsupported_media_type');
    }
  }

  async function handle(req: AppRequest): Promise<AppResponse> {
    const url = new URL(req.url, 'http://localhost');
    const ctx: Ctx = {
      req,
      params: [],
      query: url.searchParams,
      body: req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {},
      cookies: parseCookies(req.headers.cookie),
      setCookies: [],
    };
    const headers: Record<string, string | string[]> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    try {
      const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url.pathname));
      if (!route) throw notFound();
      ctx.params = route[1].exec(url.pathname)!.slice(1);
      checkRequestOrigin(req);
      const body = await route[2](ctx);
      if (ctx.setCookies.length) headers['Set-Cookie'] = ctx.setCookies;
      return { status: 200, headers, body };
    } catch (err) {
      if (ctx.setCookies.length) headers['Set-Cookie'] = ctx.setCookies;
      if (err instanceof ApiError) {
        return { status: err.status, headers, body: { error: { code: err.code, details: err.details } } };
      }
      console.error('[api] Unhandled error', err);
      return { status: 500, headers, body: { error: { code: 'server_error' } } };
    }
  }

  return { handle };
}

export type App = ReturnType<typeof createApp>;
