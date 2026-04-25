import { NextRequest, NextResponse } from 'next/server';
import { getBclCredentials } from '@/lib/settings';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const page = request.nextUrl.searchParams.get('page') || '1';
  const perPage = request.nextUrl.searchParams.get('per_page') || '20';
  const status = request.nextUrl.searchParams.get('status') || 'all';
  const merchantId = request.nextUrl.searchParams.get('merchant_id');

  if (!q) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 });
  }

  const creds = getBclCredentials(merchantId);
  if (!creds) {
    return NextResponse.json({ configured: false });
  }

  try {
    const txParams = new URLSearchParams({
      search: q,
      page,
      per_page: perPage,
      status,
      sort_by: 'created_at',
      sort_order: 'desc',
    });

    const headers = { Authorization: `Bearer ${creds.apiKey}` };
    const [txRes, participantsRes] = await Promise.all([
      fetch(`${creds.baseUrl}/api/transactions?${txParams}`, { headers }),
      fetch(`${creds.baseUrl}/api/participants?search=${encodeURIComponent(q)}&match_scope=any&per_page=50`, { headers }),
    ]);

    if (!txRes.ok) {
      return NextResponse.json(
        { configured: true, error: 'BCL API request failed' },
        { status: txRes.status }
      );
    }

    const data = await txRes.json();
    if (data.data && Array.isArray(data.data)) {
      data.data = data.data.map((tx: Record<string, unknown>) => ({
        ...tx,
        receipt_url: tx.order_number ? `${creds.baseUrl}/receipts/${tx.order_number}` : null,
      }));
    }

    let participants: Array<Record<string, unknown>> = [];
    if (participantsRes.ok) {
      const pj = await participantsRes.json().catch(() => null);
      if (pj && Array.isArray(pj.data)) {
        participants = pj.data;
      }
    }

    return NextResponse.json({ configured: true, ...data, participants });
  } catch {
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch from BCL API' },
      { status: 500 }
    );
  }
}
