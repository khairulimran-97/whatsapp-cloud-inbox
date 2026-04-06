import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const { phoneNumber, messageId, emoji } = await request.json();

    if (!phoneNumber || !messageId) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, messageId' },
        { status: 400 }
      );
    }

    // Empty emoji removes the reaction
    const result = await whatsappClient.messages.sendReaction({
      phoneNumberId: PHONE_NUMBER_ID,
      to: phoneNumber,
      reaction: { messageId, emoji: emoji || '' },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error sending reaction:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to send reaction', details: message },
      { status: 500 }
    );
  }
}
