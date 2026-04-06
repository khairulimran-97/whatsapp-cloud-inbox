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

// In-memory cache
let cachedData: GroupedConversation[] | null = null;
let cacheTimestamp = 0;
let fullFetchDone = false;
const CACHE_TTL_MS = 10_000; // serve cache for 10s before refreshing

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

// Full fetch: paginate through all conversations (used on first load & manual refresh)
async function fetchAllConversations(status?: string): Promise<ConversationRecord[]> {
  const all: ConversationRecord[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const MAX_PAGES = 10;

  do {
    const response = await whatsappClient.conversations.list({
      phoneNumberId: PHONE_NUMBER_ID,
      ...(status && { status: status as 'active' | 'ended' }),
      limit: 100,
      ...(cursor && { after: cursor }),
      fields: KAPSO_FIELDS
    });

    all.push(...(response.data as ConversationRecord[]));
    cursor = response.paging?.cursors?.after ?? undefined;
    pages++;

    if (cursor && pages < MAX_PAGES) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } while (cursor && pages < MAX_PAGES);

  return all;
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

    // Return cache if fresh and not a forced refresh
    if (cachedData && !forceRefresh && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
      return NextResponse.json({ data: cachedData });
    }

    let records: ConversationRecord[];

    if (!fullFetchDone || forceRefresh) {
      // First load or manual refresh: fetch ALL pages
      records = await fetchAllConversations(status ?? undefined);
      fullFetchDone = true;
    } else {
      // Polling: only fetch page 1 (recent), merge with cached old conversations
      const recent = await fetchRecentConversations(status ?? undefined);
      // Merge: recent records override older ones by id
      const recentIds = new Set(recent.map(r => r.id));
      const oldRecords = cachedData
        ? cachedData.flatMap(g => g.conversationIds.map(id => ({ id })))
            .filter(r => !recentIds.has(r.id))
        : [];

      // For polling, we only re-group the recent data merged with cached grouped data
      const recentGrouped = groupConversations(recent);

      // Merge: recent grouped contacts override cached contacts
      const recentPhones = new Set(recentGrouped.map(g => g.phoneNumber));
      const oldContacts = cachedData?.filter(g => !recentPhones.has(g.phoneNumber)) ?? [];
      const merged = [...recentGrouped, ...oldContacts].sort((a, b) => {
        if (!a.lastActiveAt) return 1;
        if (!b.lastActiveAt) return -1;
        return b.lastActiveAt.localeCompare(a.lastActiveAt);
      });

      cachedData = merged;
      cacheTimestamp = Date.now();
      return NextResponse.json({ data: merged });
    }

    const grouped = groupConversations(records);
    cachedData = grouped;
    cacheTimestamp = Date.now();

    return NextResponse.json({ data: grouped });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    // If we have cached data, serve it on error (stale is better than nothing)
    if (cachedData) {
      return NextResponse.json({ data: cachedData });
    }
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
