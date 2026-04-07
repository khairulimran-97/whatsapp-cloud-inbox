import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type ConversationKapsoExtensions,
  type ConversationRecord
} from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
import { getDb, schema } from '@/lib/db';
import { sql, desc, eq } from 'drizzle-orm';

function parseDirection(kapso?: ConversationKapsoExtensions): 'inbound' | 'outbound' {
  if (!kapso) {
    return 'inbound';
  }

  const inboundAt = typeof kapso.lastInboundAt === 'string' ? Date.parse(kapso.lastInboundAt) : Number.NaN;
  const outboundAt = typeof kapso.lastOutboundAt === 'string' ? Date.parse(kapso.lastOutboundAt) : Number.NaN;

  if (Number.isFinite(inboundAt) && Number.isFinite(outboundAt)) {
    return inboundAt >= outboundAt ? 'inbound' : 'outbound';
  }

  if (Number.isFinite(inboundAt)) return 'inbound';
  if (Number.isFinite(outboundAt)) return 'outbound';
  return 'inbound';
}

type GroupedConversation = {
  id: string;
  conversationIds: string[];
  conversationStatuses: Record<string, string>;
  phoneNumber: string;
  status: string;
  lastActiveAt?: string;
  phoneNumberId: string;
  metadata: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  lastMessage?: { content: string; direction: string; type?: string };
  totalConversations?: number;
};

const KAPSO_FIELDS = buildKapsoFields([
  'contact_name',
  'messages_count',
  'last_message_type',
  'last_message_text',
  'last_message_timestamp',
  'last_inbound_at',
  'last_outbound_at'
]);

const DEFAULT_PAGE_SIZE = 30;

// In-memory cache of all grouped conversations fetched so far
let cachedData: GroupedConversation[] | null = null;
let cacheTimestamp = 0;
// Kapso API cursor for next page of raw conversations
let nextApiCursor: string | undefined;
// Whether we've exhausted all pages from the Kapso API
let allPagesFetched = false;
const CACHE_TTL_MS = 30_000; // 30s — SSE handles freshness
const PAGE_SIZE = 50; // contacts per page for initial/scroll loading

// Cache ALL conversation IDs per phone (not sliced) for "load older" feature
const allIdsPerPhone = new Map<string, string[]>();

// Return a page of cached data
function paginateCache(page: number): { data: GroupedConversation[]; hasMore: boolean; total: number } {
  if (!cachedData) return { data: [], hasMore: false, total: 0 };
  const start = (page - 1) * PAGE_SIZE;
  const slice = cachedData.slice(start, start + PAGE_SIZE);
  return { data: slice, hasMore: start + PAGE_SIZE < cachedData.length, total: cachedData.length };
}

// Check if webhook has invalidated our cache
const CONV_CACHE_KEY = Symbol.for('__kapso_conv_cache_invalidated__');
function isCacheInvalidated(): boolean {
  const invalidatedAt = (globalThis as Record<symbol, number>)[CONV_CACHE_KEY] ?? 0;
  return invalidatedAt > cacheTimestamp;
}

// Track whether initial API seed has completed (survives restarts via SQLite)
function isSeedComplete(): boolean {
  try {
    const db = getDb();
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'seed_complete')).get();
    return row?.value === 'true';
  } catch { return false; }
}

function markSeedComplete() {
  try {
    const db = getDb();
    db.insert(schema.settings)
      .values({ key: 'seed_complete', value: 'true' })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: 'true', updatedAt: new Date() } })
      .run();
  } catch (e) {
    console.error('[Conversations] Failed to mark seed complete:', e);
  }
}

