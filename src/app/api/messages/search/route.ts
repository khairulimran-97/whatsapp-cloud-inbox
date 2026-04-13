import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');
    const { client, profile } = resolveProfile(profileId);
    const phoneNumberId = searchParams.get('phoneNumberId') || profile.phoneNumberId;
    const conversationId = searchParams.get('conversationId') || undefined;
    const q = searchParams.get('q') || undefined;

    const result = await client.messages.query({
      phoneNumberId,
      ...(conversationId ? { conversationId } : {}),
    });

    let messages = Array.isArray(result?.data) ? result.data : [];

    // Client-side text filtering since Kapso SDK doesn't support search param
    if (q) {
      const query = q.toLowerCase();
      messages = messages.filter((msg: Record<string, unknown>) => {
        const content = typeof msg.content === 'string' ? msg.content : '';
        return content.toLowerCase().includes(query);
      });
    }

    return NextResponse.json({ data: messages, total: messages.length });
  } catch (error: unknown) {
    console.error('Error searching messages:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to search messages', details: message },
      { status: 500 }
    );
  }
}
