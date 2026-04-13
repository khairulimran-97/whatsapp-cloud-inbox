import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { publish } from '@/lib/event-bus';

function getAllUnread(phoneNumberId?: string | null): Record<string, number> {
  const db = getDb();
  const rows = db.select().from(schema.unreadCounts).all();
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.count <= 0) continue;
    // Keys are either "phone" (legacy) or "phone:phoneNumberId" (new)
    const parts = row.phone.split(':');
    const phone = parts[0];
    const pnid = parts[1]; // undefined for legacy keys
    // Filter by phoneNumberId if provided
    if (phoneNumberId && pnid && pnid !== phoneNumberId) continue;
    // If same phone already counted (from legacy + new key), take the max
    result[phone] = Math.max(result[phone] ?? 0, row.count);
  }
  return result;
}

// Returns raw composite keys (phone:phoneNumberId) for SSE broadcast
// so clients can filter by their active profile
function getRawUnread(): Record<string, number> {
  const db = getDb();
  const rows = db.select().from(schema.unreadCounts).all();
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.count <= 0) continue;
    result[row.phone] = row.count;
  }
  return result;
}

function broadcastUnreadUpdate() {
  publish({
    type: 'unread_update',
    timestamp: new Date().toISOString(),
    data: getRawUnread(),
  });
}

// GET — load unread counts (optionally filtered by phoneNumberId)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phoneNumberId = searchParams.get('phoneNumberId');
  return NextResponse.json(getAllUnread(phoneNumberId));
}

// PUT — full replace (bulk save)
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return NextResponse.json({ error: 'Expected object { phone: count }' }, { status: 400 });
    }

    const db = getDb();
    // Clear all and re-insert
    db.delete(schema.unreadCounts).run();
    for (const [phone, count] of Object.entries(data as Record<string, number>)) {
      if (count > 0) {
        db.insert(schema.unreadCounts)
          .values({ phone, count, updatedAt: new Date() })
          .run();
      }
    }

    broadcastUnreadUpdate();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

// PATCH — increment or clear specific phone numbers
export async function PATCH(request: Request) {
  try {
    const { increment, clear, phoneNumberId } = await request.json() as {
      increment?: string[];
      clear?: string[];
      phoneNumberId?: string;
    };
    const db = getDb();

    if (increment) {
      for (const phone of increment) {
        const key = phoneNumberId ? `${phone}:${phoneNumberId}` : phone;
        db.insert(schema.unreadCounts)
          .values({ phone: key, count: 1, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.unreadCounts.phone,
            set: { count: sql`${schema.unreadCounts.count} + 1`, updatedAt: new Date() },
          })
          .run();
      }
    }
    if (clear) {
      for (const phone of clear) {
        // Clear both legacy "phone" and composite "phone:phoneNumberId" keys
        db.delete(schema.unreadCounts).where(eq(schema.unreadCounts.phone, phone)).run();
        if (phoneNumberId) {
          db.delete(schema.unreadCounts).where(eq(schema.unreadCounts.phone, `${phone}:${phoneNumberId}`)).run();
        }
      }
    }

    const current = getAllUnread();
    broadcastUnreadUpdate();
    return NextResponse.json(current);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