// Persist Kapso API conversations to SQLite for cache-first loading
function persistConversationsToDb(records: ConversationRecord[]) {
  try {
    const db = getDb();
    db.transaction((tx) => {
      for (const conv of records) {
        const kapso = conv.kapso;
        const phone = conv.phoneNumber ?? '';
        if (!phone) continue;

        // Prefer last_message_timestamp for display, fall back to updatedAt
        const lastMsgTs = typeof kapso?.lastMessageTimestamp === 'string'
          ? new Date(String(kapso.lastMessageTimestamp))
          : null;

        tx.insert(schema.conversations)
          .values({
            id: conv.id,
            phone,
            status: conv.status ?? 'active',
            phoneNumberId: conv.phoneNumberId ?? PHONE_NUMBER_ID,
            lastMessageText: typeof kapso?.lastMessageText === 'string' ? kapso.lastMessageText : null,
            lastMessageType: typeof kapso?.lastMessageType === 'string' ? kapso.lastMessageType : null,
            lastMessageDirection: parseDirection(kapso),
            lastMessageAt: lastMsgTs,
            messagesCount: typeof kapso?.messagesCount === 'number' ? kapso.messagesCount : 0,
            createdAt: conv.createdAt ? new Date(String(conv.createdAt)) : new Date(),
            updatedAt: conv.updatedAt ? new Date(String(conv.updatedAt)) : new Date(),
          })
          .onConflictDoUpdate({
            target: schema.conversations.id,
            set: {
              status: sql`excluded.status`,
              lastMessageText: sql`coalesce(excluded.last_message_text, last_message_text)`,
              lastMessageType: sql`coalesce(excluded.last_message_type, last_message_type)`,
              lastMessageDirection: sql`excluded.last_message_direction`,
              lastMessageAt: sql`coalesce(excluded.last_message_at, last_message_at)`,
              messagesCount: sql`excluded.messages_count`,
              updatedAt: sql`excluded.updated_at`,
            },
          })
          .run();

        // Upsert contact
        const contactName = typeof kapso?.contactName === 'string' ? kapso.contactName : null;
        tx.insert(schema.contacts)
          .values({ phone, name: contactName, firstSeen: new Date(), lastSeen: new Date() })
          .onConflictDoUpdate({
            target: schema.contacts.phone,
            set: { name: contactName ? sql`${contactName}` : sql`name`, lastSeen: new Date() },
          })
          .run();
      }
    });
  } catch (e) {
    console.error('[Conversations] Failed to persist to SQLite:', e);
  }
}

// Load conversations from SQLite (instant, no API call)
function loadConversationsFromDb(): GroupedConversation[] {
  try {
    const db = getDb();
    const rows = db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt)).all();
    if (rows.length === 0) return [];

    // Load contact names
    const contacts = db.select().from(schema.contacts).all();
    const contactMap = new Map(contacts.map(c => [c.phone, c.name]));

    // Group by phone (same logic as groupConversations)
    const phoneGroupMap = new Map<string, GroupedConversation>();
    for (const row of rows) {
      const phone = row.phone;
      // Prefer last_message_at for display; fall back to updatedAt
      const lastMessageAt = row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : undefined;
      const updatedAt = row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined;
      const displayTimestamp = lastMessageAt || updatedAt;
      const existing = phoneGroupMap.get(phone);

      if (!existing) {
        phoneGroupMap.set(phone, {
          id: row.id,
          conversationIds: [row.id],
          conversationStatuses: { [row.id]: row.status },
          phoneNumber: phone,
          status: row.status,
          lastActiveAt: displayTimestamp,
          phoneNumberId: row.phoneNumberId ?? PHONE_NUMBER_ID,
          metadata: {},
          contactName: contactMap.get(phone) ?? undefined,
          messagesCount: row.messagesCount ?? 0,
          lastMessage: row.lastMessageText
            ? { content: row.lastMessageText, direction: row.lastMessageDirection ?? 'inbound', type: row.lastMessageType ?? undefined }
            : undefined,
        });
      } else {
        existing.conversationIds.push(row.id);
        existing.conversationStatuses[row.id] = row.status;
        existing.messagesCount = (existing.messagesCount ?? 0) + (row.messagesCount ?? 0);
        const isNewer = displayTimestamp && (!existing.lastActiveAt || displayTimestamp > existing.lastActiveAt);
        if (isNewer) {
          existing.id = row.id;
          existing.status = row.status;
          existing.lastActiveAt = displayTimestamp;
          if (row.lastMessageText) {
            existing.lastMessage = { content: row.lastMessageText, direction: row.lastMessageDirection ?? 'inbound', type: row.lastMessageType ?? undefined };
          }
        }
      }
    }

    // Sort IDs and limit
    for (const group of phoneGroupMap.values()) {
      group.totalConversations = group.conversationIds.length;
      allIdsPerPhone.set(group.phoneNumber, [...group.conversationIds]);
      group.conversationIds = group.conversationIds.slice(0, 3);
      const idSet = new Set(group.conversationIds);
      for (const key of Object.keys(group.conversationStatuses)) {
        if (!idSet.has(key)) delete group.conversationStatuses[key];
      }
    }

    return Array.from(phoneGroupMap.values()).sort((a, b) => {
      if (!a.lastActiveAt) return 1;
      if (!b.lastActiveAt) return -1;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });
  } catch (e) {
    console.error('[Conversations] Failed to load from SQLite:', e);
    return [];
  }
}

