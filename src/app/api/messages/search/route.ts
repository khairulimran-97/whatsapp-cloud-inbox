import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumberId = searchParams.get('phoneNumberId') || PHONE_NUMBER_ID;

    const result = await whatsappClient.messages.query({
      phoneNumberId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error searching messages:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to search messages', details: message },
      { status: 500 }
    );
  }
}
