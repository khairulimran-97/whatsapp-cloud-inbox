import { NextRequest, NextResponse } from 'next/server';
import { getBclMonitorKey, getBclBaseUrl } from '@/lib/settings';

export async function POST(request: NextRequest) {
  const monitorKey = getBclMonitorKey();
  if (!monitorKey) {
    return NextResponse.json(
      { error: 'BCL_MONITOR_KEY not configured' },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { access_token } = body;

  if (!access_token || typeof access_token !== 'string') {
    return NextResponse.json(
      { error: 'access_token is required' },
      { status: 400 }
    );
  }

  try {
    const baseUrl = getBclBaseUrl();
    const res = await fetch(`${baseUrl}/api/internal/protected-content/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': monitorKey,
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ access_token }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return NextResponse.json(
        { error: `BCL API error: ${res.status}`, detail: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate magic link' },
      { status: 500 }
    );
  }
}
