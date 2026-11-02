import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from './app.js';

const MAX_BODY_BYTES = 16 * 1024;
const INVALID_BODY = Symbol('invalid');

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  // Vercel pre-parses the body; in dev we read the stream ourselves.
  if ('body' in req) {
    try {
      const b = req.body;
      if (b === undefined || b === null || b === '') return undefined;
      if (Buffer.isBuffer(b) || typeof b === 'string') return JSON.parse(b.toString());
      return b;
    } catch {
      return INVALID_BODY;
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return INVALID_BODY;
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return INVALID_BODY;
  }
}

function resolveUrl(rawUrl: string): string {
  const url = new URL(rawUrl, 'http://localhost');
  // Behind the Vercel rewrite the original path may arrive as ?route=...
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/handler') {
    const route = url.searchParams.get('route') ?? '';
    url.searchParams.delete('route');
    url.pathname = `/api/${route.replace(/^\/+/, '')}`;
  }
  return url.pathname + url.search;
}

export async function handleNodeRequest(app: App, req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const body = await readBody(req);
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value.join(', ') : value;
  const forwarded = headers['x-forwarded-for']?.split(',')[0]?.trim();

  const result =
    body === INVALID_BODY
      ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: { code: 'invalid_input' } } }
      : await app.handle({
          method: req.method ?? 'GET',
          url: resolveUrl(req.url ?? '/'),
          headers,
          body,
          ip: forwarded || req.socket?.remoteAddress || 'unknown',
        });

  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.end(JSON.stringify(result.body));
}
