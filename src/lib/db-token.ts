import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

const TOKEN_KEY = 'db_viewer_token';
const TOKEN_EXPIRY_KEY = 'db_viewer_token_expiry';

export function validateDbToken(token: string): boolean {
  const db = getDb();
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, TOKEN_KEY)).get();
  const expiryRow = db.select().from(schema.settings).where(eq(schema.settings.key, TOKEN_EXPIRY_KEY)).get();
  if (!row || !expiryRow) return false;
  if (row.value !== token) return false;
  if (Date.now() > Number(expiryRow.value)) return false;
  return true;
}
