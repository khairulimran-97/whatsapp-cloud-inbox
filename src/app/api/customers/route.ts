import { NextRequest, NextResponse } from 'next/server';
import { getBclCredentials } from '@/lib/settings';

type CacheEntry = {
  data: Record<string, unknown>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(key: string): Record<string, unknown> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

type Participant = {
  id: number | string;
  match_sources?: string[];
  [key: string]: unknown;
};

function mergeParticipants(primary: Participant[], secondary: Participant[]): Participant[] {
  const map = new Map<string, Participant>();
  for (const p of primary) if (p?.id != null) map.set(String(p.id), p);
  for (const p of secondary) {
    if (p?.id == null) continue;
    const key = String(p.id);
    if (!map.has(key)) map.set(key, p);
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const aEvent = (a.event as Record<string, string> | undefined)?.starts_at || '';
    const bEvent = (b.event as Record<string, string> | undefined)?.starts_at || '';
    if (aEvent !== bEvent) return bEvent.localeCompare(aEvent);
    const aCreated = String(a.created_at || '');
    const bCreated = String(b.created_at || '');
    return bCreated.localeCompare(aCreated);
  });
  return merged;
}

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone parameter is required' }, { status: 400 });
  }

  const merchantId = request.nextUrl.searchParams.get('merchant_id');
  const creds = getBclCredentials(merchantId);
  if (!creds) {
    return NextResponse.json({ configured: false });
  }

  const cacheKey = `${merchantId || 'default'}:${phone}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const headers = { Authorization: `Bearer ${creds.apiKey}` };
  const baseUrl = creds.baseUrl;

  try {
    const [searchRes, participantRes] = await Promise.all([
      fetch(`${baseUrl}/api/customers?search=${encodeURIComponent(phone)}`, { headers }),
      fetch(`${baseUrl}/api/participants?search=${encodeURIComponent(phone)}&match_scope=any&per_page=50`, { headers }),
    ]);

    let customerParticipants: Participant[] = [];
    let customer: Record<string, unknown> | null = null;
    let stats: Record<string, unknown> | null = null;
    let recentTxns: Array<Record<string, unknown>> = [];
    let protectedContent: Array<Record<string, unknown>> = [];
    let customerFound = false;

    if (searchRes.ok) {
      const searchData = await searchRes.json().catch(() => null);
      const customers = (searchData?.data ?? []) as Array<Record<string, unknown>>;

      if (Array.isArray(customers) && customers.length > 0) {
        const customerId = customers[0].id;
        const detailRes = await fetch(
          `${baseUrl}/api/customers/${customerId}`,
          { headers }
        );

        if (detailRes.ok) {
          const detailData = await detailRes.json().catch(() => null);
          const detail = detailData?.data;
          customer = (detail?.customer as Record<string, unknown>) ?? null;
          stats = (detail?.stats as Record<string, unknown>) ?? null;
          customerFound = !!customer;

          const allTxns = (detail?.recent_transactions ?? []) as Array<Record<string, unknown>>;
          recentTxns = allTxns.slice(0, 5).map((tx) => ({
            ...tx,
            receipt_url: tx.order_number
              ? `${baseUrl}/receipts/${tx.order_number}`
              : null,
          }));

          const pcMap = new Map<string, Record<string, unknown>>();
          for (const tx of allTxns) {
            const pcs = (tx.protected_content ?? []) as Array<Record<string, unknown>>;
            for (const pc of pcs) {
              const title = String(pc.title ?? '');
              if (title && !pcMap.has(title)) pcMap.set(title, pc);
            }
          }
          protectedContent = Array.from(pcMap.values());

          customerParticipants = (detail?.participants ?? []) as Participant[];
        }
      }
    }

    let searchParticipants: Participant[] = [];
    if (participantRes.ok) {
      const pj = await participantRes.json().catch(() => null);
      if (pj && Array.isArray(pj.data)) {
        searchParticipants = pj.data as Participant[];
      }
    }

    const participants = mergeParticipants(customerParticipants, searchParticipants);
    const uniqueOrders = new Set(
      participants
        .map((p) => (p.order as Record<string, unknown> | undefined)?.order_number)
        .filter(Boolean)
    ).size;

    const found = customerFound || participants.length > 0;

    const result = {
      configured: true,
      found,
      customerFound,
      customer,
      stats,
      recentTransactions: recentTxns,
      protectedContent,
      participants,
      participantsSummary: {
        total: participants.length,
        uniqueOrders,
      },
      merchantName: creds.merchantName,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { configured: true, found: false, error: 'Failed to fetch from BCL API' },
      { status: 500 }
    );
  }
}