function groupConversations(records: ConversationRecord[], maxIdsPerGroup = 3): GroupedConversation[] {
  const phoneGroupMap = new Map<string, GroupedConversation>();
  // Track lastActiveAt per conversation ID for sorting
  const convTimestamps = new Map<string, string>();

  for (const conversation of records) {
    const kapso = conversation.kapso;
    const phone = conversation.phoneNumber ?? '';
    // Prefer lastMessageTimestamp for display over lastActiveAt/updatedAt
    const lastMsgTs = typeof kapso?.lastMessageTimestamp === 'string' ? kapso.lastMessageTimestamp : undefined;
    const fallbackTs = typeof conversation.lastActiveAt === 'string' ? conversation.lastActiveAt : undefined;
    const lastActiveAt = lastMsgTs || fallbackTs;
    const convStatus = conversation.status ?? 'unknown';

    if (lastActiveAt) convTimestamps.set(conversation.id, lastActiveAt);

    const existing = phoneGroupMap.get(phone);
    const isNewer = !existing || (lastActiveAt && (!existing.lastActiveAt || lastActiveAt > existing.lastActiveAt));

    if (!existing) {
      const lastMessageText = typeof kapso?.lastMessageText === 'string' ? kapso.lastMessageText : undefined;
      const lastMessageType = typeof kapso?.lastMessageType === 'string' ? kapso.lastMessageType : undefined;

      phoneGroupMap.set(phone, {
        id: conversation.id,
        conversationIds: [conversation.id],
        conversationStatuses: { [conversation.id]: convStatus },
        phoneNumber: phone,
        status: convStatus,
        lastActiveAt,
        phoneNumberId: conversation.phoneNumberId ?? PHONE_NUMBER_ID,
        metadata: conversation.metadata ?? {},
        contactName: typeof kapso?.contactName === 'string' ? kapso.contactName : undefined,
        messagesCount: typeof kapso?.messagesCount === 'number' ? kapso.messagesCount : undefined,
        lastMessage: lastMessageText
          ? { content: lastMessageText, direction: parseDirection(kapso), type: lastMessageType }
          : undefined
      });
    } else {
      existing.conversationIds.push(conversation.id);
      existing.conversationStatuses[conversation.id] = convStatus;
      if (typeof kapso?.messagesCount === 'number') {
        existing.messagesCount = (existing.messagesCount ?? 0) + kapso.messagesCount;
      }
      if (isNewer) {
        const lastMessageText = typeof kapso?.lastMessageText === 'string' ? kapso.lastMessageText : undefined;
        const lastMessageType = typeof kapso?.lastMessageType === 'string' ? kapso.lastMessageType : undefined;

        existing.id = conversation.id;
        existing.status = conversation.status ?? 'unknown';
        existing.lastActiveAt = lastActiveAt;
        if (typeof kapso?.contactName === 'string') existing.contactName = kapso.contactName;
        if (lastMessageText) {
          existing.lastMessage = { content: lastMessageText, direction: parseDirection(kapso), type: lastMessageType };
        }
      }
    }
  }

  // Sort conversation IDs by most recent first
  for (const group of phoneGroupMap.values()) {
    group.conversationIds.sort((a, b) => {
      const ta = convTimestamps.get(a) ?? '';
      const tb = convTimestamps.get(b) ?? '';
      return tb.localeCompare(ta); // newest first
    });
    // Store total count so frontend knows if older sessions exist
    group.totalConversations = group.conversationIds.length;
    // Store ALL sorted IDs (for "load older" feature) before slicing
    allIdsPerPhone.set(group.phoneNumber, [...group.conversationIds]);
    // Only include first N in the active set — frontend loads more on demand
    group.conversationIds = group.conversationIds.slice(0, maxIdsPerGroup);
    const idSet = new Set(group.conversationIds);
    for (const key of Object.keys(group.conversationStatuses)) {
      if (!idSet.has(key)) delete group.conversationStatuses[key];
    }
  }

  return Array.from(phoneGroupMap.values()).sort((a, b) => {
    if (!a.lastActiveAt) return 1;
    if (!b.lastActiveAt) return -1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });
}

