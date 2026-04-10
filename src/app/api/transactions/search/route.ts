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
    const params = new URLSearchParams({
      search: q,
      page,
      per_page: perPage,
      status,
      sort_by: 'created_at',
      sort_order: 'desc',
    });

    const res = await fetch(`${creds.baseUrl}/api/transactions?${params}`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { configured: true, error: 'BCL API request failed' },
        { status: res.status }
      );
    }

    const data = await res.json();
    // Add receipt_url to each transaction
    if (data.data && Array.isArray(data.data)) {
      data.data = data.data.map((tx: Record<string, unknown>) => ({
        ...tx,
        receipt_url: tx.order_number ? `${creds.baseUrl}/receipts/${tx.order_number}` : null,
      }));
    }
    return NextResponse.json({ configured: true, ...data });
  } catch {
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch from BCL API' },
      { status: 500 }
    );
  }
}
