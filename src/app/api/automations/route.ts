import { NextRequest, NextResponse } from 'next/server';
import { getBclCredentials, getBclMerchants } from '@/lib/settings';

export async function GET(request: NextRequest) {
  const merchantId = request.nextUrl.searchParams.get('merchant_id');

  // If no merchant specified, return automations for all merchants
  if (!merchantId) {
    const merchants = getBclMerchants();
    if (merchants.length === 0) {
      const creds = getBclCredentials();
      if (!creds) return NextResponse.json({ configured: false, data: [] });
      try {
        const res = await fetch(`${creds.baseUrl}/api/automations`, {
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
        if (!res.ok) return NextResponse.json({ configured: true, data: [], error: 'API error' }, { status: res.status });
        const json = await res.json();
        return NextResponse.json({ configured: true, data: json.data || [], meta: json.meta });
      } catch {
        return NextResponse.json({ configured: true, data: [], error: 'Failed to fetch' }, { status: 500 });
      }
    }

    // Fetch from all merchants in parallel
    const results = await Promise.allSettled(
      merchants.map(async (m) => {
        const creds = getBclCredentials(m.id);
        if (!creds) return { merchantId: m.id, merchantName: m.name, data: [] };
        const res = await fetch(`${creds.baseUrl}/api/automations`, {
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
        if (!res.ok) return { merchantId: m.id, merchantName: m.name, data: [], error: 'API error' };
        const json = await res.json();
        return {
          merchantId: m.id,
          merchantName: m.name,
          data: (json.data || []).map((a: Record<string, unknown>) => ({ ...a, merchantId: m.id, merchantName: m.name })),
          meta: json.meta,
        };
      })
    );

    const allAutomations = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value.data : []
    );

    return NextResponse.json({ configured: true, data: allAutomations });
  }

  // Single merchant
  const creds = getBclCredentials(merchantId);
  if (!creds) return NextResponse.json({ configured: false, data: [] });

  try {
    const res = await fetch(`${creds.baseUrl}/api/automations`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    if (!res.ok) return NextResponse.json({ configured: true, data: [], error: 'API error' }, { status: res.status });
    const json = await res.json();
    const data = (json.data || []).map((a: Record<string, unknown>) => ({
      ...a,
      merchantId,
      merchantName: creds.merchantName,
    }));
    return NextResponse.json({ configured: true, data, meta: json.meta });
  } catch {
    return NextResponse.json({ configured: true, data: [], error: 'Failed to fetch' }, { status: 500 });
  }
}
