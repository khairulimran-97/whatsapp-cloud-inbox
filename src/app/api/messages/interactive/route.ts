import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, header, body: bodyText, buttons, profileId } = body;

    if (!phoneNumber || !bodyText || !buttons || buttons.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, body, buttons' },
        { status: 400 }
      );
    }

    if (buttons.length > 3) {
      return NextResponse.json(
        { error: 'Maximum 3 buttons allowed' },
        { status: 400 }
      );
    }

    const { client, profile } = resolveProfile(profileId);

    const payload: {
      phoneNumberId: string;
      to: string;
      bodyText: string;
      header?: { type: 'text'; text: string };
      buttons: Array<{ id: string; title: string }>;
    } = {
      phoneNumberId: profile.phoneNumberId,
      to: phoneNumber,
      bodyText,
      buttons: buttons.map((btn: { id: string; title: string }) => ({
        id: btn.id,
        title: btn.title.substring(0, 20)
      }))
    };

    if (header) {
      payload.header = { type: 'text', text: header };
    }

    const result = await client.messages.sendInteractiveButtons(payload);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending interactive message:', error);
    return NextResponse.json(
      { error: 'Failed to send interactive message' },
      { status: 500 }
    );
  }
}
