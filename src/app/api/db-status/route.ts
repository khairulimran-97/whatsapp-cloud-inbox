import { NextRequest, NextResponse } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { count, eq, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const profileId = request.nextUrl.searchParams.get('profileId');

    let phoneNumberId: string | null = null;
    if (profileId) {
      const profile = db.select().from(schema.waProfiles).where(eq(schema.waProfiles.id, profileId)).get();
      phoneNumberId = profile?.phoneNumberId ?? null;
    }

    let convCount = 0;
    let msgCount = 0;
    let contactCount = 0;

    if (phoneNumberId) {
      // Filter by profile's phoneNumberId
      const [convs] = db.select({ count: count() }).from(schema.conversations)
        .where(eq(schema.conversations.phoneNumberId, phoneNumberId)).all();
      convCount = convs?.count ?? 0;

      // Messages: filter by conversations belonging to this profile
      const convIds = db.select({ id: schema.conversations.id }).from(schema.conversations)
        .where(eq(schema.conversations.phoneNumberId, phoneNumberId)).all().map(c => c.id);
      if (convIds.length > 0) {
        const [msgs] = db.select({ count: count() }).from(schema.messages)
          .where(inArray(schema.messages.conversationId, convIds)).all();
        msgCount = msgs?.count ?? 0;
      }

      const [contacts] = db.select({ count: count() }).from(schema.contacts).all();
      contactCount = contacts?.count ?? 0;
    } else {
      const [convs] = db.select({ count: count() }).from(schema.conversations).all();
      const [msgs] = db.select({ count: count() }).from(schema.messages).all();
      const [contacts] = db.select({ count: count() }).from(schema.contacts).all();
      convCount = convs?.count ?? 0;
      msgCount = msgs?.count ?? 0;
      contactCount = contacts?.count ?? 0;
    }

    const seed = db.select().from(schema.settings).all()
      .find(r => r.key === 'seed_complete');

    return NextResponse.json({
      conversations: convCount,
      messages: msgCount,
      contacts: contactCount,
      seedComplete: seed?.value === 'true',
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
