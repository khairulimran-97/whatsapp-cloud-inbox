import { NextRequest, NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

function maskKey(key: string): string {
  if (!key) return '';
  return `${'•'.repeat(Math.max(0, key.length - 8))}${key.slice(-8)}`;
}

// GET: list all WA profiles (API keys masked) + BCL mappings
export async function GET() {
  const db = getDb();
  const profiles = db.select().from(schema.waProfiles).all();
  const mappings = db.select().from(schema.waProfileBcl).all();

  return NextResponse.json({
    profiles: profiles.map(p => ({
      id: p.id,
      label: p.label,
      phoneNumberId: p.phoneNumberId,
      wabaId: p.wabaId,
      kapsoApiKey: maskKey(p.kapsoApiKey),
      phoneDisplay: p.phoneDisplay,
      isDefault: p.isDefault,
      synced: p.synced,
      lastSyncedAt: p.lastSyncedAt,
      bclMerchantIds: mappings.filter(m => m.profileId === p.id).map(m => m.bclMerchantId),
    })),
  });
}

// POST: add profile
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { label, phone_number_id, waba_id, kapso_api_key, phone_display, bcl_merchant_ids } = body;

  if (!label?.trim() || !phone_number_id?.trim() || !waba_id?.trim() || !kapso_api_key?.trim()) {
    return NextResponse.json(
      { error: 'label, phone_number_id, waba_id, and kapso_api_key are required' },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = Math.random().toString(36).slice(2, 10);
  const existing = db.select().from(schema.waProfiles).all();
  const isDefault = existing.length === 0;

  db.insert(schema.waProfiles).values({
    id,
    label: label.trim(),
    phoneNumberId: phone_number_id.trim(),
    wabaId: waba_id.trim(),
    kapsoApiKey: kapso_api_key.trim(),
    phoneDisplay: phone_display?.trim() || null,
    isDefault,
    createdAt: new Date(),
  }).run();

  // Save BCL merchant mappings
  if (Array.isArray(bcl_merchant_ids)) {
    for (const merchantId of bcl_merchant_ids) {
      db.insert(schema.waProfileBcl).values({
        profileId: id,
        bclMerchantId: merchantId,
      }).run();
    }
  }

  return NextResponse.json({ id, message: 'Profile added' });
}

// PUT: update profile
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, label, phone_number_id, waba_id, kapso_api_key, phone_display, is_default, bcl_merchant_ids } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  const updates: Record<string, unknown> = {};
  if (label?.trim()) updates.label = label.trim();
  if (phone_number_id?.trim()) updates.phoneNumberId = phone_number_id.trim();
  if (waba_id?.trim()) updates.wabaId = waba_id.trim();
  if (kapso_api_key?.trim()) updates.kapsoApiKey = kapso_api_key.trim();
  if (phone_display !== undefined) updates.phoneDisplay = phone_display?.trim() || null;
  if (is_default === true) {
    db.update(schema.waProfiles).set({ isDefault: false }).run();
    updates.isDefault = true;
  }

  if (Object.keys(updates).length > 0) {
    db.update(schema.waProfiles).set(updates).where(eq(schema.waProfiles.id, id)).run();
  }

  // Update BCL merchant mappings if provided
  if (Array.isArray(bcl_merchant_ids)) {
    db.delete(schema.waProfileBcl).where(eq(schema.waProfileBcl.profileId, id)).run();
    for (const merchantId of bcl_merchant_ids) {
      db.insert(schema.waProfileBcl).values({
        profileId: id,
        bclMerchantId: merchantId,
      }).run();
    }
  }

  return NextResponse.json({ message: 'Profile updated' });
}

// DELETE: remove profile
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const db = getDb();
  db.delete(schema.waProfileBcl).where(eq(schema.waProfileBcl.profileId, id)).run();
  db.delete(schema.waProfiles).where(eq(schema.waProfiles.id, id)).run();
  return NextResponse.json({ message: 'Profile deleted' });
}
