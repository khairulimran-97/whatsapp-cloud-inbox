import { NextRequest, NextResponse } from 'next/server';
import { getBclApiKey } from '@/lib/settings';

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

  const apiKey = getBclApiKey();
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

    // Show all recent transactions (top 5)
    const allTxns = (detail?.recent_transactions ?? []) as Array<Record<string, unknown>>;
    const recentTxns = allTxns
      .slice(0, 5)
      .map((tx) => ({
        ...tx,
        receipt_url: tx.order_number
          ? `https://bcl.my/receipts/${tx.order_number}`
          : null,
      }));

    // Collect unique protected content across all transactions
    const pcMap = new Map<string, Record<string, unknown>>();
    for (const tx of allTxns) {
      const pcList = (tx.protected_content ?? []) as Array<Record<string, unknown>>;
      for (const pc of pcList) {
        const title = String(pc.title ?? '');
        if (title && !pcMap.has(title)) {
          pcMap.set(title, pc);
        }
      }
    }

    const result = {
      configured: true,
      found: true,
      customer: detail?.customer ?? null,
      stats: detail?.stats ?? null,
      recentTransactions: recentTxns,
      protectedContent: Array.from(pcMap.values()),
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
