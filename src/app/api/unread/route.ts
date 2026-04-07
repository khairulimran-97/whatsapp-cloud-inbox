import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { publish } from '@/lib/event-bus';

function getAllUnread(): Record<string, number> {
  const db = getDb();
  const rows = db.select().from(schema.unreadCounts).all();
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.count > 0) result[row.phone] = row.count;
  }
  return result;
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
  return NextResponse.json(getAllUnread());
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
    const db = getDb();

    if (increment) {
      for (const phone of increment) {
        db.insert(schema.unreadCounts)
          .values({ phone, count: 1, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.unreadCounts.phone,
            set: { count: sql`${schema.unreadCounts.count} + 1`, updatedAt: new Date() },
          })
          .run();
      }
    }
    if (clear) {
      for (const phone of clear) {
        db.delete(schema.unreadCounts).where(eq(schema.unreadCounts.phone, phone)).run();
      }
    }

    const current = getAllUnread();
    broadcastUnreadUpdate(current);
    return NextResponse.json(current);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
