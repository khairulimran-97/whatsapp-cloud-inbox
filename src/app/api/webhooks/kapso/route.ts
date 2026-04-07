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
        publish(webhookEvent);
        published++;
        // Track unread server-side for inbound messages
        if (webhookEvent.type === 'message_received' && webhookEvent.phoneNumber) {
          incrementUnread(webhookEvent.phoneNumber);
          // Web Push notification
          const msg = item.message as Record<string, unknown> | undefined;
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
