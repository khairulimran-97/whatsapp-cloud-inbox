import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const { phoneNumber, bodyText, buttonText, sections, header, footerText, profileId } = await request.json();

    if (!phoneNumber || !bodyText || !buttonText || !sections || sections.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, bodyText, buttonText, sections' },
        { status: 400 }
      );
    }

    const { client, profile } = resolveProfile(profileId);
    const result = await client.messages.sendInteractiveList({
      phoneNumberId: profile.phoneNumberId,
      to: phoneNumber,
      bodyText,
      buttonText,
      sections,
      header: header ? { type: 'text', text: header } : undefined,
      footerText: footerText || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error sending interactive list message:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to send interactive list message', details: message },
      { status: 500 }
    );
  }
}
