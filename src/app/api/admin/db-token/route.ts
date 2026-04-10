import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import crypto from 'crypto';

const TOKEN_KEY = 'db_viewer_token';
const TOKEN_EXPIRY_KEY = 'db_viewer_token_expiry';
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function POST() {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = (Date.now() + TOKEN_TTL_MS).toString();

  db.insert(schema.settings).values({ key: TOKEN_KEY, value: token }).onConflictDoUpdate({ target: schema.settings.key, set: { value: token } }).run();
  db.insert(schema.settings).values({ key: TOKEN_EXPIRY_KEY, value: expiry }).onConflictDoUpdate({ target: schema.settings.key, set: { value: expiry } }).run();

  return NextResponse.json({ token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString() });
}
