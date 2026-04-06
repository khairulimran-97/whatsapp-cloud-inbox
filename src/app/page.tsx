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
};

const UNREAD_STORAGE_KEY = 'whatsapp-inbox-unread';

function loadUnreadMap(): Map<string, number> {
  try {
    const stored = localStorage.getItem(UNREAD_STORAGE_KEY);
    if (!stored) return new Map();
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return new Map(parsed.map((phone: string) => [phone, 1]));
    }
    return new Map(Object.entries(parsed as Record<string, number>));
  } catch {
    return new Map();
  }
}

function saveUnreadMap(unread: Map<string, number>) {
  localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(Object.fromEntries(unread)));
  // Fire-and-forget sync to server
  fetch('/api/unread', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(unread)),
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
    // Load from localStorage first (instant), then sync from server
    setUnreadCounts(loadUnreadMap());
    fetch('/api/unread').then(r => r.json()).then(data => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const serverMap = new Map(Object.entries(data as Record<string, number>));
        // Merge: server wins for any key it has, keep local-only keys
        setUnreadCounts(prev => {
          const merged = new Map(prev);
          for (const [k, v] of serverMap) merged.set(k, v as number);
          return merged;
        });
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
    window.history.pushState({ view: 'chat' }, '');
    // Clear unread badge from sidebar
    if (count > 0) {
      setUnreadCounts(prev => {
        const next = new Map(prev);
        next.delete(conversation.phoneNumber);
        saveUnreadMap(next);
        return next;
      });
    }
  }, [unreadCounts]);

  const clearUnreadForSelected = useCallback(() => {
    const selected = selectedConversationRef.current;
    if (!selected) return;
    setInitialUnreadCount(0);
    setUnreadCounts(prev => {
      if (!prev.has(selected.phoneNumber)) return prev;
      const next = new Map(prev);
      next.delete(selected.phoneNumber);
      saveUnreadMap(next);
      return next;
    });
  }, []);

  // Sync selected conversation when conversation list updates
  const handleConversationsUpdated = useCallback((conversations: Conversation[]) => {
    const selected = selectedConversationRef.current;

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
      saveUnreadMap(next);
      return next;
    });
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

  // PWA back button support: listen for popstate to return to conversation list
  useEffect(() => {
    const handlePopState = () => {
      if (selectedConversationRef.current) {
        setSelectedConversation(undefined);
        setInitialUnreadCount(0);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Real-time updates via webhook SSE — triggers instant refresh on events
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type === 'connected') return;

    // Message events → refresh messages + conversation list
    if (event.type === 'message_received' || event.type === 'message_sent') {
      messageViewRef.current?.refresh();
      conversationListRef.current?.refresh();

      // Inbound message → play sound + increment unread
      if (event.type === 'message_received' && event.phoneNumber) {
        notificationSoundRef.current?.play().catch(() => {});

        const selected = selectedConversationRef.current;
        if (selected && event.phoneNumber === selected.phoneNumber) {
          // Currently viewing this conversation — show unread divider line
          setInitialUnreadCount(prev => prev + 1);
        }

        // Always increment sidebar badge
        setUnreadCounts(current => {
          const next = new Map(current);
          next.set(event.phoneNumber!, (next.get(event.phoneNumber!) ?? 0) + 1);
          saveUnreadMap(next);
          return next;
        });
      }
    }

    // Status events → refresh messages
    if (event.type === 'message_delivered' || event.type === 'message_read' || event.type === 'message_failed') {
      messageViewRef.current?.refresh();
    }

    // Conversation events → refresh list
    if (event.type === 'conversation_started' || event.type === 'conversation_ended' || event.type === 'conversation_inactive') {
      conversationListRef.current?.refresh();
    }

    // Unread sync from another browser/tab
    if (event.type === 'unread_update' && event.data) {
      const serverUnread = event.data as Record<string, number>;
      const serverMap = new Map(Object.entries(serverUnread));
      setUnreadCounts(serverMap);
      localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(serverUnread));
    }
  }, []);

  const { connected: sseConnected } = useRealtime({ onEvent: handleRealtimeEvent });

  // Adaptive polling: fast when no webhook/SSE, slow as backup when connected
  const conversationPollInterval = sseConnected ? 30000 : 10000;
  const messagePollInterval = sseConnected ? 30000 : 5000;

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
        onTemplateSent={handleTemplateSent}
        onStatusChanged={handleStatusChanged}
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
