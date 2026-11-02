// Applies supabase/migrations/*.sql in order, tracking applied files in public.app_migrations.
// Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs  (runs automatically in `vercel-build`).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function applyMigrations(db, dir = 'supabase/migrations', log = () => {}) {
  await db.exec(
    'create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now());' +
      'alter table app_migrations enable row level security;',
  );
  const applied = new Set((await db.query('select name from app_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(dir, name), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into app_migrations (name) values ($1)', [name]);
    });
    log(`applied ${name}`);
  }
}

async function main() {
  const url =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL;
  if (!url) {
    console.warn('[migrate] No database URL configured – skipping migrations.');
    return;
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { prepare: false, max: 1, max_pipeline: 1, onnotice: () => {} });
  const wrap = (s) => ({
    query: (text, params = []) => s.unsafe(text, params),
    exec: (text) => s.unsafe(text).simple(),
    transaction: (fn) => (s.begin ? s.begin((tx) => fn(wrap(tx))) : fn(wrap(s))),
  });
  try {
    await applyMigrations(wrap(sql), 'supabase/migrations', (m) => console.log(`[migrate] ${m}`));
    console.log('[migrate] Database is up to date.');
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error('[migrate] Failed:', err.message);
    process.exit(1);
  });
}
