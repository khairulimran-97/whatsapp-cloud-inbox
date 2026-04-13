import { NextRequest, NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

// GET /api/conversations/status-by-phone?phone=60179789587&profileId=xxx
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 });
  }

  const profileId = req.nextUrl.searchParams.get('profileId');
  const { client, profile } = resolveProfile(profileId);

  try {
    const result = await client.conversations.list({
      phoneNumberId: profile.phoneNumberId,
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
