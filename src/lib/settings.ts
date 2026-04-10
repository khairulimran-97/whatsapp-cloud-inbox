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

export type BclMerchant = {
  id: string;
  name: string;
  apiKey: string;
  isDefault: boolean | null;
};

export function getBclMerchants(): BclMerchant[] {
  const db = getDb();
  return db.select().from(schema.bclMerchants).all();
}

export function getBclMerchant(id: string): BclMerchant | undefined {
  const db = getDb();
  return db.select().from(schema.bclMerchants).where(eq(schema.bclMerchants.id, id)).get();
}

const BCL_BASE_URL = 'https://bcl.my';

/** Get API key for a merchant. Falls back to legacy single-key settings. */
export function getBclCredentials(merchantId?: string | null): { apiKey: string; baseUrl: string; merchantName?: string } | null {
  if (merchantId) {
    const merchant = getBclMerchant(merchantId);
    if (merchant) {
      return { apiKey: merchant.apiKey, baseUrl: BCL_BASE_URL, merchantName: merchant.name };
    }
  }
  // Fallback: legacy single key
  const apiKey = getBclApiKey();
  if (apiKey) {
    return { apiKey, baseUrl: BCL_BASE_URL };
  }
  return null;
}
