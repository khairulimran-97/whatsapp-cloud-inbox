import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { publish } from '@/lib/event-bus';

const DATA_DIR = path.join(process.cwd(), 'data');
const UNREAD_FILE = path.join(DATA_DIR, 'unread.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readUnread(): Record<string, number> {
  try {
    if (!fs.existsSync(UNREAD_FILE)) return {};
    return JSON.parse(fs.readFileSync(UNREAD_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeUnread(data: Record<string, number>) {
  ensureDataDir();
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v > 0) cleaned[k] = v;
  }
  fs.writeFileSync(UNREAD_FILE, JSON.stringify(cleaned, null, 2));
}

function broadcastUnreadUpdate(unread: Record<string, number>) {
  publish({
    type: 'unread_update',
    timestamp: new Date().toISOString(),
    data: unread,
  });
}

// GET — load all unread counts
export async function GET() {
  return NextResponse.json(readUnread());
}

// PUT — full replace (bulk save)
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return NextResponse.json({ error: 'Expected object { phone: count }' }, { status: 400 });
    }
    writeUnread(data as Record<string, number>);
    broadcastUnreadUpdate(data as Record<string, number>);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

// PATCH — increment or clear specific phone numbers
export async function PATCH(request: Request) {
  try {
    const { increment, clear } = await request.json() as {
      increment?: string[];
      clear?: string[];
    };
    const current = readUnread();

    if (increment) {
      for (const phone of increment) {
        current[phone] = (current[phone] ?? 0) + 1;
      }
    }
    if (clear) {
      for (const phone of clear) {
        delete current[phone];
      }
    }

    writeUnread(current);
    broadcastUnreadUpdate(current);
    return NextResponse.json(current);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
