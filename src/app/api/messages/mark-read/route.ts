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
    // Rate limits are non-critical for mark-read — return 200 silently
    const isRateLimit = error instanceof Error && error.message.includes('Rate limit');
    if (isRateLimit) {
      return NextResponse.json({ ok: true, skipped: 'rate_limited' });
    }
    console.error('Error marking message as read:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to mark message as read', details: message },
      { status: 500 }
    );
  }
}
