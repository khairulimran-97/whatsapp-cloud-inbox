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
    CREATE TABLE IF NOT EXISTS contacts (
      phone TEXT PRIMARY KEY,
      name TEXT,
      first_seen INTEGER,
      last_seen INTEGER
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      phone_number_id TEXT,
      last_message_text TEXT,
      last_message_type TEXT,
      last_message_direction TEXT,
      messages_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      content TEXT DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'text',
      status TEXT,
      has_media INTEGER DEFAULT 0,
      media_data_json TEXT,
      caption TEXT,
      error_json TEXT,
      metadata_json TEXT,
      created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);

  // Run cleanup on startup
  cleanupOldData(sqlite);

  return db;
}

const CLEANUP_DAYS = 30;
const CLEANUP_INTERVAL_KEY = Symbol.for('__app_cleanup_interval__');

function cleanupOldData(sqlite: Database.Database) {
  try {
    const cutoff = Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000;
    const cutoffSeconds = Math.floor(cutoff / 1000);
    const deleted = sqlite.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoffSeconds);
    const deletedConvs = sqlite.prepare('DELETE FROM conversations WHERE updated_at < ?').run(cutoffSeconds);
    if ((deleted.changes ?? 0) > 0 || (deletedConvs.changes ?? 0) > 0) {
      console.log(`[DB Cleanup] Deleted ${deleted.changes} messages, ${deletedConvs.changes} conversations older than ${CLEANUP_DAYS} days`);
    }
  } catch (e) {
    console.error('[DB Cleanup] Error:', e);
  }
}

function scheduleCleanup(sqlite: Database.Database) {
  const g = globalThis as Record<symbol, NodeJS.Timeout | undefined>;
  if (g[CLEANUP_INTERVAL_KEY]) return; // already scheduled
  g[CLEANUP_INTERVAL_KEY] = setInterval(() => cleanupOldData(sqlite), 24 * 60 * 60 * 1000);
}

export function getDb() {
  if (!globalObj[DB_KEY]) {
    globalObj[DB_KEY] = createDb();
  }
  // Schedule daily cleanup (idempotent)
  const db = globalObj[DB_KEY]!;
  try {
    const sqlite = (db as unknown as { session: { client: Database.Database } }).session.client;
    scheduleCleanup(sqlite);
  } catch { /* ignore if internal API changes */ }
  return db;
}

export { schema };
