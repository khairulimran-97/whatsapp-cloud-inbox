'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationList, type ConversationListRef } from '@/components/conversation-list';
import { MessageView, type MessageViewRef } from '@/components/message-view';
import { useRealtime, type RealtimeEvent } from '@/hooks/use-realtime';
import { useNotification } from '@/hooks/use-notification';
import { PwaInstallBanner } from '@/components/pwa-install-banner';
import { LoginScreen, useAuth } from '@/components/login-screen';

type Conversation = {
  id: string;
  conversationIds: string[];
  conversationStatuses: Record<string, string>;
  status: string;
  phoneNumber: string;
  lastActiveAt: string;
  phoneNumberId: string;
  metadata?: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  lastMessage?: { content: string; direction: string; type?: string };
  totalConversations?: number;
};

// Server-side unread operations (SQLite is the single source of truth)
function clearUnreadOnServer(phone: string) {
  fetch('/api/unread', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clear: [phone] }),
  }).catch(() => {});
}

function markUnreadOnServer(phone: string) {
  fetch('/api/unread', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ increment: [phone] }),
  }).catch(() => {});
}

export default function Home() {
  const { authenticated, login } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<Conversation>();
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const conversationListRef = useRef<ConversationListRef>(null);
  const messageViewRef = useRef<MessageViewRef>(null);
  const selectedConversationRef = useRef<Conversation | undefined>(undefined);
  const statusCooldownRef = useRef<number>(0);
  selectedConversationRef.current = selectedConversation;
  const { enabled: notifEnabled, permission: notifPermission, toggle: toggleNotif } = useNotification();
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    // Load unread counts from server (SQLite is the single source of truth)
    fetch('/api/unread').then(r => r.json()).then(data => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setUnreadCounts(new Map(Object.entries(data as Record<string, number>)));
      }
    }).catch(() => {});

    notificationSoundRef.current = new Audio('/notification.wav');
    notificationSoundRef.current.volume = 0.8;

    // Browsers block audio until user interacts — unlock on first click/tap
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const audio = notificationSoundRef.current;
      if (audio) {
        audio.play().then(() => { audio.pause(); audio.currentTime = 0; audioUnlockedRef.current = true; }).catch(() => {});
      }
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    // Capture unread count BEFORE clearing (for "X unread messages" divider)
    const count = unreadCounts.get(conversation.phoneNumber) ?? 0;
    setInitialUnreadCount(count);
    setSelectedConversation(conversation);
    // Push history state so PWA back button returns to list instead of closing app
    window.history.pushState({ view: 'chat' }, '', `#${conversation.phoneNumber}`);
    // Clear unread badge from sidebar
    if (count > 0) {
      setUnreadCounts(prev => {
        const next = new Map(prev);
        next.delete(conversation.phoneNumber);
        return next;
      });
      clearUnreadOnServer(conversation.phoneNumber);
    }
  }, [unreadCounts]);

  const clearUnreadForSelected = useCallback(() => {
    const selected = selectedConversationRef.current;
    if (!selected) return;
    // Skip if already at 0 — no network call needed
    const current = unreadCounts.get(selected.phoneNumber);
    if (!current || current === 0) return;
    setInitialUnreadCount(0);
    setUnreadCounts(prev => {
      if (!prev.has(selected.phoneNumber)) return prev;
      const next = new Map(prev);
      next.delete(selected.phoneNumber);
      return next;
    });
    clearUnreadOnServer(selected.phoneNumber);
  }, [unreadCounts]);

  // Sync selected conversation when conversation list updates
  const deepLinkHandledRef = useRef(false);
  const handleConversationsUpdated = useCallback((conversations: Conversation[]) => {
    const selected = selectedConversationRef.current;

    // Deep link: auto-select conversation from URL hash on first load
    if (!deepLinkHandledRef.current && !selected && conversations.length > 0) {
      deepLinkHandledRef.current = true;
      const hash = window.location.hash.slice(1);
      if (hash) {
        const match = conversations.find(c => c.phoneNumber === hash);
        if (match) {
          setSelectedConversation(match);
          window.history.replaceState({ view: 'chat' }, '', `#${hash}`);
          return;
        }
      }
    }

    // Sync selected conversation if IDs or status changed
    // Skip during status cooldown to preserve optimistic update
    if (selected && Date.now() > statusCooldownRef.current) {
      const updated = conversations.find(c => c.phoneNumber === selected.phoneNumber);
      if (updated && (
        updated.conversationIds.join(',') !== selected.conversationIds.join(',') ||
        updated.status !== selected.status
      )) {
        setSelectedConversation(updated);
      }
    }
  }, []);

  const handleMarkUnread = useCallback((phoneNumber: string) => {
    setUnreadCounts(prev => {
      const next = new Map(prev);
      next.set(phoneNumber, Math.max(next.get(phoneNumber) ?? 0, 1));
      return next;
    });
    markUnreadOnServer(phoneNumber);
  }, []);

  const handleTemplateSent = async (phoneNumber: string) => {
    const conversations = await conversationListRef.current?.refresh();
    if (conversations) {
      const conversation = conversations.find(conv => conv.phoneNumber === phoneNumber);
      if (conversation) {
        setSelectedConversation(conversation);
      }
    }
  };

  const handleStatusChanged = async () => {
    // Optimistically update the selected conversation status locally
    if (selectedConversation) {
      const latestConvId = selectedConversation.conversationIds[0];
      const currentStatus = selectedConversation.conversationStatuses[latestConvId];
      const newStatus = currentStatus === 'ended' ? 'active' : 'ended';
      const updatedStatuses = { ...selectedConversation.conversationStatuses, [latestConvId]: newStatus };
      const overallStatus = Object.values(updatedStatuses).some(s => s === 'active') ? 'active' : 'ended';
      const updatedConversation = {
        ...selectedConversation,
        conversationStatuses: updatedStatuses,
        status: overallStatus,
      };
      setSelectedConversation(updatedConversation);

      // Block refresh from overwriting optimistic status for 5s
      statusCooldownRef.current = Date.now() + 5000;

      // Update the conversation in the list without full refresh
      conversationListRef.current?.updateConversation?.(updatedConversation);
    }
  };

  const handleBackToList = () => {
    // Navigate back in history — the popstate handler will clear selected conversation
    window.history.back();
  };

  // Update conversation status from API (called on chat open as fallback)
  const handleConversationStatusUpdate = useCallback((conversationId: string, apiStatus: string) => {
    setSelectedConversation(prev => {
      if (!prev) return prev;
      const currentStatus = prev.conversationStatuses[conversationId];
      if (currentStatus === apiStatus) return prev; // no change
      const updatedStatuses = { ...prev.conversationStatuses, [conversationId]: apiStatus };
      const overallStatus = Object.values(updatedStatuses).some(s => s === 'active') ? 'active' : 'ended';
      const updated = { ...prev, conversationStatuses: updatedStatuses, status: overallStatus };
      conversationListRef.current?.updateConversation?.(updated);
      return updated;
    });
  }, []);

  // PWA back button support: listen for popstate to return to conversation list
  useEffect(() => {
    const handlePopState = () => {
      if (selectedConversationRef.current) {
        setSelectedConversation(undefined);
        setInitialUnreadCount(0);
        // Clear hash without triggering another popstate
        if (window.location.hash) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update conversation in sidebar from webhook data without API call
  const updateConversationFromWebhook = useCallback((phoneNumber: string, webhookConv: Record<string, unknown>) => {
    const kapso = webhookConv.kapso as Record<string, unknown> | undefined;
    const convId = webhookConv.id as string;
    const convStatus = webhookConv.status as string;
    const lastMessageText = kapso?.last_message_text as string | undefined;
    const lastMessageType = kapso?.last_message_type as string | undefined;
    const contactName = webhookConv.contact_name as string | undefined;
    // Use the most recent timestamp from webhook data
    const lastMessageTimestamp = kapso?.last_message_timestamp as string | undefined;
    const lastActiveAt = lastMessageTimestamp
      || (webhookConv.last_active_at as string | undefined)
      || (webhookConv.updated_at as string | undefined);

    conversationListRef.current?.updateConversationFromWebhook?.(phoneNumber, {
      conversationId: convId,
      status: convStatus,
      lastMessage: lastMessageText ? { content: lastMessageText, direction: 'inbound', type: lastMessageType } : undefined,
      contactName,
      lastActiveAt,
    });

    // Also update selected conversation if it's the same phone
    const selected = selectedConversationRef.current;
    if (selected && selected.phoneNumber === phoneNumber) {
      setSelectedConversation(prev => {
        if (!prev) return prev;
        const updatedStatuses = { ...prev.conversationStatuses, [convId]: convStatus };
        const updatedIds = prev.conversationIds.includes(convId)
          ? prev.conversationIds
          : [convId, ...prev.conversationIds];
        const overallStatus = Object.values(updatedStatuses).some(s => s === 'active') ? 'active' : 'ended';
        return {
          ...prev,
          conversationIds: updatedIds,
          conversationStatuses: updatedStatuses,
          status: overallStatus,
          ...(contactName && { contactName }),
          ...(lastMessageText && { lastMessage: { content: lastMessageText, direction: 'inbound', type: lastMessageType } }),
        };
      });
    }
  }, []);

  // Real-time updates via webhook SSE — injects data directly, no API calls
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === 'connected') return;

    // Extract webhook payload for direct injection
    const webhookData = event.data as Record<string, unknown> | undefined;
    const webhookConv = webhookData?.conversation as Record<string, unknown> | undefined;
    const webhookMsg = webhookData?.message as Record<string, unknown> | undefined;

    // Inbound message → inject message + update conversation sidebar
    if (event.type === 'message_received' && event.phoneNumber) {
      notificationSoundRef.current?.play().catch(() => {});

      const selected = selectedConversationRef.current;
      if (selected && event.phoneNumber === selected.phoneNumber) {
        setInitialUnreadCount(prev => prev + 1);
        // Inject message directly into MessageView — no API call
        if (webhookMsg) {
          messageViewRef.current?.injectMessage(webhookMsg, event.conversationId);
        }
      }

      // Always increment sidebar badge (server already incremented via webhook)
      setUnreadCounts(current => {
        const next = new Map(current);
        next.set(event.phoneNumber!, (next.get(event.phoneNumber!) ?? 0) + 1);
        return next;
      });

      // Update conversation sidebar with webhook data — use current time for sorting
      if (webhookConv) {
        updateConversationFromWebhook(event.phoneNumber!, webhookConv);
      }
    }

    // Outbound message → inject into current chat view
    if (event.type === 'message_sent') {
      const selected = selectedConversationRef.current;
      if (selected && event.phoneNumber === selected.phoneNumber && webhookMsg) {
        messageViewRef.current?.injectMessage(webhookMsg, event.conversationId);
      }
      if (webhookConv && event.phoneNumber) {
        updateConversationFromWebhook(event.phoneNumber, webhookConv);
      }
    }

    // Status updates (delivered/read) → update message status inline
    if (event.type === 'message_delivered' || event.type === 'message_read') {
      const selected = selectedConversationRef.current;
      if (selected && event.phoneNumber === selected.phoneNumber && event.messageId) {
        const newStatus = event.type === 'message_read' ? 'read' : 'delivered';
        messageViewRef.current?.updateMessageStatus(event.messageId, newStatus);
      }
    }

    // Conversation events → update sidebar status (no API call)
    if (event.type === 'conversation_started' || event.type === 'conversation_ended' || event.type === 'conversation_inactive') {
      if (webhookConv && event.phoneNumber) {
        updateConversationFromWebhook(event.phoneNumber, webhookConv);
      }
    }

    // Unread sync from another browser/tab
    if (event.type === 'unread_update' && event.data) {
      const serverUnread = event.data as Record<string, number>;
      setUnreadCounts(new Map(Object.entries(serverUnread)));
    }
  }, [updateConversationFromWebhook]);

  const { connected: sseConnected } = useRealtime({ onEvent: handleRealtimeEvent });

  // SSE connected: zero polling (webhook handles everything via direct injection)
  // SSE disconnected: fallback polling
  const conversationPollInterval = sseConnected ? 0 : 10000;
  const messagePollInterval = sseConnected ? 0 : 5000;

  // Show loading while checking auth, then login screen if not authenticated
  if (authenticated === null) {
    return <div className="h-dvh bg-[#111b21]" />;
  }
  if (!authenticated) {
    return <LoginScreen onSuccess={login} />;
  }

  return (
    <div className="h-dvh flex relative overflow-hidden">
      <PwaInstallBanner />
      <ConversationList
        ref={conversationListRef}
        onSelectConversation={handleSelectConversation}
        onConversationsUpdated={handleConversationsUpdated}
        selectedConversationId={selectedConversation?.phoneNumber}
        isHidden={!!selectedConversation}
        unreadCounts={unreadCounts}
        pollInterval={conversationPollInterval}
        notificationEnabled={notifEnabled}
        notificationPermission={notifPermission}
        onToggleNotification={toggleNotif}
      />
      <MessageView
        ref={messageViewRef}
        conversationIds={selectedConversation?.conversationIds}
        conversationStatuses={selectedConversation?.conversationStatuses}
        conversationStatus={selectedConversation?.status}
        phoneNumber={selectedConversation?.phoneNumber}
        contactName={selectedConversation?.contactName}
        totalConversations={selectedConversation?.totalConversations}
        onTemplateSent={handleTemplateSent}
        onStatusChanged={handleStatusChanged}
        onConversationStatusUpdate={handleConversationStatusUpdate}
        onMarkUnread={handleMarkUnread}
        onBack={handleBackToList}
        onInteraction={clearUnreadForSelected}
        isVisible={!!selectedConversation}
        pollInterval={messagePollInterval}
        initialUnreadCount={initialUnreadCount}
      />
    </div>
  );
}
