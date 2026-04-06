import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type ConversationKapsoExtensions,
  type ConversationRecord
} from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

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
};

const KAPSO_FIELDS = buildKapsoFields([
  'contact_name',
  'messages_count',
  'last_message_type',
  'last_message_text',
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
const CACHE_TTL_MS = 10_000;

function groupConversations(records: ConversationRecord[]): GroupedConversation[] {
  const phoneGroupMap = new Map<string, GroupedConversation>();

  for (const conversation of records) {
    const kapso = conversation.kapso;
    const phone = conversation.phoneNumber ?? '';
    const lastActiveAt = typeof conversation.lastActiveAt === 'string' ? conversation.lastActiveAt : undefined;
    const convStatus = conversation.status ?? 'unknown';

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

  return Array.from(phoneGroupMap.values()).sort((a, b) => {
    if (!a.lastActiveAt) return 1;
    if (!b.lastActiveAt) return -1;
    return b.lastActiveAt.localeCompare(a.lastActiveAt);
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
    return b.lastActiveAt.localeCompare(a.lastActiveAt);
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
  console.log(`[pagination] fetchNextPage: raw records=${records.length}, limit=${limit}, hadCursor=${!!nextApiCursor}, newCursor=${!!response.paging?.cursors?.after}`);
  nextApiCursor = response.paging?.cursors?.after ?? undefined;
  if (!nextApiCursor) allPagesFetched = true;

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
  return response.data as ConversationRecord[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const cursorParam = searchParams.get('cursor');
    const limitParam = Number(searchParams.get('limit')) || DEFAULT_PAGE_SIZE;

    // ── Paginated mode: ?cursor=next  (load more) ──
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
      nextApiCursor = undefined;
      allPagesFetched = false;
      cachedData = null;

      const page = await fetchNextPage(status ?? undefined, 100);
      cachedData = page;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: page, hasMore: !allPagesFetched });
    }

    // ── Polling: return cache if fresh ──
    if (cachedData && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
      return NextResponse.json({ data: cachedData, hasMore: !allPagesFetched });
    }

    // ── Polling with stale cache: fetch page 1 and merge ──
    if (cachedData) {
      const recent = await fetchRecentConversations(status ?? undefined);
      const recentGrouped = groupConversations(recent);
      cachedData = mergeGrouped(cachedData, recentGrouped);
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: cachedData, hasMore: !allPagesFetched });
    }

    // ── First load: fetch first page only (fast) ──
    const page = await fetchNextPage(status ?? undefined, 100);
    cachedData = page;
    cacheTimestamp = Date.now();
    return NextResponse.json({ data: page, hasMore: !allPagesFetched });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    if (cachedData) {
      return NextResponse.json({ data: cachedData, hasMore: !allPagesFetched });
    }
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
