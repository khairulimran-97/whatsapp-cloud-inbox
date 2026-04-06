import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const { messageId, phoneNumberId } = await request.json();

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: messageId' },
        { status: 400 }
      );
    }

    const resolvedPhoneNumberId = phoneNumberId || PHONE_NUMBER_ID;

    const result = await whatsappClient.messages.markRead({
      phoneNumberId: resolvedPhoneNumberId,
      messageId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error marking message as read:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to mark message as read', details: message },
      { status: 500 }
    );
  }
}
