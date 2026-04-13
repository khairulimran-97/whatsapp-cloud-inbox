import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const { messageId, phoneNumberId, profileId } = await request.json();

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: messageId' },
        { status: 400 }
      );
    }

    const { client, profile } = resolveProfile(profileId);
    const resolvedPhoneNumberId = phoneNumberId || profile.phoneNumberId;

    const result = await client.messages.markRead({
      phoneNumberId: resolvedPhoneNumberId,
      messageId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Rate limits and invalid message IDs are non-critical for mark-read
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('Rate limit') || msg.includes('Invalid parameter') || msg.includes('does not exist')) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    console.error('Error marking message as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark message as read', details: msg || 'Unknown error' },
      { status: 500 }
    );
  }
}
