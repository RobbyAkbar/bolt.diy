/*
 * Test-only D1 stand-in over node:sqlite. Never import from app code: the server
 * runs in workerd, where node:sqlite does not exist. Covers only the calls the
 * usage store makes (prepare/bind/run/all/first).
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');

  const prepare = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    run: async () => {
      sqlite.prepare(sql).run(...params);
      return { success: true, results: [], meta: {} };
    },
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params), meta: {} }),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
  });

  return { prepare: (sql: string) => prepare(sql) } as unknown as D1Database;
}
