import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type ConversationKapsoExtensions,
  type ConversationRecord
} from '@kapso/whatsapp-cloud-api';
import { resolveProfile, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
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

// Per-profile cache state
type ProfileCache = {
  cachedData: GroupedConversation[] | null;
  cacheTimestamp: number;
  nextApiCursor: string | undefined;
  allPagesFetched: boolean;
  allIdsPerPhone: Map<string, string[]>;
};

const profileCaches = new Map<string, ProfileCache>();

function getProfileCache(profileId: string): ProfileCache {
  let cache = profileCaches.get(profileId);
  if (!cache) {
    cache = {
      cachedData: null,
      cacheTimestamp: 0,
      nextApiCursor: undefined,
      allPagesFetched: false,
      allIdsPerPhone: new Map(),
    };
    profileCaches.set(profileId, cache);
  }
  return cache;
}

const CACHE_TTL_MS = 30_000;
const PAGE_SIZE = 50;

// Return a page of cached data
function paginateCache(pc: ProfileCache, page: number): { data: GroupedConversation[]; hasMore: boolean; total: number } {
  if (!pc.cachedData) return { data: [], hasMore: false, total: 0 };
  const start = (page - 1) * PAGE_SIZE;
  const slice = pc.cachedData.slice(start, start + PAGE_SIZE);
  return { data: slice, hasMore: start + PAGE_SIZE < pc.cachedData.length, total: pc.cachedData.length };
}

// Check if webhook has invalidated our cache
const CONV_CACHE_KEY = Symbol.for('__kapso_conv_cache_invalidated__');
function isCacheInvalidated(profileCacheTimestamp: number): boolean {
  const invalidatedAt = (globalThis as Record<symbol, number>)[CONV_CACHE_KEY] ?? 0;
  return invalidatedAt > profileCacheTimestamp;
}

// Track whether initial API seed has completed per-profile
function isSeedComplete(profileId: string): boolean {
  try {
    const db = getDb();
    const key = `seed_complete_${profileId}`;
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (row?.value === 'true') return true;
    // Legacy: check global seed_complete for backward compatibility
    const legacy = db.select().from(schema.settings).where(eq(schema.settings.key, 'seed_complete')).get();
    return legacy?.value === 'true';
  } catch { return false; }
}

function markSeedComplete(profileId: string) {
  try {
    const db = getDb();
    const key = `seed_complete_${profileId}`;
    db.insert(schema.settings)
      .values({ key, value: 'true' })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: 'true', updatedAt: new Date() } })
      .run();
  } catch (e) {
    console.error('[Conversations] Failed to mark seed complete:', e);
  }
}

