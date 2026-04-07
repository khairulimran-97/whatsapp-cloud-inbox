import { NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { count } from 'drizzle-orm';

export async function GET() {
  try {
    const db = getDb();
    const [convs] = db.select({ count: count() }).from(schema.conversations).all();
    const [msgs] = db.select({ count: count() }).from(schema.messages).all();
    const [contacts] = db.select({ count: count() }).from(schema.contacts).all();
    const seed = db.select().from(schema.settings).all()
      .find(r => r.key === 'seed_complete');

    return NextResponse.json({
      conversations: convs?.count ?? 0,
      messages: msgs?.count ?? 0,
      contacts: contacts?.count ?? 0,
      seedComplete: seed?.value === 'true',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
