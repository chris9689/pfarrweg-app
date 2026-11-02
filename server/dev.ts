import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, type App } from './app.js';
import { configFromEnv } from './config.js';
import { createPgliteDb } from './db-pglite.js';
import { handleNodeRequest } from './node.js';
import * as repo from './repo.js';
import { hashSecret } from './security.js';

const DEFAULT_DEV_CODES = '11111111,22222222,33333333,44444444';

/** Local development only: in-memory Postgres with known apartment codes. Never used on Vercel. */
async function createDevApp(env: Record<string, string | undefined>): Promise<App> {
  const db = await createPgliteDb();
  const codes = (env.DEV_APARTMENT_CODES || DEFAULT_DEV_CODES).split(',').map((c) => c.trim());
  const apartments = await repo.listApartments(db);
  for (const [i, apartment] of apartments.entries()) {
    if (codes[i]) await repo.setApartmentCode(db, apartment.id, await hashSecret(codes[i]));
  }
  const config = configFromEnv(env);
  if (env.DEV_ADMIN_PASSWORD) config.adminPasswordHash = await hashSecret(env.DEV_ADMIN_PASSWORD);
  config.secureCookies = false;
  console.log(`[dev-api] In-memory database ready. Apartment codes: ${codes.join(', ')}`);
  return createApp({ db, config });
}

const store = globalThis as typeof globalThis & { __parkshareDevApp?: Promise<App> };

export async function handleDevRequest(
  env: Record<string, string | undefined>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  store.__parkshareDevApp ??= createDevApp(env);
  await handleNodeRequest(await store.__parkshareDevApp, req, res);
}
