import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing required parameter: conversationId' },
        { status: 400 }
      );
    }

    // Lightweight SQLite-only lookup (for polling, no API call)
    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');

    if (url.searchParams.get('source') === 'db') {
      try {
        const db = getDb();
        const row = db.select({ status: schema.conversations.status })
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .get();
        if (row) {
          return NextResponse.json({ status: row.status });
        }
      } catch {
        // Fall through to API
      }
    }

    const { client } = resolveProfile(profileId);

    const result = await client.conversations.get({
      conversationId,
    });

    // Update SQLite with fresh status from Kapso
    if (result?.status) {
      try {
        const db = getDb();
        db.update(schema.conversations)
          .set({ status: result.status, updatedAt: new Date() })
          .where(eq(schema.conversations.id, conversationId))
          .run();
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error fetching conversation:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch conversation', details: message },
      { status: 500 }
    );
  }
}
