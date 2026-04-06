import { useEffect, useRef, useCallback, useState } from 'react';

export type RealtimeEvent = {
  type: 'message_received' | 'message_sent' | 'message_delivered' | 'message_read' | 'message_failed' |
        'conversation_started' | 'conversation_ended' | 'conversation_inactive' | 'unread_update' | 'connected';
  phoneNumber?: string;
  conversationId?: string;
  messageId?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

type UseRealtimeOptions = {
  onEvent?: (event: RealtimeEvent) => void;
  enabled?: boolean;
};

/**
 * Hook to receive real-time events via SSE from webhook endpoint.
 * Auto-reconnects on disconnect.
 */
export function useRealtime({ onEvent, enabled = true }: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    try {
      const es = new EventSource('/api/events');
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeEvent;
          if (event.type === 'connected') setConnected(true);
          onEventRef.current?.(event);
        } catch {
          // Ignore parse errors (keepalive pings, etc.)
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setConnected(false);
        // Reconnect after 3s
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };
    } catch {
      // SSE not supported or connection failed — fall back to polling
      setConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setConnected(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, connect]);

  return { connected };
}
