import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';

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
