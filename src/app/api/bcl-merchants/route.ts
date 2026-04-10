import { NextRequest, NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

function verifyAdmin(request: NextRequest): boolean {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return false;
  const provided = request.headers.get('x-app-password');
  return provided === secret;
}

function maskKey(key: string): string {
  if (!key) return '';
  return `${'•'.repeat(Math.max(0, key.length - 8))}${key.slice(-8)}`;
}

// GET: list all merchants (keys masked)
export async function GET() {
  const db = getDb();
  const merchants = db.select().from(schema.bclMerchants).all();
  return NextResponse.json({
    merchants: merchants.map(m => ({
      id: m.id,
      name: m.name,
      apiKey: maskKey(m.apiKey),
      baseUrl: m.baseUrl,
      isDefault: m.isDefault,
    })),
  });
}

// POST: add merchant
export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Invalid app password' }, { status: 401 });
  }

  const body = await request.json();
  const { name, api_key, base_url } = body;

  if (!name?.trim() || !api_key?.trim()) {
    return NextResponse.json({ error: 'name and api_key are required' }, { status: 400 });
  }

  const db = getDb();
  const id = randomUUID().slice(0, 8);
  const existing = db.select().from(schema.bclMerchants).all();
  const isDefault = existing.length === 0;

  db.insert(schema.bclMerchants).values({
    id,
    name: name.trim(),
    apiKey: api_key.trim(),
    baseUrl: (base_url || 'https://bcl.my').trim(),
    isDefault,
    createdAt: new Date(),
  }).run();

  return NextResponse.json({ id, message: 'Merchant added' });
}

// PUT: update merchant
export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Invalid app password' }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, api_key, base_url, is_default } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  const updates: Record<string, unknown> = {};
  if (name?.trim()) updates.name = name.trim();
  if (api_key?.trim()) updates.apiKey = api_key.trim();
  if (base_url !== undefined) updates.baseUrl = (base_url || 'https://bcl.my').trim();
  if (is_default === true) {
    // Unset all others first
    db.update(schema.bclMerchants).set({ isDefault: false }).run();
    updates.isDefault = true;
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.bclMerchants).set(updates).where(eq(schema.bclMerchants.id, id)).run();
  }

  return NextResponse.json({ message: 'Merchant updated' });
}

// DELETE: remove merchant
export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Invalid app password' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  db.delete(schema.bclMerchants).where(eq(schema.bclMerchants.id, id)).run();
  return NextResponse.json({ message: 'Merchant deleted' });
}