/** Merge new grouped conversations into an existing list (newer wins by phone). */
function mergeGrouped(existing: GroupedConversation[], incoming: GroupedConversation[]): GroupedConversation[] {
  const map = new Map<string, GroupedConversation>();
  for (const g of existing) map.set(g.phoneNumber, g);
  for (const g of incoming) {
    const prev = map.get(g.phoneNumber);
    if (!prev) {
      map.set(g.phoneNumber, g);
    } else {
      // Merge conversation IDs
      const idSet = new Set([...prev.conversationIds, ...g.conversationIds]);
      const merged: GroupedConversation = {
        ...g,
        conversationIds: Array.from(idSet),
        conversationStatuses: { ...prev.conversationStatuses, ...g.conversationStatuses },
        messagesCount: (prev.messagesCount ?? 0) + (g.messagesCount ?? 0),
      };
      // Keep whichever is newer
      if (prev.lastActiveAt && (!g.lastActiveAt || prev.lastActiveAt > g.lastActiveAt)) {
        merged.id = prev.id;
        merged.status = prev.status;
        merged.lastActiveAt = prev.lastActiveAt;
        merged.contactName = prev.contactName ?? g.contactName;
        merged.lastMessage = prev.lastMessage ?? g.lastMessage;
      }
      map.set(g.phoneNumber, merged);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (!a.lastActiveAt) return 1;
    if (!b.lastActiveAt) return -1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });
}

/**
 * Fetch one page of raw conversations from Kapso and return grouped results.
 * Updates nextApiCursor and allPagesFetched.
 */
async function fetchNextPage(status?: string, limit = 100): Promise<GroupedConversation[]> {
  if (allPagesFetched) return [];

  const response = await whatsappClient.conversations.list({
    phoneNumberId: PHONE_NUMBER_ID,
    ...(status && { status: status as 'active' | 'ended' }),
    limit,
    ...(nextApiCursor && { after: nextApiCursor }),
    fields: KAPSO_FIELDS
  });

  const records = response.data as ConversationRecord[];

  nextApiCursor = response.paging?.cursors?.after ?? undefined;
  if (!nextApiCursor) {
    allPagesFetched = true;
    markSeedComplete();
  }

  // Persist to SQLite for cache-first loading on next startup
  persistConversationsToDb(records);

  return groupConversations(records);
}

