import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, type App } from '../server/app.js';
import { configFromEnv } from '../server/config.js';
import { createPostgresDb } from '../server/db-postgres.js';
import { handleNodeRequest } from '../server/node.js';

let app: App | undefined;

/** Single Vercel Function serving every /api/* route (see vercel.json rewrites). */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'server_misconfigured' } }));
    return;
  }
  app ??= createApp({ db: createPostgresDb(url), config: configFromEnv(process.env) });
  await handleNodeRequest(app, req, res);
}
