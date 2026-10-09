// The sync server's database on Node's built-in SQLite, for tests (unit and e2e). It
// implements the small part of Cloudflare D1's interface that server/sync.ts uses.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SyncDb, SyncStatement } from './sync';

export function sqliteDb(path = ':memory:'): SyncDb {
  const db = new DatabaseSync(path);
  const statement = (sql: string, values: SQLInputValue[] = []): SyncStatement => ({
    bind: (...next: unknown[]) => statement(sql, next as SQLInputValue[]),
    run: async () => db.prepare(sql).run(...values),
    all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) await s.run();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
