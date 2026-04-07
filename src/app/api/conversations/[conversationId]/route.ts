import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
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

    const result = await whatsappClient.conversations.get({
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
