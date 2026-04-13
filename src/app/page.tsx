'use client';

import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
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

type WaProfile = {
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string;
  phoneDisplay?: string;
  isDefault: boolean;
  bclMerchantIds?: string[];
};

// Server-side unread operations (SQLite is the single source of truth)
function clearUnreadOnServer(phone: string, phoneNumberId?: string | null) {
  fetch('/api/unread', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clear: [phone], phoneNumberId: phoneNumberId ?? undefined }),
  }).catch(() => {});
}

function markUnreadOnServer(phone: string, phoneNumberId?: string | null) {
  fetch('/api/unread', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ increment: [phone], phoneNumberId: phoneNumberId ?? undefined }),
  }).catch(() => {});
}

export default function Home() {
  const { authenticated, login } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<Conversation>();
  const [searchHighlight, setSearchHighlight] = useState<string>();
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [typingPhone, setTypingPhone] = useState<string | null>(null);
  const conversationListRef = useRef<ConversationListRef>(null);
  const messageViewRef = useRef<MessageViewRef>(null);
  const selectedConversationRef = useRef<Conversation | undefined>(undefined);
  const statusCooldownRef = useRef<number>(0);
  selectedConversationRef.current = selectedConversation;
  const { enabled: notifEnabled, permission: notifPermission, toggle: toggleNotif } = useNotification();
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  // Multi-profile state
  const [profiles, setProfiles] = useState<WaProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const activePhoneNumberIdRef = useRef<string | null>(null);
  // Keep ref in sync for use in event callbacks
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  activePhoneNumberIdRef.current = activeProfile?.phoneNumberId ?? null;

  // Resizable panel widths (reset to defaults on refresh)
  const [listWidth, setListWidth] = useState(384);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const resizingRef = useRef<'list' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const LIST_MIN = 280;
  const LIST_MAX = 520;

  const handleResizeStart = useCallback((panel: 'list', e: ReactMouseEvent) => {
    e.preventDefault();
    resizingRef.current = panel;
    startXRef.current = e.clientX;
    startWidthRef.current = listWidth;
    let currentWidth = listWidth;

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      currentWidth = Math.max(LIST_MIN, Math.min(LIST_MAX, startWidthRef.current + delta));
      setListWidth(currentWidth);
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [listWidth]);

  useEffect(() => {
    // Load WA profiles
    fetch('/api/wa-profiles')
      .then(r => r.json())
      .then((resp) => {
        const data: WaProfile[] = resp.profiles || (Array.isArray(resp) ? resp : []);
        if (data.length > 0) {
          setProfiles(data);
          const saved = localStorage.getItem('activeProfileId');
          const match = saved ? data.find(p => p.id === saved) : null;
          const defaultProfile = match || data.find(p => p.isDefault) || data[0];
          setActiveProfileId(defaultProfile.id);
        }
      })
      .catch(() => {});
  }, []);

  // Load unread counts filtered by active profile
  useEffect(() => {
    if (!activeProfileId) return;
    const pnid = profiles.find(p => p.id === activeProfileId)?.phoneNumberId;
    const url = pnid ? `/api/unread?phoneNumberId=${pnid}` : '/api/unread';
    fetch(url).then(r => r.json()).then(data => {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setUnreadCounts(new Map(Object.entries(data as Record<string, number>)));
      }
    }).catch(() => {});
  }, [activeProfileId, profiles]);

  useEffect(() => {
    notificationSoundRef.current = new Audio('/notification.wav');
    notificationSoundRef.current.volume = 0.8;

    // Browsers block audio until user interacts — unlock on first click/tap
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const audio = notificationSoundRef.current;
      if (audio) {
        const origVol = audio.volume;
        audio.volume = 0;
        audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.volume = origVol; audioUnlockedRef.current = true; }).catch(() => { audio.volume = origVol; });
      }
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  const refreshProfiles = useCallback(() => {
    fetch('/api/wa-profiles')
      .then(r => r.json())
      .then((resp) => {
        const data: WaProfile[] = resp.profiles || (Array.isArray(resp) ? resp : []);
        if (data.length > 0) setProfiles(data);
      })
      .catch(() => {});
  }, []);

  const handleProfileSwitch = useCallback((newProfileId: string) => {
    setActiveProfileId(newProfileId);
    localStorage.setItem('activeProfileId', newProfileId);
    setSelectedConversation(undefined);
    setInitialUnreadCount(0);
    // Clear URL hash so it doesn't carry over from previous profile
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSelectConversation = useCallback((conversation: Conversation, searchQuery?: string) => {
    // Capture unread count BEFORE clearing (for "X unread messages" divider)
    const count = unreadCounts.get(conversation.phoneNumber) ?? 0;
    setInitialUnreadCount(count);
    setSelectedConversation(conversation);
    setSearchHighlight(searchQuery);
    // Push history state so PWA back button returns to list instead of closing app
    window.history.pushState({ view: 'chat' }, '', `#${conversation.phoneNumber}`);
    // Clear unread badge from sidebar
    if (count > 0) {
      setUnreadCounts(prev => {
        const next = new Map(prev);
        next.delete(conversation.phoneNumber);
        return next;
      });
      clearUnreadOnServer(conversation.phoneNumber, activePhoneNumberIdRef.current);
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
    clearUnreadOnServer(selected.phoneNumber, activePhoneNumberIdRef.current);
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
    markUnreadOnServer(phoneNumber, activePhoneNumberIdRef.current);
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
  const handleConversationStatusUpdate = useCallback((statuses: Record<string, string>, newConversationIds?: string[]) => {
    setSelectedConversation(prev => {
      if (!prev) return prev;
      const updatedStatuses = { ...prev.conversationStatuses, ...statuses };
      const overallStatus = Object.values(updatedStatuses).some(s => s === 'active') ? 'active' : 'ended';
      // Add any new conversation IDs from API
      let updatedIds = prev.conversationIds;
      if (newConversationIds) {
        const existingSet = new Set(prev.conversationIds);
        const newIds = newConversationIds.filter(id => !existingSet.has(id));
        if (newIds.length > 0) {
          updatedIds = [...newIds, ...prev.conversationIds];
        }
      }
      // Skip if nothing changed
      const statusChanged = Object.entries(statuses).some(([id, s]) => prev.conversationStatuses[id] !== s);
      if (!statusChanged && updatedIds === prev.conversationIds) return prev;
      const updated = { ...prev, conversationIds: updatedIds, conversationStatuses: updatedStatuses, status: overallStatus };
      // Defer child update to avoid setState-during-render warning
      queueMicrotask(() => conversationListRef.current?.updateConversation?.(updated));
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

    // Determine direction from kapso timestamps
    const lastInbound = kapso?.last_inbound_at as string | undefined;
    const lastOutbound = kapso?.last_outbound_at as string | undefined;
    const direction = lastOutbound && (!lastInbound || lastOutbound >= lastInbound) ? 'outbound' : 'inbound';

    conversationListRef.current?.updateConversationFromWebhook?.(phoneNumber, {
      conversationId: convId,
      status: convStatus,
      lastMessage: lastMessageText ? { content: lastMessageText, direction, type: lastMessageType } : undefined,
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

    // Ignore events from other WABA profiles
    const myPhoneNumberId = activePhoneNumberIdRef.current;
    if (event.phoneNumberId && myPhoneNumberId && event.phoneNumberId !== myPhoneNumberId) {
      return;
    }

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

    // Unread sync from another browser/tab — filter by active profile
    if (event.type === 'unread_update' && event.data) {
      const rawUnread = event.data as Record<string, number>;
      const pnid = activePhoneNumberIdRef.current;
      const filtered: Record<string, number> = {};
      for (const [key, count] of Object.entries(rawUnread)) {
        if (count <= 0) continue;
        const parts = key.split(':');
        const phone = parts[0];
        const keyPnid = parts[1];
        // Skip entries from other profiles
        if (pnid && keyPnid && keyPnid !== pnid) continue;
        filtered[phone] = Math.max(filtered[phone] ?? 0, count);
      }
      setUnreadCounts(new Map(Object.entries(filtered)));
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
  // Wait for profile to resolve before rendering to prevent flash of wrong data
  if (!activeProfileId) {
    return <div className="h-dvh bg-[#111b21]" />;
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
        typingPhone={typingPhone}
        panelWidth={listWidth}
        profileId={activeProfileId}
        onSettingsVisibilityChange={setSettingsVisible}
        profiles={profiles}
        onProfileSwitch={handleProfileSwitch}
        onProfilesChanged={refreshProfiles}
      />
      {/* Resize handle for conversation list — overlays the border, no extra gap */}
      {!settingsVisible && (
      <div
        className="hidden md:flex w-0 relative z-10 cursor-col-resize items-center justify-center group"
        onMouseDown={(e) => handleResizeStart('list', e)}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 w-2 flex items-center justify-center hover:bg-[var(--wa-green)]/20 active:bg-[var(--wa-green)]/30 transition-colors">
          <div className="w-[2px] h-8 rounded-full bg-transparent group-hover:bg-[var(--wa-green)]/60 group-active:bg-[var(--wa-green)] transition-colors" />
        </div>
      </div>
      )}
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
        onTypingChange={(isTyping) => setTypingPhone(isTyping ? selectedConversation?.phoneNumber ?? null : null)}
        isVisible={!!selectedConversation}
        pollInterval={messagePollInterval}
        initialUnreadCount={initialUnreadCount}
        searchHighlight={searchHighlight}
        profileId={activeProfileId}
        profileBclMerchantIds={profiles.find(p => p.id === activeProfileId)?.bclMerchantIds || []}
      />
    </div>
  );
}
