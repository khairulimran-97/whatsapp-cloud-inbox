import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

async function readSettings(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSettings(settings: Record<string, string>) {
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function verifyAdmin(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('x-admin-secret');
  return provided === secret;
}

function maskKey(key: string): string {
  if (!key) return '';
  return `${'•'.repeat(Math.max(0, key.length - 8))}${key.slice(-8)}`;
}

// GET: returns masked key (safe, no auth needed)
export async function GET() {
  const adminConfigured = !!process.env.ADMIN_SECRET;
  const settings = await readSettings();
  const key = settings.bcl_api_key || '';
  return NextResponse.json({
    bcl_api_key: maskKey(key),
    bcl_configured: !!key,
    admin_configured: adminConfigured,
  });
}

// PUT: requires ADMIN_SECRET to update
export async function PUT(request: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET not set in environment' },
      { status: 503 }
    );
  }

  if (!verifyAdmin(request)) {
    return NextResponse.json(
      { error: 'Invalid admin secret' },
      { status: 401 }
    );
  }

  const body = await request.json();
  const settings = await readSettings();

  if (typeof body.bcl_api_key === 'string') {
    settings.bcl_api_key = body.bcl_api_key.trim();
  }

  await writeSettings(settings);

  const key = settings.bcl_api_key || '';
  return NextResponse.json({
    bcl_api_key: maskKey(key),
    bcl_configured: !!key,
    message: 'Settings saved',
  });
}
