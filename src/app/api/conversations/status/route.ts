import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function PATCH(request: Request) {
  try {
    const { conversationId, status, profileId } = await request.json();

    if (!conversationId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, status' },
        { status: 400 }
      );
    }

    if (status !== 'active' && status !== 'ended') {
      return NextResponse.json(
        { error: 'Status must be "active" or "ended"' },
        { status: 400 }
      );
    }

    const { profile } = resolveProfile(profileId);

    const response = await fetch(
      `https://api.kapso.ai/platform/v1/whatsapp/conversations/${conversationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': profile.kapsoApiKey,
        },
        body: JSON.stringify({ whatsapp_conversation: { status } }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Kapso API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update conversation status' },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error updating conversation status:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update conversation status', details: message },
      { status: 500 }
    );
  }
}
