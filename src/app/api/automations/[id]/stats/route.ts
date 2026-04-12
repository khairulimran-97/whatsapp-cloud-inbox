import { NextRequest, NextResponse } from 'next/server';
import { getBclCredentials } from '@/lib/settings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const merchantId = request.nextUrl.searchParams.get('merchant_id');

  const creds = getBclCredentials(merchantId);
  if (!creds) return NextResponse.json({ configured: false, data: null });

  try {
    const res = await fetch(`${creds.baseUrl}/api/automations/${id}/stats`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return NextResponse.json({ configured: true, data: null, error: 'API error' }, { status: res.status });
    const json = await res.json();
    return NextResponse.json({ configured: true, data: json.data });
  } catch {
    return NextResponse.json({ configured: true, data: null, error: 'Failed to fetch' }, { status: 500 });
  }
}
