export interface MigrationDb {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: MigrationDb) => Promise<T>): Promise<T>;
}

export function applyMigrations(db: MigrationDb, dir?: string, log?: (message: string) => void): Promise<void>;