// Quick fetch: only page 1 (100 most recent) — used for polling updates
async function fetchRecentConversations(status?: string): Promise<ConversationRecord[]> {
  const response = await whatsappClient.conversations.list({
    phoneNumberId: PHONE_NUMBER_ID,
    ...(status && { status: status as 'active' | 'ended' }),
    limit: 100,
    fields: KAPSO_FIELDS
  });
  const records = response.data as ConversationRecord[];
  persistConversationsToDb(records);
  return records;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const cursorParam = searchParams.get('cursor');
    const pageParam = Number(searchParams.get('page')) || 1;
    const limitParam = Number(searchParams.get('limit')) || DEFAULT_PAGE_SIZE;
    const olderIdsPhone = searchParams.get('olderIds');
    const syncMode = searchParams.get('sync') === 'true';

    // ── Older IDs mode: return all conversation IDs for a phone (from cache, no API call) ──
    if (olderIdsPhone) {
      const ids = allIdsPerPhone.get(olderIdsPhone) ?? [];
      return NextResponse.json({ conversationIds: ids });
    }

    // ── Sync mode: user-triggered full fetch from Kapso API ──
    if (syncMode) {
      nextApiCursor = undefined;
      allPagesFetched = false;
      const page = await fetchNextPage(status ?? undefined, 100);
      cachedData = page;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: page, hasMore: !allPagesFetched, syncing: true });
    }

    // ── Paginated mode: ?cursor=next  (load more / continue sync) ──
    if (cursorParam === 'next') {
      if (allPagesFetched) {
        return NextResponse.json({ data: cachedData ?? [], hasMore: false });
      }
      const page = await fetchNextPage(status ?? undefined);
      if (page.length > 0) {
        cachedData = mergeGrouped(cachedData ?? [], page);
        cacheTimestamp = Date.now();
      }
      return NextResponse.json({ data: cachedData ?? [], hasMore: !allPagesFetched });
    }

    // ── Force refresh: reset everything ──
    if (forceRefresh) {
      const previousCache = cachedData;
      nextApiCursor = undefined;
      allPagesFetched = false;
      cachedData = null;

      try {
        const page = await fetchNextPage(status ?? undefined, 100);
        cachedData = page;
        cacheTimestamp = Date.now();
        const result = paginateCache(1);
        return NextResponse.json(result);
      } catch (refreshError) {
        // Restore previous cache on failure
        if (previousCache) {
          cachedData = previousCache;
          const result = paginateCache(1);
          return NextResponse.json(result);
        }
        throw refreshError;
      }
    }

    // ── Check if seed is complete (must be before cache paths) ──
    const seedComplete = isSeedComplete();
    if (!seedComplete) {
      // Seed not done — tell client to sync (ignore partial in-memory cache)
      return NextResponse.json({ data: [], hasMore: false, needsSync: true });
    }

    // ── Polling: return cache if fresh and not invalidated by webhook ──
    if (cachedData && (Date.now() - cacheTimestamp) < CACHE_TTL_MS && !isCacheInvalidated()) {
      const result = paginateCache(pageParam);
      return NextResponse.json(result);
    }

    // ── Polling with stale cache: fetch page 1 and merge ──
    if (cachedData) {
      const recent = await fetchRecentConversations(status ?? undefined);
      const recentGrouped = groupConversations(recent);
      cachedData = mergeGrouped(cachedData, recentGrouped);
      cacheTimestamp = Date.now();
      const result = paginateCache(pageParam);
      return NextResponse.json(result);
    }

    // ── First load: load from SQLite (seed is complete at this point) ──
    const dbConversations = loadConversationsFromDb();
    if (dbConversations.length > 0) {
      cachedData = dbConversations;
      cacheTimestamp = Date.now();
      allPagesFetched = true;
      const result = paginateCache(pageParam);
      return NextResponse.json(result);
    }

    // SQLite empty but seed marked complete — shouldn't happen, re-sync
    return NextResponse.json({ data: [], hasMore: false, needsSync: true });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    if (cachedData) {
      const result = paginateCache(1);
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST: Force resync — clears conversation cache and re-seeds from Kapso API
export async function POST() {
  try {
    const db = getDb();

    // Reset seed_complete flag
    db.insert(schema.settings)
      .values({ key: 'seed_complete', value: 'false' })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: 'false', updatedAt: new Date() } })
      .run();

    // Clear conversations table to get fresh metadata from Kapso
    // Messages are kept — they'll be supplemented with API data on chat open
    db.delete(schema.conversations).run();

    // Reset in-memory state
    cachedData = null;
    cacheTimestamp = 0;
    nextApiCursor = undefined;
    allPagesFetched = false;
    allIdsPerPhone.clear();

    return NextResponse.json({ success: true, message: 'Resync triggered. Reload the page to start syncing.' });
  } catch (error) {
    console.error('Error triggering resync:', error);
    return NextResponse.json(
      { error: 'Failed to trigger resync' },
      { status: 500 }
    );
  }
}
