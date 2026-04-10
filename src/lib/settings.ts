import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export function getSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.select().from(schema.settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function getBclApiKey(): string {
  const db = getDb();
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'bcl_api_key')).get();
  return row?.value || '';
}

export function getBclMonitorKey(): string {
  return process.env.BCL_MONITOR_KEY || '';
}

export function getBclBaseUrl(): string {
  return process.env.BCL_BASE_URL || 'https://bcl.my';
}
