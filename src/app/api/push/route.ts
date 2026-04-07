import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

// POST — subscribe
export async function POST(request: Request) {
  try {
    const subscription = await request.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const db = getDb();
    db.insert(schema.pushSubscriptions)
      .values({
        endpoint: subscription.endpoint,
        keysJson: JSON.stringify(subscription.keys || {}),
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { keysJson: JSON.stringify(subscription.keys || {}), createdAt: new Date() },
      })
      .run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

// DELETE — unsubscribe
export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const db = getDb();
    db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint)).run();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
