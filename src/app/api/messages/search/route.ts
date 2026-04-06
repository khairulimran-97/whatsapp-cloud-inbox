import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumberId = searchParams.get('phoneNumberId') || PHONE_NUMBER_ID;
    const conversationId = searchParams.get('conversationId') || undefined;
    // Note: The Kapso SDK messages.query() does not support text search yet.
    // The `q` param is accepted but filtering must happen client-side.
    // Server-side text search can be added when the Kapso API supports it.
    const q = searchParams.get('q') || undefined;

    const result = await whatsappClient.messages.query({
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
