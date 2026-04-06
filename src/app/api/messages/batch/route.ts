import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type KapsoMessageExtensions,
  type MediaData,
  type MetaMessage
} from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

/* ---------- types ---------- */

type MessageTypeData = {
  filename?: string;
  mimeType?: string;
  messageId?: string;
};

type WithOptionalTimestamp = {
  lastMessageTimestamp?: unknown;
};

type TransformedMessage = {
  id: string;
  conversationId: string;
  direction: string;
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber?: string;
  hasMedia: boolean;
  mediaData?: { url: string; filename?: string; contentType?: string; byteSize?: number };
  reactionEmoji?: string;
  reactedToMessageId?: string;
  filename?: string;
  mimeType?: string;
  messageType: string;
  caption?: string;
  errorDetails?: { code?: number; title?: string; message?: string };
  metadata: { mediaId?: string };
};

/* ---------- helpers ---------- */

function toIsoString(timestamp: unknown, fallback?: unknown): string {
  const coerceToNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };

  const epochSeconds = coerceToNumber(timestamp);
  if (epochSeconds !== null) return new Date(epochSeconds * 1000).toISOString();
  if (typeof fallback === 'string' && !Number.isNaN(Date.parse(fallback))) return new Date(fallback).toISOString();
  return new Date().toISOString();
}

function normaliseKapsoContent(content: KapsoMessageExtensions['content']): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && 'text' in content) {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === 'string') return maybeText;
  }
  return undefined;
}

function extractMessageTypeData(value: KapsoMessageExtensions['messageTypeData']): MessageTypeData | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { filename, mimeType, messageId } = value as MessageTypeData;
  return {
    filename: typeof filename === 'string' ? filename : undefined,
    mimeType: typeof mimeType === 'string' ? mimeType : undefined,
    messageId: typeof messageId === 'string' ? messageId : undefined
  };
}

function extractMediaData(mediaData: MediaData | undefined): Pick<MediaData, 'filename' | 'contentType' | 'byteSize'> {
  return {
    filename: typeof mediaData?.filename === 'string' ? mediaData.filename : undefined,
    contentType: typeof mediaData?.contentType === 'string' ? mediaData.contentType : undefined,
    byteSize: typeof mediaData?.byteSize === 'number' ? mediaData.byteSize : undefined
  };
}

function transformMessage(msg: MetaMessage, conversationId: string): TransformedMessage {
  const { image, video, audio, document, sticker, text, reaction, kapso } = msg;
  const kapsoExtensions = kapso as KapsoMessageExtensions | undefined;
  const messageTypeData = extractMessageTypeData(kapsoExtensions?.messageTypeData);
  const kapsoMediaData = extractMediaData(kapsoExtensions?.mediaData);

  const mediaId =
    image?.id ?? video?.id ?? audio?.id ?? document?.id ?? sticker?.id ??
    (typeof kapsoExtensions?.mediaData?.id === 'string' ? kapsoExtensions.mediaData.id : undefined);

  const mediaUrl =
    image?.link ?? video?.link ?? audio?.link ?? document?.link ?? sticker?.link ??
    (typeof kapsoExtensions?.mediaUrl === 'string' ? kapsoExtensions.mediaUrl : undefined) ??
    (typeof kapsoExtensions?.mediaData?.url === 'string' ? kapsoExtensions.mediaData.url : undefined);

  const hasMedia =
    Boolean(kapsoExtensions?.hasMedia) || Boolean(mediaId) ||
    ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type);

  const resolvedMediaData = mediaUrl
    ? {
        url: mediaUrl,
        filename: document?.filename ?? messageTypeData?.filename ?? kapsoMediaData.filename,
        contentType: messageTypeData?.mimeType ?? kapsoMediaData.contentType,
        byteSize: kapsoMediaData.byteSize
      }
    : undefined;

  const kapsoContent = normaliseKapsoContent(kapsoExtensions?.content);
  const textBody = typeof text?.body === 'string' ? text.body : undefined;
  const reactionEmoji = typeof reaction?.emoji === 'string' ? reaction.emoji : undefined;

  const fallbackCaption =
    (typeof image?.caption === 'string' && image.caption) ||
    (typeof video?.caption === 'string' && video.caption) ||
    (typeof document?.caption === 'string' && document.caption) ||
    undefined;

  const lastMessageTimestamp = (kapsoExtensions as WithOptionalTimestamp | undefined)?.lastMessageTimestamp;

  const rawErrors = (msg as Record<string, unknown>).errors as Array<Record<string, unknown>> | undefined;
  const kapsoErrors = (kapsoExtensions as Record<string, unknown> | undefined)?.errors as Array<Record<string, unknown>> | undefined;
  const errorArr = rawErrors ?? kapsoErrors;
  const firstError = Array.isArray(errorArr) && errorArr.length > 0 ? errorArr[0] : undefined;
  const errorDetails = firstError ? {
    code: typeof firstError.code === 'number' ? firstError.code : undefined,
    title: typeof firstError.title === 'string' ? firstError.title : undefined,
    message: typeof firstError.message === 'string' ? firstError.message : undefined,
  } : undefined;

  return {
    id: msg.id,
    conversationId,
    direction: typeof kapsoExtensions?.direction === 'string' ? kapsoExtensions.direction : 'inbound',
    content: kapsoContent ?? textBody ?? reactionEmoji ?? fallbackCaption ?? '',
    createdAt: toIsoString(msg.timestamp, lastMessageTimestamp),
    status: typeof kapsoExtensions?.status === 'string' ? kapsoExtensions.status : undefined,
    phoneNumber: typeof kapsoExtensions?.phoneNumber === 'string' ? kapsoExtensions.phoneNumber : msg.from,
    hasMedia,
    mediaData: resolvedMediaData,
    reactionEmoji,
    reactedToMessageId: typeof reaction?.messageId === 'string'
      ? reaction.messageId
      : messageTypeData?.messageId,
    filename: document?.filename ?? messageTypeData?.filename ?? kapsoMediaData.filename,
    mimeType: messageTypeData?.mimeType ?? kapsoMediaData.contentType,
    messageType: msg.type,
    caption: fallbackCaption,
    errorDetails,
    metadata: { mediaId }
  };
}

