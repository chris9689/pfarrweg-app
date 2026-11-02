import { PGlite, type Transaction } from '@electric-sql/pglite';
import { applyMigrations } from '../scripts/migrate.mjs';
import type { Db, Row } from './db.js';

function wrap(pg: PGlite | Transaction, inTransaction: boolean): Db {
  const db: Db = {
    query: async <T = Row>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    exec: (text) => pg.exec(text),
    transaction: async (fn) => {
      if (inTransaction) return fn(db);
      return (pg as PGlite).transaction((tx) => fn(wrap(tx, true)));
    },
  };
  return db;
}

/** In-process Postgres (WASM) with all migrations applied – for local development and tests. */
export async function createPgliteDb(): Promise<Db> {
  const pg = await PGlite.create();
  const db = wrap(pg, false);
  await applyMigrations(db as never);
  return db;
}
