import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { desc, eq, and, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('event');
    const phone = searchParams.get('phone');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    const conditions = [];
    if (eventType) conditions.push(eq(schema.webhookLogs.eventType, eventType));
    if (phone) conditions.push(eq(schema.webhookLogs.phoneNumber, phone));

    const logs = conditions.length > 0
      ? db.select().from(schema.webhookLogs)
          .where(and(...conditions))
          .orderBy(desc(schema.webhookLogs.createdAt)).limit(limit).all()
      : db.select().from(schema.webhookLogs)
          .orderBy(desc(schema.webhookLogs.createdAt)).limit(limit).all();

    // Count by event type
    const counts = db.select({
      eventType: schema.webhookLogs.eventType,
      count: sql<number>`count(*)`,
    }).from(schema.webhookLogs).groupBy(schema.webhookLogs.eventType).all();

    const total = db.select({ count: sql<number>`count(*)` }).from(schema.webhookLogs).get();

    return NextResponse.json({
      total: total?.count ?? 0,
      counts,
      logs: logs.map(l => ({
        ...l,
        payload: JSON.parse(l.payload),
      })),
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
