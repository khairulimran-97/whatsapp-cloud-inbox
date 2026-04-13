import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const { phoneNumber, bodyText, displayText, url, header, footerText, profileId } = await request.json();

    if (!phoneNumber || !bodyText || !displayText || !url) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, bodyText, displayText, url' },
        { status: 400 }
      );
    }

    const { client, profile } = resolveProfile(profileId);
    const result = await client.messages.sendInteractiveCtaUrl({
      phoneNumberId: profile.phoneNumberId,
      to: phoneNumber,
      bodyText,
      parameters: { displayText, url },
      header: header ? { type: 'text', text: header } : undefined,
      footerText: footerText || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error sending CTA URL message:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to send CTA URL message', details: message },
      { status: 500 }
    );
  }
}