/* ---------- server-side cache ---------- */

type CacheEntry = {
  data: TransformedMessage[];
  timestamp: number;
};

// Share cache via Symbol.for so webhook route can invalidate entries
const CACHE_KEY = Symbol.for('__kapso_message_cache__');
const g = globalThis as Record<symbol, Map<string, CacheEntry>>;
if (!g[CACHE_KEY]) g[CACHE_KEY] = new Map();
const messageCache = g[CACHE_KEY];

const CACHE_TTL_MS = 5_000; // 5s cache — matches poll interval

function getCached(conversationId: string): TransformedMessage[] | null {
  const entry = messageCache.get(conversationId);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(conversationId: string, data: TransformedMessage[]): void {
  messageCache.set(conversationId, { data, timestamp: Date.now() });
  // Evict old entries to prevent memory leaks (keep max 200 conversations)
  if (messageCache.size > 200) {
    const oldestKey = messageCache.keys().next().value;
    if (oldestKey) messageCache.delete(oldestKey);
  }
}

/* ---------- Kapso fields ---------- */

const KAPSO_FIELDS = buildKapsoFields([
  'direction', 'status', 'processing_status', 'phone_number',
  'has_media', 'media_data', 'media_url', 'whatsapp_conversation_id',
  'contact_name', 'message_type_data', 'content',
  'flow_response', 'flow_token', 'flow_name', 'order_text'
]);

/* ---------- fetch helpers ---------- */

async function fetchConversationMessages(
  conversationId: string,
  limit: number,
  retries: number
): Promise<TransformedMessage[]> {
  // Check cache first
  const cached = getCached(conversationId);
  if (cached !== null) return cached;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await whatsappClient.messages.listByConversation({
        phoneNumberId: PHONE_NUMBER_ID,
        conversationId,
        limit,
        fields: KAPSO_FIELDS,
      });
      const transformed = response.data.map((msg: MetaMessage) => transformMessage(msg, conversationId));
      setCache(conversationId, transformed);
      return transformed;
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }
  return [];
}

/* ---------- route handler ---------- */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    const refresh = searchParams.get('refresh') === 'true';
    const mode = searchParams.get('mode') ?? 'poll'; // 'initial' | 'poll'

    if (!idsParam) {
      return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
    }

    const conversationIds = idsParam.split(',').filter(Boolean).slice(0, 20); // max 20 IDs

    if (conversationIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // On force refresh, clear cache for these IDs
    if (refresh) {
      for (const id of conversationIds) messageCache.delete(id);
    }

    const isInitial = mode === 'initial';
    const limit = isInitial ? 50 : 50;
    const retries = isInitial ? 2 : 0; // retry on initial load, skip on poll

    // Fetch all conversations in parallel
    const results = await Promise.all(
      conversationIds.map(id => fetchConversationMessages(id, limit, retries))
    );

    // Combine all messages
    const allMessages = results.flat();

    return NextResponse.json({ data: allMessages });
  } catch (error) {
    console.error('Error in batch messages fetch:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
