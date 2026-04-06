/**
 * Simple in-memory event bus for webhook → SSE communication.
 * Uses process-level EventEmitter to ensure sharing across Next.js route modules.
 */

import { EventEmitter } from 'events';

export type WebhookEvent = {
  type: 'message_received' | 'message_sent' | 'message_delivered' | 'message_read' | 'message_failed' |
        'conversation_started' | 'conversation_ended' | 'conversation_inactive' | 'unread_update';
  phoneNumber?: string;
  conversationId?: string;
  messageId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

const EVENT_NAME = 'kapso-webhook';

// Use process-level emitter to guarantee sharing across all Next.js route modules
function getEmitter(): EventEmitter {
  const key = Symbol.for('__kapso_event_bus__');
  const g = globalThis as Record<symbol, EventEmitter>;
  if (!g[key]) {
    g[key] = new EventEmitter();
    g[key].setMaxListeners(50);
  }
  return g[key];
}

export function subscribe(listener: (event: WebhookEvent) => void): () => void {
  const emitter = getEmitter();
  emitter.on(EVENT_NAME, listener);
  return () => emitter.off(EVENT_NAME, listener);
}

export function publish(event: WebhookEvent): void {
  getEmitter().emit(EVENT_NAME, event);
}
