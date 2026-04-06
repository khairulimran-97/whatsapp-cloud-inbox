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

  const apiKey = await getBclApiKey();
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

    // Enrich transactions with receipt_url + protected content from /transactions/{orderNumber}
    const protectedContentMap = new Map<string, { title: string; url?: string; access_finder_url?: string }>();

    const enrichedTxns = await Promise.all(
      successTxns.map(async (tx) => {
        if (!tx.order_number) return tx;
        try {
          const txRes = await fetch(
            `https://bcl.my/api/transactions/${encodeURIComponent(String(tx.order_number))}`,
            { headers }
          );
          if (txRes.ok) {
            const txData = await txRes.json();
            const txDetail = txData?.data;
            const receiptUrl = txDetail?.receipt_url ?? null;

            // Collect protected content from transaction items
            const items = txDetail?.main_data?.items ?? [];
            for (const item of items) {
              const pcList = item?.protected_content ?? [];
              for (const pc of pcList) {
                if (pc?.title && !protectedContentMap.has(pc.title)) {
                  protectedContentMap.set(pc.title, {
                    title: pc.title,
                    url: pc.url ?? undefined,
                    access_finder_url: pc.access_finder_url ?? undefined,
                  });
                }
              }
            }

            return { ...tx, receipt_url: receiptUrl };
          }
        } catch { /* ignore */ }
        return tx;
      })
    );

    // Merge protected content: from customer endpoint + enriched from transactions
    const customerPC = (detail?.protected_content ?? []) as Array<Record<string, unknown>>;
    const mergedPC = customerPC.map((pc) => {
      const enriched = protectedContentMap.get(String(pc.title));
      if (enriched) {
        protectedContentMap.delete(String(pc.title));
        return { ...pc, url: enriched.url, access_finder_url: enriched.access_finder_url };
      }
      return pc;
    });
    // Add any extra protected content found only in transactions
    for (const extra of protectedContentMap.values()) {
      mergedPC.push(extra);
    }

    const result = {
      configured: true,
      found: true,
      customer: detail?.customer ?? null,
      stats: detail?.stats ?? null,
      recentTransactions: enrichedTxns,
      protectedContent: mergedPC,
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
