import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { publish, type WebhookEvent } from '@/lib/event-bus';
import { sendPushNotification } from '@/lib/web-push';
import { getDb, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

// Access shared message cache to invalidate on webhook events
const CACHE_KEY = Symbol.for('__kapso_message_cache__');
function invalidateMessageCache(conversationId: string) {
  const cache = (globalThis as Record<symbol, Map<string, unknown>>)[CACHE_KEY];
  if (cache) cache.delete(conversationId);
}

// Invalidate conversation cache so next fetch gets fresh data
const CONV_CACHE_KEY = Symbol.for('__kapso_conv_cache_invalidated__');
function invalidateConversationCache() {
  (globalThis as Record<symbol, number>)[CONV_CACHE_KEY] = Date.now();
}

// Log webhook to SQLite for debugging
function logWebhook(headerEvent: string | null, body: Record<string, unknown>) {
  try {
    const db = getDb();
    const conv = body.conversation as Record<string, unknown> | undefined;
    const msg = body.message as Record<string, unknown> | undefined;
    db.insert(schema.webhookLogs)
      .values({
        eventType: headerEvent ?? 'unknown',
        phoneNumber: (conv?.phone_number ?? msg?.from ?? msg?.to) as string | undefined,
        conversationId: conv?.id as string | undefined,
        messageId: msg?.id as string | undefined,
        headerEvent,
        payload: JSON.stringify(body),
        createdAt: new Date(),
      })
      .run();
  } catch (e) {
    console.error('[Webhook] Failed to log:', e);
  }
}

// Persist conversation data from webhook to SQLite
function persistConversation(conv: Record<string, unknown>) {
  try {
    const db = getDb();
    const kapso = conv.kapso as Record<string, unknown> | undefined;
    const convId = conv.id as string;
    const phone = conv.phone_number as string;
    const status = conv.status as string;
    const phoneNumberId = conv.phone_number_id as string | undefined;
    const lastMessageText = kapso?.last_message_text as string | undefined;
    const lastMessageType = kapso?.last_message_type as string | undefined;
    const messagesCount = kapso?.messages_count as number | undefined;
    const contactName = conv.contact_name as string | undefined;
    // Determine direction from timestamps
    const lastInbound = kapso?.last_inbound_at as string | undefined;
    const lastOutbound = kapso?.last_outbound_at as string | undefined;
    const lastMessageDirection = lastOutbound && (!lastInbound || lastOutbound > lastInbound) ? 'outbound' : 'inbound';

    if (!convId || !phone) return;

    db.insert(schema.conversations)
      .values({
        id: convId,
        phone,
        status: status ?? 'active',
        phoneNumberId,
        lastMessageText,
        lastMessageType,
        lastMessageDirection,
        messagesCount: messagesCount ?? 0,
        source: 'webhook',
        createdAt: conv.created_at ? new Date(String(conv.created_at)) : new Date(),
        updatedAt: conv.updated_at ? new Date(String(conv.updated_at)) : new Date(),
      })
      .onConflictDoUpdate({
        target: schema.conversations.id,
        set: {
          status: sql`${status ?? 'active'}`,
          lastMessageText: sql`coalesce(${lastMessageText ?? null}, last_message_text)`,
          lastMessageType: sql`coalesce(${lastMessageType ?? null}, last_message_type)`,
          lastMessageDirection: sql`${lastMessageDirection}`,
          messagesCount: sql`${messagesCount ?? sql`messages_count`}`,
          updatedAt: new Date(),
        },
      })
      .run();

    // Upsert contact
    db.insert(schema.contacts)
      .values({
        phone,
        name: contactName ?? null,
        firstSeen: new Date(),
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.contacts.phone,
        set: {
          name: contactName ? sql`${contactName}` : sql`name`,
          lastSeen: new Date(),
        },
      })
      .run();
  } catch (e) {
    console.error('[Webhook] Failed to persist conversation:', e);
  }
}

// Persist message data from webhook to SQLite
function persistMessage(msg: Record<string, unknown>, conv: Record<string, unknown> | undefined) {
  try {
    const db = getDb();
    const kapso = msg.kapso as Record<string, unknown> | undefined;
    const msgId = msg.id as string;
    if (!msgId || !kapso) return;

    const direction = kapso.direction as string ?? 'inbound';
    const content = typeof kapso.content === 'string' ? kapso.content :
      typeof (msg.text as Record<string, unknown>)?.body === 'string' ? (msg.text as Record<string, unknown>).body as string : '';
    const status = kapso.status as string | undefined;
    const messageType = msg.type as string ?? 'text';
    const hasMedia = Boolean(kapso.has_media);
    const phone = (msg.from ?? msg.to ?? conv?.phone_number) as string;
    const conversationId = conv?.id as string ?? '';
    const timestamp = msg.timestamp as string;
    const createdAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();

    if (!phone) return;
    if (messageType === 'reaction') return;

    // Extract rich metadata from webhook (message_type_data, interactive, template, context)
    const metadata: Record<string, unknown> = {};
    if (kapso.message_type_data) metadata.message_type_data = kapso.message_type_data;
    if (kapso.origin) metadata.origin = kapso.origin;
    if (msg.interactive) metadata.interactive = msg.interactive;
    if (msg.template) metadata.template = msg.template;
    if (msg.context) metadata.context = msg.context;
    if (msg.image) metadata.image = msg.image;
    if (msg.video) metadata.video = msg.video;
    if (msg.audio) metadata.audio = msg.audio;
    if (msg.document) metadata.document = msg.document;
    if (msg.sticker) metadata.sticker = msg.sticker;
    if (msg.location) metadata.location = msg.location;
    if (msg.contacts) metadata.contacts = msg.contacts;
    const metadataJson = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

    // Extract media URL from template header or media fields
    let mediaDataJson: string | null = null;
    const typeData = kapso.message_type_data as Record<string, unknown> | undefined;
    if (typeData?.components) {
      const components = typeData.components as Array<Record<string, unknown>>;
      const header = components.find(c => c.type === 'header');
      const params = header?.parameters as Array<Record<string, unknown>> | undefined;
      const mediaParam = params?.find(p => ['image', 'video', 'document'].includes(p.type as string));
      if (mediaParam) {
        const mediaObj = mediaParam[mediaParam.type as string] as Record<string, unknown>;
        if (mediaObj?.link) {
          mediaDataJson = JSON.stringify({ url: mediaObj.link, type: mediaParam.type });
        }
      }
    }
    // Also check direct media fields (image/video/audio/document)
    for (const mediaType of ['image', 'video', 'audio', 'document'] as const) {
      const media = msg[mediaType] as Record<string, unknown> | undefined;
      if (media && (media.id || media.link)) {
        mediaDataJson = JSON.stringify({
          mediaId: media.id,
          url: media.link,
          mimeType: media.mime_type,
          type: mediaType,
        });
        break;
      }
    }

    // Extract caption from media messages
    const caption = (msg.image as Record<string, unknown>)?.caption as string ??
      (msg.video as Record<string, unknown>)?.caption as string ??
      (msg.document as Record<string, unknown>)?.caption as string ?? null;

    db.insert(schema.messages)
      .values({
        id: msgId,
        conversationId,
        phone,
        direction,
        content,
        messageType,
        status,
        hasMedia: hasMedia || !!mediaDataJson,
        caption,
        mediaDataJson,
        metadataJson,
        source: 'webhook',
        createdAt,
      })
      .onConflictDoUpdate({
        target: schema.messages.id,
        set: {
          status: sql`${status ?? sql`status`}`,
          mediaDataJson: mediaDataJson ? sql`${mediaDataJson}` : sql`media_data_json`,
          metadataJson: metadataJson ? sql`${metadataJson}` : sql`metadata_json`,
          caption: caption ? sql`${caption}` : sql`caption`,
        },
      })
      .run();
  } catch (e) {
    console.error('[Webhook] Failed to persist message:', e);
  }
}

/**
 * Kapso webhook receiver (v2).
 * Headers from Kapso:
 *   X-Webhook-Event: whatsapp.message.received
 *   X-Webhook-Signature: HMAC-SHA256 signature
 *   X-Idempotency-Key: unique-key-per-event
 *   X-Webhook-Batch: true (if batched)
 *   X-Batch-Size: N (if batched)
 */

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Map Kapso header event names (whatsapp.message.received) to internal types
function mapEventType(kapsoEvent: string): WebhookEvent['type'] | null {
  const map: Record<string, WebhookEvent['type']> = {
    // Kapso v2 header format: whatsapp.X.Y
    'whatsapp.message.received': 'message_received',
    'whatsapp.message.sent': 'message_sent',
    'whatsapp.message.delivered': 'message_delivered',
    'whatsapp.message.read': 'message_read',
    'whatsapp.message.failed': 'message_failed',
    'whatsapp.conversation.started': 'conversation_started',
    'whatsapp.conversation.created': 'conversation_started',
    'whatsapp.conversation.ended': 'conversation_ended',
    'whatsapp.conversation.inactive': 'conversation_inactive',
    // Fallback formats
    'message.received': 'message_received',
    'message_received': 'message_received',
    'message.sent': 'message_sent',
    'message_sent': 'message_sent',
    'message.delivered': 'message_delivered',
    'message_delivered': 'message_delivered',
    'message.read': 'message_read',
    'message_read': 'message_read',
    'message.failed': 'message_failed',
    'message_failed': 'message_failed',
    'conversation.started': 'conversation_started',
    'conversation_started': 'conversation_started',
    'conversation.created': 'conversation_started',
    'conversation_created': 'conversation_started',
    'conversation.ended': 'conversation_ended',
    'conversation_ended': 'conversation_ended',
    'conversation.inactive': 'conversation_inactive',
    'conversation_inactive': 'conversation_inactive',
  };
  return map[kapsoEvent] ?? null;
}

function extractEvent(item: Record<string, unknown>, headerEvent: string | null): WebhookEvent | null {
  const eventName = headerEvent ?? (item.event as string) ?? (item.type as string) ?? (item.event_type as string) ?? '';
  const eventType = mapEventType(eventName);
  if (!eventType) return null;

  // Kapso batched format: { message: {..., from, kapso: {direction}}, conversation: {id, phone_number} }
  const msg = item.message as Record<string, unknown> | undefined;
  const conv = item.conversation as Record<string, unknown> | undefined;
  const data = (item.data ?? item) as Record<string, unknown>;

  return {
    type: eventType,
    phoneNumber: (msg?.from ?? conv?.phone_number ?? item.phone_number ?? item.phoneNumber ?? data.phone_number ?? data.from) as string | undefined,
    conversationId: (conv?.id ?? item.conversation_id ?? item.conversationId ?? data.conversation_id) as string | undefined,
    messageId: (msg?.id ?? item.message_id ?? item.messageId ?? data.message_id ?? data.id) as string | undefined,
    timestamp: new Date().toISOString(),
    data: item,
  };
}

function incrementUnread(phoneNumber: string) {
  try {
    const db = getDb();
    db.insert(schema.unreadCounts)
      .values({ phone: phoneNumber, count: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.unreadCounts.phone,
        set: { count: sql`${schema.unreadCounts.count} + 1`, updatedAt: new Date() },
      })
      .run();
  } catch (e) {
    console.error('[Webhook] Failed to update unread:', e);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Verify signature
    const signature = request.headers.get('x-webhook-signature');
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const headerEvent = request.headers.get('x-webhook-event');
    const isBatched = request.headers.get('x-webhook-batch') === 'true';

    // Log ALL incoming webhooks to SQLite for debugging
    logWebhook(headerEvent, body);

    // Handle batched webhooks — Kapso sends { data: [...items] } when batched
    const items: Record<string, unknown>[] = isBatched && Array.isArray(body.data)
      ? body.data
      : isBatched && Array.isArray(body)
        ? body
        : [body];

    let published = 0;
    for (const item of items) {
      const webhookEvent = extractEvent(item, headerEvent);
      if (webhookEvent) {
        // Invalidate message cache so next fetch gets fresh data
        if (webhookEvent.conversationId) {
          invalidateMessageCache(webhookEvent.conversationId);
        }
        invalidateConversationCache();
        publish(webhookEvent);
        published++;

        // Persist to SQLite for offline cache
        const conv = item.conversation as Record<string, unknown> | undefined;
        const msg = item.message as Record<string, unknown> | undefined;
        if (conv) persistConversation(conv);
        if (msg) persistMessage(msg, conv);

        // Track unread server-side for inbound messages
        if (webhookEvent.type === 'message_received' && webhookEvent.phoneNumber) {
          incrementUnread(webhookEvent.phoneNumber);
          // Web Push notification
          const textBody = ((msg?.text as Record<string, unknown>)?.body as string) || (msg?.type as string) || 'New message';
          console.log('[Webhook] Sending push for', webhookEvent.phoneNumber, ':', textBody);
          sendPushNotification({
            title: `Message from ${webhookEvent.phoneNumber}`,
            body: textBody,
          }).catch(() => {});
        }
        console.log(`[Webhook] ${webhookEvent.type}`, webhookEvent.phoneNumber ?? '');
      }
    }

    if (published === 0 && items.length > 0) {
      console.log('[Webhook] Unknown event:', headerEvent ?? 'no-header');
    }

    return NextResponse.json({ received: true, processed: published });
  } catch (error) {
    console.error('[Webhook] Error processing:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

// Health check for webhook verification
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Kapso webhook endpoint' });
}
