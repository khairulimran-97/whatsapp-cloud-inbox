import { NextRequest, NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

// GET /api/conversations/status-by-phone?phone=60179789587
// Returns all conversation IDs and their statuses for a phone number
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 });
  }

  try {
    const result = await whatsappClient.conversations.list({
      phoneNumberId: PHONE_NUMBER_ID,
      phoneNumber: phone,
      limit: 20,
    });

    const sessions: Record<string, string> = {};
    const allIds: string[] = [];
    for (const conv of result.data) {
      sessions[conv.id] = conv.status ?? 'active';
      allIds.push(conv.id);
    }

    return NextResponse.json({ sessions, conversationIds: allIds });
  } catch (error) {
    console.error('[StatusByPhone] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
