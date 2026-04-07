import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import * as schema from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

// Use Symbol.for to share across Turbopack modules (same pattern as event-bus)
const DB_KEY = Symbol.for('__app_sqlite_db__');
const globalObj = globalThis as Record<symbol, ReturnType<typeof drizzle> | undefined>;

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Auto-create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS reply_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      body TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS unread_counts (
      phone TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      keys_json TEXT NOT NULL,
      created_at INTEGER
    );
  `);

  return db;
}

export function getDb() {
  if (!globalObj[DB_KEY]) {
    globalObj[DB_KEY] = createDb();
  }
  return globalObj[DB_KEY]!;
}

export { schema };
