import { NextRequest, NextResponse } from 'next/server';

type CacheEntry = {
  data: Record<string, unknown>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(phone: string): Record<string, unknown> | null {
  const entry = cache.get(phone);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(phone);
    return null;
  }
  return entry.data;
}

function setCache(phone: string, data: Record<string, unknown>) {
  cache.set(phone, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone parameter is required' }, { status: 400 });
  }

  const apiKey = process.env.BCL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false });
  }

  const cached = getCached(phone);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const headers = { Authorization: `Bearer ${apiKey}` };

    const searchRes = await fetch(
      `https://bcl.my/api/customers?search=${encodeURIComponent(phone)}`,
      { headers }
    );

    if (!searchRes.ok) {
      return NextResponse.json(
        { configured: true, found: false, error: 'BCL API search failed' },
        { status: searchRes.status }
      );
    }

    const searchData = await searchRes.json();
    const customers = searchData?.data;

    if (!Array.isArray(customers) || customers.length === 0) {
      const result = { configured: true, found: false };
      setCache(phone, result);
      return NextResponse.json(result);
    }

    const customerId = customers[0].id;
    const detailRes = await fetch(
      `https://bcl.my/api/customers/${customerId}`,
      { headers }
    );

    if (!detailRes.ok) {
      const result = { configured: true, found: false, error: 'BCL API detail fetch failed' };
      return NextResponse.json(result, { status: detailRes.status });
    }

    const detailData = await detailRes.json();
    const detail = detailData?.data;

    // Filter to successful transactions, take top 5
    const allTxns = (detail?.recent_transactions ?? []) as Array<Record<string, unknown>>;
    const successTxns = allTxns
      .filter((tx) => tx.status === 'success' || tx.is_paid === true)
      .slice(0, 5);

    // Enrich transactions with receipt_url from /transaction/{orderNumber}
    const enrichedTxns = await Promise.all(
      successTxns.map(async (tx) => {
        if (!tx.order_number) return tx;
        try {
          const txRes = await fetch(
            `https://bcl.my/api/transaction/${encodeURIComponent(String(tx.order_number))}`,
            { headers }
          );
          if (txRes.ok) {
            const txData = await txRes.json();
            const receiptUrl = txData?.data?.short_link ?? null;
            return { ...tx, receipt_url: receiptUrl };
          }
        } catch { /* ignore */ }
        return tx;
      })
    );

    const result = {
      configured: true,
      found: true,
      customer: detail?.customer ?? null,
      stats: detail?.stats ?? null,
      recentTransactions: enrichedTxns,
      protectedContent: detail?.protected_content ?? [],
    };

    setCache(phone, result);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { configured: true, found: false, error: 'Failed to fetch from BCL API' },
      { status: 500 }
    );
  }
}
