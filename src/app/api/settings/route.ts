import { NextRequest, NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

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

// GET: returns masked key (safe, no auth needed)
export async function GET() {
  const adminConfigured = !!process.env.APP_PASSWORD;
  const db = getDb();
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'bcl_api_key')).get();
  const key = row?.value || '';
  return NextResponse.json({
    bcl_api_key: maskKey(key),
    bcl_configured: !!key,
    app_password_configured: adminConfigured,
  });
}

// PUT: requires APP_PASSWORD to update
export async function PUT(request: NextRequest) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: 'APP_PASSWORD not set in environment' },
      { status: 503 }
    );
  }

  if (!verifyAdmin(request)) {
    return NextResponse.json(
      { error: 'Invalid app password' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const db = getDb();

  if (typeof body.bcl_api_key === 'string') {
    const value = body.bcl_api_key.trim();
    db.insert(schema.settings)
      .values({ key: 'bcl_api_key', value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })
      .run();
  }

  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'bcl_api_key')).get();
  const key = row?.value || '';
  return NextResponse.json({
    bcl_api_key: maskKey(key),
    bcl_configured: !!key,
    message: 'Settings saved',
  });
}
