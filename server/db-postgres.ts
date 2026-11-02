import postgres from 'postgres';
import type { Db } from './db.js';

type SqlLike = postgres.Sql | postgres.TransactionSql;

function wrap(sql: SqlLike, inTransaction: boolean): Db {
  const db: Db = {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as never[])) as unknown as T[],
    exec: (text) => sql.unsafe(text).simple(),
    transaction: async (fn) => {
      if (inTransaction) return fn(db);
      return (await (sql as postgres.Sql).begin((tx) => fn(wrap(tx, true)))) as never;
    },
  };
  return db;
}

/** Use Supabase's transaction pooler URL (port 6543) in serverless environments. */
export function createPostgresDb(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    // Pipelined queries hang behind Supabase's transaction pooler (Supavisor).
    max_pipeline: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : 'require',
    onnotice: () => {},
  });
  return wrap(sql, false);
}
