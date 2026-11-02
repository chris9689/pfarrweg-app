export type Row = Record<string, unknown>;

/** Minimal database interface implemented by the Postgres (production) and PGlite (dev/test) drivers. */
export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