// Persist Kapso API conversations to SQLite for cache-first loading
function persistConversationsToDb(records: ConversationRecord[], fallbackPhoneNumberId?: string) {
  try {
    const db = getDb();
    db.transaction((tx) => {
      for (const conv of records) {
        const kapso = conv.kapso;
        const phone = conv.phoneNumber ?? '';
        if (!phone) continue;

        const lastMsgTs = typeof kapso?.lastMessageTimestamp === 'string'
          ? new Date(String(kapso.lastMessageTimestamp))
          : null;

        tx.insert(schema.conversations)
          .values({
            id: conv.id,
            phone,
            status: conv.status ?? 'active',
            phoneNumberId: conv.phoneNumberId ?? fallbackPhoneNumberId ?? PHONE_NUMBER_ID,
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

// Search conversations in SQLite by phone number, contact name, or message content
const SEARCH_LIMIT = 30;

function searchConversationsInDb(query: string, page = 1): { data: GroupedConversation[]; hasMore: boolean } {
  try {
    const db = getDb();
    const rawDb = (db as unknown as { session: { client: import('better-sqlite3').Database } }).session.client;
    const pattern = `%${query}%`;
    // Strip leading 0 for local→international phone matching
    const stripped = query.replace(/^0+/, '');
    const altPattern = stripped !== query ? `%${stripped}%` : pattern;

    // Step 1: Find all unique matching phone numbers via raw SQL UNION
    const stmt = rawDb.prepare(`
      SELECT DISTINCT phone FROM (
        SELECT phone FROM conversations WHERE phone LIKE @pattern OR phone LIKE @alt
        UNION
        SELECT phone FROM contacts WHERE name LIKE @pattern OR phone LIKE @pattern OR phone LIKE @alt
        UNION
        SELECT phone FROM messages WHERE content LIKE @pattern GROUP BY phone
      ) ORDER BY phone
    `);

    const matchingPhones = stmt.all({ pattern, alt: altPattern }) as { phone: string }[];
    if (matchingPhones.length === 0) return { data: [], hasMore: false };

    const allPhones = matchingPhones.map(r => r.phone);
    const totalPhones = allPhones.length;
    const offset = (page - 1) * SEARCH_LIMIT;
    const pagedPhones = allPhones.slice(offset, offset + SEARCH_LIMIT);
    if (pagedPhones.length === 0) return { data: [], hasMore: false };

    // Step 2: Get conversation rows for matched phones
    const rows = db.select().from(schema.conversations)
      .where(sql`${schema.conversations.phone} IN (${sql.join(pagedPhones.map(p => sql`${p}`), sql`,`)})`)
      .orderBy(desc(schema.conversations.updatedAt))
      .all();

    // Step 3: Load contact names
    const contacts = db.select().from(schema.contacts)
      .where(sql`${schema.contacts.phone} IN (${sql.join(pagedPhones.map(p => sql`${p}`), sql`,`)})`)
      .all();
    const contactMap = new Map(contacts.map(c => [c.phone, c.name]));

    // Step 5: Group by phone
    const phoneGroupMap = new Map<string, GroupedConversation>();
    for (const row of rows) {
      const phone = row.phone;
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

    for (const group of phoneGroupMap.values()) {
      group.totalConversations = group.conversationIds.length;
      group.conversationIds = group.conversationIds.slice(0, 3);
      const idSet = new Set(group.conversationIds);
      for (const key of Object.keys(group.conversationStatuses)) {
        if (!idSet.has(key)) delete group.conversationStatuses[key];
      }
      group.status = Object.values(group.conversationStatuses).some(s => s === 'active') ? 'active' : 'ended';
    }

    const sorted = Array.from(phoneGroupMap.values()).sort((a, b) => {
      if (!a.lastActiveAt) return 1;
      if (!b.lastActiveAt) return -1;
      return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });

    return { data: sorted, hasMore: offset + SEARCH_LIMIT < totalPhones };
  } catch (e) {
    console.error('[Conversations] Search failed:', e);
    return { data: [], hasMore: false };
  }
}

// Load conversations from SQLite (instant, no API call), optionally filtered by phoneNumberId
function loadConversationsFromDb(phoneNumberId?: string): GroupedConversation[] {
  try {
    const db = getDb();
    const query = phoneNumberId
      ? db.select().from(schema.conversations)
          .where(eq(schema.conversations.phoneNumberId, phoneNumberId))
          .orderBy(desc(schema.conversations.updatedAt))
      : db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt));
    const rows = query.all();
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
      group.conversationIds = group.conversationIds.slice(0, 3);
      const idSet = new Set(group.conversationIds);
      for (const key of Object.keys(group.conversationStatuses)) {
        if (!idSet.has(key)) delete group.conversationStatuses[key];
      }
      // Overall status: active if ANY included session is active
      group.status = Object.values(group.conversationStatuses).some(s => s === 'active') ? 'active' : 'ended';
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

function groupConversations(records: ConversationRecord[], maxIdsPerGroup = 3, idsCache?: Map<string, string[]>): GroupedConversation[] {
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
    if (idsCache) idsCache.set(group.phoneNumber, [...group.conversationIds]);
    // Only include first N in the active set — frontend loads more on demand
    group.conversationIds = group.conversationIds.slice(0, maxIdsPerGroup);
    const idSet = new Set(group.conversationIds);
    for (const key of Object.keys(group.conversationStatuses)) {
      if (!idSet.has(key)) delete group.conversationStatuses[key];
    }
    // Overall status: active if ANY included session is active
    group.status = Object.values(group.conversationStatuses).some(s => s === 'active') ? 'active' : 'ended';
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
 * Uses the profile's phoneNumberId and client.
 */
async function fetchNextPage(profileId: string, status?: string, limit = 100): Promise<GroupedConversation[]> {
  const pc = getProfileCache(profileId);
  if (pc.allPagesFetched) return [];

  const { client, profile } = resolveProfile(profileId);
  const response = await client.conversations.list({
    phoneNumberId: profile.phoneNumberId,
    ...(status && { status: status as 'active' | 'ended' }),
    limit,
    ...(pc.nextApiCursor && { after: pc.nextApiCursor }),
    fields: KAPSO_FIELDS
  });

  const records = response.data as ConversationRecord[];

  pc.nextApiCursor = response.paging?.cursors?.after ?? undefined;
  if (!pc.nextApiCursor) {
    pc.allPagesFetched = true;
    markSeedComplete(profileId);
  }

  persistConversationsToDb(records, profile.phoneNumberId);

  return groupConversations(records, 3, pc.allIdsPerPhone);
}

// Quick fetch: only page 1 (100 most recent) — used for polling updates
async function fetchRecentConversations(profileId: string, status?: string): Promise<ConversationRecord[]> {
  const { client, profile } = resolveProfile(profileId);
  const pc = getProfileCache(profileId);
  const response = await client.conversations.list({
    phoneNumberId: profile.phoneNumberId,
    ...(status && { status: status as 'active' | 'ended' }),
    limit: 100,
    fields: KAPSO_FIELDS
  });
  const records = response.data as ConversationRecord[];
  persistConversationsToDb(records, profile.phoneNumberId);
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
    const searchQuery = searchParams.get('search');
    const profileIdParam = searchParams.get('profileId');

    // Resolve profile (uses param or default)
    const { profile } = resolveProfile(profileIdParam);
    const profileId = profile.id;
    const pc = getProfileCache(profileId);

    // ── Search mode: query SQLite directly, paginated ──
    if (searchQuery && searchQuery.trim().length > 0) {
      const results = searchConversationsInDb(searchQuery.trim(), pageParam);
      return NextResponse.json({ ...results, search: true });
    }

    // ── Older IDs mode: return all conversation IDs for a phone (from cache, no API call) ──
    if (olderIdsPhone) {
      const ids = pc.allIdsPerPhone.get(olderIdsPhone) ?? [];
      return NextResponse.json({ conversationIds: ids });
    }

    // ── Sync mode: user-triggered full fetch from Kapso API ──
    if (syncMode) {
      pc.nextApiCursor = undefined;
      pc.allPagesFetched = false;
      const page = await fetchNextPage(profileId, status ?? undefined, 100);
      pc.cachedData = page;
      pc.cacheTimestamp = Date.now();
      return NextResponse.json({ data: page, hasMore: !pc.allPagesFetched, syncing: true });
    }

    // ── Paginated mode: ?cursor=next  (load more / continue sync) ──
    if (cursorParam === 'next') {
      if (pc.allPagesFetched) {
        return NextResponse.json({ data: pc.cachedData ?? [], hasMore: false });
      }
      const page = await fetchNextPage(profileId, status ?? undefined);
      if (page.length > 0) {
        pc.cachedData = mergeGrouped(pc.cachedData ?? [], page);
        pc.cacheTimestamp = Date.now();
      }
      return NextResponse.json({ data: pc.cachedData ?? [], hasMore: !pc.allPagesFetched });
    }

    // ── Force refresh: reset everything ──
    if (forceRefresh) {
      const previousCache = pc.cachedData;
      pc.nextApiCursor = undefined;
      pc.allPagesFetched = false;
      pc.cachedData = null;

      try {
        const page = await fetchNextPage(profileId, status ?? undefined, 100);
        pc.cachedData = page;
        pc.cacheTimestamp = Date.now();
        const result = paginateCache(pc, 1);
        return NextResponse.json(result);
      } catch (refreshError) {
        if (previousCache) {
          pc.cachedData = previousCache;
          const result = paginateCache(pc, 1);
          return NextResponse.json(result);
        }
        throw refreshError;
      }
    }

    // ── Check if seed is complete (must be before cache paths) ──
    const seedComplete = isSeedComplete(profileId);
    if (!seedComplete) {
      const db = getDb();
      const count = db.select({ count: sql<number>`count(*)` }).from(schema.conversations)
        .where(eq(schema.conversations.phoneNumberId, profile.phoneNumberId)).get();
      const isResync = (count?.count ?? 0) > 0;
      return NextResponse.json({ data: [], hasMore: false, needsSync: true, isResync });
    }

    // ── Polling: return cache if fresh and not invalidated by webhook ──
    if (pc.cachedData && (Date.now() - pc.cacheTimestamp) < CACHE_TTL_MS && !isCacheInvalidated(pc.cacheTimestamp)) {
      const result = paginateCache(pc, pageParam);
      return NextResponse.json(result);
    }

    // ── Polling with stale cache: fetch page 1 and merge ──
    if (pc.cachedData) {
      const recent = await fetchRecentConversations(profileId, status ?? undefined);
      const recentGrouped = groupConversations(recent, 3, pc.allIdsPerPhone);
      pc.cachedData = mergeGrouped(pc.cachedData, recentGrouped);
      pc.cacheTimestamp = Date.now();
      const result = paginateCache(pc, pageParam);
      return NextResponse.json(result);
    }

    // ── First load: load from SQLite (seed is complete at this point) ──
    const dbConversations = loadConversationsFromDb(profile.phoneNumberId);
    if (dbConversations.length > 0) {
      pc.cachedData = dbConversations;
      pc.cacheTimestamp = Date.now();
      pc.allPagesFetched = true;
      const result = paginateCache(pc, pageParam);
      return NextResponse.json(result);
    }

    // SQLite empty but seed marked complete — shouldn't happen, re-sync
    return NextResponse.json({ data: [], hasMore: false, needsSync: true });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    try {
      const { searchParams: sp } = new URL(request.url);
      const pid = sp.get('profileId');
      const { profile: p2 } = resolveProfile(pid);
      const pc2 = getProfileCache(p2.id);
      if (pc2.cachedData) {
        const result = paginateCache(pc2, 1);
        return NextResponse.json(result);
      }
    } catch { /* ignore */ }
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST: Force resync — clears conversation cache and re-seeds from Kapso API
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const profileIdParam = searchParams.get('profileId') || (body as Record<string, unknown>).profileId as string | undefined;

    const { profile } = resolveProfile(profileIdParam);
    const profileId = profile.id;
    const db = getDb();

    // Reset per-profile seed_complete flag
    const key = `seed_complete_${profileId}`;
    db.insert(schema.settings)
      .values({ key, value: 'false' })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: 'false', updatedAt: new Date() } })
      .run();

    // Reset in-memory state for this profile
    profileCaches.delete(profileId);

    return NextResponse.json({ success: true, message: 'Resync triggered. Reload the page to start syncing.' });
  } catch (error) {
    console.error('Error triggering resync:', error);
    return NextResponse.json(
      { error: 'Failed to trigger resync' },
      { status: 500 }
    );
  }
}
