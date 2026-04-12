'use client';

import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { Paperclip, Send, X, MessageSquare, ListTree, ArrowLeft, CircleCheck, RotateCcw, MailOpen, MoreVertical, Info, List, Link, Search, ChevronUp, ChevronDown, Zap, RefreshCw, HandMetal, Play, ImagePlus, Plus, MessageSquareQuote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaMessage } from '@/components/media-message';
import { InteractiveMessageDialog } from '@/components/interactive-message-dialog';
import { InteractiveListDialog } from '@/components/interactive-list-dialog';
import { CtaUrlDialog } from '@/components/cta-url-dialog';
import { TemplateSelectorDialog } from '@/components/template-selector-dialog';
import { CustomerSidebar } from '@/components/customer-sidebar';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MediaData } from '@kapso/whatsapp-cloud-api';

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300' },
];

function getAvatarColor(identifier: string) {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getAvatarInitials(contactName?: string, phoneNumber?: string): string {
  if (contactName) {
    const clean = contactName.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
  }
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '');
    return digits.slice(-2);
  }
  return '??';
}

// Image with loading placeholder
function LazyImage({ src, alt, className, onClick }: { src: string; alt: string; className?: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-[var(--wa-hover)] rounded-[5px] min-h-[60px] min-w-[180px]", className)}>
        <span className="text-xs text-[var(--wa-text-secondary)]">Failed to load image</span>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="flex items-center justify-center bg-[var(--wa-hover)] rounded-[5px] min-h-[120px] min-w-[180px]">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--wa-text-secondary)]/30 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--wa-text-secondary)]/30 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--wa-text-secondary)]/30 animate-bounce" />
          </div>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(className, !loaded && 'hidden')}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  );
}

// Lightbox with loading indicator
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/90" />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white z-10 h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="h-6 w-6" />
      </button>
      {!loaded && (
        <div className="relative z-10 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/40 animate-bounce" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Full size"
        className={cn(
          "relative z-10 max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl",
          !loaded && 'hidden'
        )}
        onClick={(e) => e.stopPropagation()}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
  } | (MediaData & { url: string });
  filename?: string | null;
  mimeType?: string | null;
  messageType?: string;
  caption?: string | null;
  conversationId?: string;
  errorDetails?: {
    code?: number;
    title?: string;
    message?: string;
  };
  metadata?: {
    mediaId?: string;
    caption?: string;
    message_type_data?: {
      type?: string;
      body_text?: string;
    };
    interactive?: {
      type?: string;
      body?: { text?: string };
      action?: {
        name?: string;
        parameters?: { display_text?: string; url?: string };
      };
    };
    [key: string]: unknown;
  };
};

function formatMessageTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isValid(date)) {
      return format(date, 'HH:mm');
    }
    return '';
  } catch {
    return '';
  }
}

function formatDateDivider(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '';

    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  } catch {
    return '';
  }
}

function shouldShowDateDivider(currentMsg: Message, prevMsg: Message | null): boolean {
  if (!prevMsg) return true;

  try {
    const currentDate = new Date(currentMsg.createdAt);
    const prevDate = new Date(prevMsg.createdAt);

    if (!isValid(currentDate) || !isValid(prevDate)) return false;

    return format(currentDate, 'yyyy-MM-dd') !== format(prevDate, 'yyyy-MM-dd');
  } catch {
    return false;
  }
}

function highlightText(text: string, query?: string): ReactNode {
  if (!query || !text) return text;
  const stripped = query.replace(/^0+/, '');
  const parts = [query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  if (stripped !== query) parts.push(stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${parts.join('|')})`, 'gi');
  const segments = text.split(regex);
  if (segments.length === 1) return text;
  return segments.map((seg, i) =>
    regex.test(seg)
      ? <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40 text-inherit rounded-sm">{seg}</mark>
      : seg
  );
}

type Props = {
  conversationIds?: string[];
  conversationStatuses?: Record<string, string>;
  conversationStatus?: string;
  phoneNumber?: string;
  contactName?: string;
  totalConversations?: number;
  onTemplateSent?: (phoneNumber: string) => Promise<void>;
  onStatusChanged?: () => Promise<void>;
  onConversationStatusUpdate?: (statuses: Record<string, string>, newConversationIds?: string[]) => void;
  onMarkUnread?: (phoneNumber: string) => void;
  onBack?: () => void;
  onInteraction?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  isVisible?: boolean;
  pollInterval?: number;
  initialUnreadCount?: number;
  searchHighlight?: string;
};

export type MessageViewRef = {
  refresh: () => void;
  injectMessage: (webhookMsg: Record<string, unknown>, conversationId?: string) => void;
  updateMessageStatus: (messageId: string, status: string) => void;
};

export const MessageView = forwardRef<MessageViewRef, Props>(function MessageView({ conversationIds, conversationStatuses, conversationStatus, phoneNumber, contactName, totalConversations, onTemplateSent, onStatusChanged, onConversationStatusUpdate, onMarkUnread, onBack, onInteraction, onTypingChange, isVisible = false, pollInterval = 5000, initialUnreadCount = 0, searchHighlight }: Props, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [showCtaDialog, setShowCtaDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showCustomerSidebar, setShowCustomerSidebar] = useState(false);
  const [showQuickReplyDialog, setShowQuickReplyDialog] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<Message[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [rateLimitWarning, setRateLimitWarning] = useState(false);
  const [replyTemplates, setReplyTemplates] = useState<{ id: string; title: string; category: string; body: string }[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'close' | 'reopen' | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [workflowExecution, setWorkflowExecution] = useState<{
    id: string;
    status: string;
    workflowName: string;
    conversationId: string;
  } | null>(null);
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousMessageCountRef = useRef(0);
  const prevMessageFingerprintRef = useRef<string>('');
  const messagesRef = useRef<Message[]>([]);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
  const refreshingRef = useRef(false);
  const markedReadRef = useRef<string>('');
  const prevPhoneRef = useRef<string | undefined>(undefined);

  const SIDEBAR_MIN = 300;
  const SIDEBAR_MAX = 600;
  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    let currentW = startW;
    const onMove = (ev: MouseEvent) => {
      // Dragging left = wider sidebar (delta is negative)
      currentW = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW - (ev.clientX - startX)));
      setSidebarWidth(currentW);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // Initialize notification sound — shares unlock from parent's first click
  useEffect(() => {
    notificationSoundRef.current = new Audio('/notification.wav');
    notificationSoundRef.current.volume = 0.8;
    // Unlock audio on first user interaction (silent)
    const unlock = () => {
      const audio = notificationSoundRef.current;
      if (audio) {
        const origVol = audio.volume;
        audio.volume = 0;
        audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.volume = origVol; }).catch(() => { audio.volume = origVol; });
      }
    };
    document.addEventListener('click', unlock, { once: true });
    return () => document.removeEventListener('click', unlock);
  }, []);

  // Fetch reply templates
  useEffect(() => {
    fetch('/api/reply-templates')
      .then(r => r.json())
      .then(data => setReplyTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  // Notify parent of typing state changes
  useEffect(() => {
    onTypingChange?.(messageInput.trim().length > 0);
  }, [messageInput, onTypingChange]);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightboxUrl) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxUrl]);

  // Expose methods to parent — background refresh + direct injection
  useImperativeHandle(ref, () => ({
    refresh: () => {
      refreshingRef.current = true;
      fetchMessages();
    },
    // Inject a webhook message directly into state — no API call needed
    injectMessage: (webhookMsg: Record<string, unknown>, conversationId?: string) => {
      const kapso = webhookMsg.kapso as Record<string, unknown> | undefined;
      if (!kapso) return;

      const msgId = webhookMsg.id as string;
      if (!msgId) return;

      // Skip reactions
      const msgType = webhookMsg.type as string;
      if (msgType === 'reaction') return;

      const direction = kapso.direction as string ?? 'inbound';
      const content = typeof kapso.content === 'string' ? kapso.content : 
        typeof (webhookMsg.text as Record<string, unknown>)?.body === 'string' ? (webhookMsg.text as Record<string, unknown>).body as string : '';
      const status = kapso.status as string | undefined;
      const timestamp = webhookMsg.timestamp as string;
      const createdAt = timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString();
      const hasMedia = Boolean(kapso.has_media);

      // Extract media data for images/videos/etc
      let mediaData: Message['mediaData'] | undefined;
      let metadata: Message['metadata'] | undefined;
      for (const mediaType of ['image', 'video', 'audio', 'document', 'sticker'] as const) {
        const media = webhookMsg[mediaType] as Record<string, unknown> | undefined;
        if (media && (media.id || media.link)) {
          mediaData = {
            url: `/api/media/${media.id}`,
            contentType: media.mime_type as string | undefined,
            filename: media.filename as string | undefined,
          };
          break;
        }
      }

      // Extract metadata (message_type_data, interactive)
      const messageTypeData = kapso.message_type_data as Record<string, unknown> | undefined;
      const interactive = webhookMsg.interactive as Record<string, unknown> | undefined;
      if (messageTypeData || interactive) {
        metadata = {} as NonNullable<Message['metadata']>;
        if (messageTypeData) metadata.message_type_data = messageTypeData as NonNullable<Message['metadata']>['message_type_data'];
        if (interactive) metadata.interactive = interactive as NonNullable<Message['metadata']>['interactive'];
      }

      const newMsg: Message = {
        id: msgId,
        direction: direction as 'inbound' | 'outbound',
        content,
        createdAt,
        status,
        phoneNumber: (webhookMsg.from ?? webhookMsg.to ?? phoneNumber) as string,
        hasMedia,
        messageType: msgType,
        conversationId,
        mediaData,
        metadata,
      };

      setMessages(prev => {
        // Skip if already exists (deduplicate)
        if (prev.some(m => m.id === msgId)) return prev;
        // If this is an outbound message, replace any optimistic temp message
        let base = prev;
        if (direction === 'outbound' && content) {
          const tempIdx = prev.findIndex(m => m.id.startsWith('temp-') && m.content === content && m.direction === 'outbound');
          if (tempIdx !== -1) {
            base = [...prev];
            base.splice(tempIdx, 1);
          }
        }
        const updated = [...base, newMsg].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        prevMessageFingerprintRef.current = updated.map(m => m.id + (m.status || '')).join(',');
        previousMessageCountRef.current = updated.length;
        return updated;
      });
    },
    // Update delivery/read status of a specific message — no API call
    updateMessageStatus: (messageId: string, status: string) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === messageId);
        if (idx === -1) return prev;
        if (prev[idx].status === status) return prev; // already up to date
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status };
        prevMessageFingerprintRef.current = updated.map(m => m.id + (m.status || '')).join(',');
        return updated;
      });
    },
  }));

  // Compute 24-hour messaging window status
  const windowInfo = (() => {
    const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
    if (!lastInbound) return { status: 'no-inbound' as const, hoursLeft: 0 };
    const elapsed = Date.now() - new Date(lastInbound.createdAt).getTime();
    const hoursLeft = Math.max(0, 24 - elapsed / (1000 * 60 * 60));
    if (hoursLeft <= 0) return { status: 'expired' as const, hoursLeft: 0 };
    if (hoursLeft <= 4) return { status: 'expiring-soon' as const, hoursLeft };
    return { status: 'active' as const, hoursLeft };
  })();

  const scrollToBottom = (instant = false) => {
    const behavior = instant ? 'instant' as ScrollBehavior : 'smooth';
    // If there's an unread divider, scroll to it; otherwise scroll to bottom
    if (unreadDividerRef.current) {
      unreadDividerRef.current.scrollIntoView({ behavior, block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  };

  const fetchMessages = useCallback(async () => {
    if (!conversationIds || conversationIds.length === 0) return;

    const isInitialLoad = prevMessageFingerprintRef.current === '';
    const isRefresh = refreshingRef.current;

    try {
      // Only force refresh on manual refresh, not on initial load/conversation switch
      const shouldRefresh = isRefresh;

      // Single batch API call (server handles caching + parallel fetching)
      const params = new URLSearchParams({
        ids: conversationIds.join(','),
        mode: isInitialLoad ? 'initial' : 'poll',
        ...(shouldRefresh ? { refresh: 'true' } : {}),
      });

      const r = await fetch(`/api/messages/batch?${params}`);
      if (!r.ok) {
        // On error, keep existing messages
        if (messagesRef.current.length > 0) return;
        throw new Error(`Batch fetch failed: ${r.status}`);
      }
      const json = await r.json();
      const rawMessages = (json.data || []) as Message[];

      // If no data and we have cached messages, keep them
      if (rawMessages.length === 0 && messagesRef.current.length > 0 && !isInitialLoad) return;

      // Deduplicate by message ID
      const messageMap = new Map<string, Message>();
      for (const msg of rawMessages) {
        if (!messageMap.has(msg.id)) messageMap.set(msg.id, msg);
      }
      // Filter out reaction messages — they're not displayed
      const filteredMessages = Array.from(messageMap.values()).filter(m => m.messageType !== 'reaction');

      const sortedMessages = filteredMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Only update state if messages actually changed (fingerprint comparison)
      const fingerprint = sortedMessages.map(m => m.id + (m.status || '')).join(',');
      if (fingerprint !== prevMessageFingerprintRef.current) {
        const hadMessages = prevMessageFingerprintRef.current !== '';
        const prevCount = previousMessageCountRef.current;
        prevMessageFingerprintRef.current = fingerprint;
        setMessages(sortedMessages);
        previousMessageCountRef.current = sortedMessages.length;

        // Play notification sound for new inbound messages (not on initial load)
        if (hadMessages && sortedMessages.length > prevCount) {
          const lastMsg = sortedMessages[sortedMessages.length - 1];
          if (lastMsg?.direction === 'inbound') {
            notificationSoundRef.current?.play().catch(() => {});
          }
        }

        // Mark last inbound message as read via WhatsApp API (once per conversation)
        if (isInitialLoad) {
          const convKey = conversationIds.join(',');
          if (markedReadRef.current !== convKey) {
            markedReadRef.current = convKey;
            const lastInbound = [...sortedMessages].reverse().find(m => m.direction === 'inbound');
            if (lastInbound) {
              fetch('/api/messages/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: lastInbound.id }),
              }).catch(() => {});
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, [conversationIds]);

  // Load older messages from additional conversation sessions on demand
  const loadedSessionIds = useRef<Set<string>>(new Set());
  const hasOlderSessions = (totalConversations ?? 0) > (conversationIds?.length ?? 0);
  
  // Reset loaded sessions when conversation changes
  useEffect(() => {
    loadedSessionIds.current = new Set(conversationIds ?? []);
  }, [conversationIds]);

  const loadOlderMessages = useCallback(async () => {
    if (!phoneNumber || loadingOlder) return;
    setLoadingOlder(true);
    try {
      // Get ALL conversation IDs for this phone from server cache (no Kapso API call)
      const r = await fetch(`/api/conversations?olderIds=${encodeURIComponent(phoneNumber)}`);
      if (!r.ok) return;
      const data = await r.json();
      const allIds = (data.conversationIds || []) as string[];

      // Find IDs we haven't loaded yet (tracked across clicks)
      const olderIds = allIds.filter((id: string) => !loadedSessionIds.current.has(id)).slice(0, 5);
      if (olderIds.length === 0) return;

      // Mark these as loaded before fetching
      for (const id of olderIds) {
        loadedSessionIds.current.add(id);
      }

      // Fetch messages for older sessions (this makes Kapso API calls)
      const params = new URLSearchParams({
        ids: olderIds.join(','),
        mode: 'initial',
        refresh: 'true',
      });
      const msgRes = await fetch(`/api/messages/batch?${params}`);
      if (!msgRes.ok) return;
      const msgData = await msgRes.json();
      const olderMessages = (msgData.data || []) as Message[];

      // Merge older messages with existing ones
      setMessages(prev => {
        const messageMap = new Map<string, Message>();
        for (const msg of olderMessages) {
          if (msg.messageType !== 'reaction') messageMap.set(msg.id, msg);
        }
        for (const msg of prev) {
          messageMap.set(msg.id, msg); // existing messages take priority
        }
        const sorted = Array.from(messageMap.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        prevMessageFingerprintRef.current = sorted.map(m => m.id + (m.status || '')).join(',');
        previousMessageCountRef.current = sorted.length;
        return sorted;
      });
    } catch (error) {
      console.error('Error loading older messages:', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [phoneNumber, conversationIds, loadingOlder]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (conversationIds && conversationIds.length > 0) {
      const isNewChat = phoneNumber !== prevPhoneRef.current;
      prevPhoneRef.current = phoneNumber;

      if (isNewChat) {
        // User switched to a different conversation — clear + fetch
        setMessages([]);
        messagesRef.current = [];
        previousMessageCountRef.current = 0;
        setLoading(true);
        setIsNearBottom(true);
        unreadDividerRef.current = null;
        prevMessageFingerprintRef.current = '';
        initialScrollDoneRef.current = false;
        fetchMessages();

        // Refresh all conversation statuses from Kapso API (non-blocking)
        if (phoneNumber) {
          fetch(`/api/conversations/status-by-phone?phone=${phoneNumber}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data?.sessions) return;
              onConversationStatusUpdate?.(data.sessions, data.conversationIds);
            })
            .catch(() => {});
        }
      }
      // Same phone, new session ID added via webhook — skip fetch,
      // messages are injected directly via injectMessage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIds, fetchMessages, phoneNumber]);

  // Poll all conversation statuses every 30s via Kapso API
  useEffect(() => {
    if (!phoneNumber) return;
    const poll = () => {
      fetch(`/api/conversations/status-by-phone?phone=${phoneNumber}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.sessions) return;
          onConversationStatusUpdate?.(data.sessions, data.conversationIds);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber]);

  // Fetch workflow execution status for this conversation
  useEffect(() => {
    if (!conversationIds || conversationIds.length === 0) return;
    setWorkflowExecution(null);
    const fetchExecution = () => {
      fetch(`/api/workflows/executions?conversationIds=${conversationIds.join(',')}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.data?.length > 0) {
            setWorkflowExecution(data.data[0]);
          } else {
            setWorkflowExecution(null);
          }
        })
        .catch(() => {});
    };
    fetchExecution();
    // Poll every 30s to detect workflow state changes
    const interval = setInterval(fetchExecution, 30000);
    return () => clearInterval(interval);
  }, [conversationIds]);

  const handleWorkflowAction = useCallback(async (targetStatus: string) => {
    if (!workflowExecution) return;
    setWorkflowActionLoading(true);
    try {
      const res = await fetch(`/api/workflow-executions?id=${workflowExecution.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        if (targetStatus === 'ended') {
          setWorkflowExecution(null);
        } else {
          setWorkflowExecution(prev => prev ? { ...prev, status: targetStatus } : null);
        }
      }
    } catch {
      // ignore
    } finally {
      setWorkflowActionLoading(false);
    }
  }, [workflowExecution]);

  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    if (isNearBottom) {
      const isInitial = !initialScrollDoneRef.current && messages.length > 0;
      if (isInitial) initialScrollDoneRef.current = true;
      requestAnimationFrame(() => scrollToBottom(isInitial));
    }
  }, [messages, isNearBottom]);

  // Track if user is near bottom of scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const viewport = container.querySelector('[data-radix-scroll-area-viewport]');
      if (!viewport) return;

      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setIsNearBottom(distanceFromBottom < 100);
    };

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.addEventListener('scroll', handleScroll);
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleStatusChange = async (newStatus: 'active' | 'ended') => {
    if (!conversationIds || conversationIds.length === 0) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch('/api/conversations/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversationIds[0], status: newStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to update conversation status');
        return;
      }
      // Optimistically update UI immediately, then refresh list in background
      setConfirmAction(null);
      onStatusChanged?.();
    } catch (error) {
      console.error('Error updating conversation status:', error);
      alert('Failed to update conversation status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Auto-polling — adaptive interval (fast without webhook, slow as backup with webhook)
  useAutoPolling({
    interval: pollInterval,
    enabled: !!conversationIds && conversationIds.length > 0 && pollInterval > 0,
    onPoll: fetchMessages
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!messageInput.trim() && !selectedFile) || !phoneNumber || sending) return;

    const text = messageInput.trim();
    const file = selectedFile;

    // Optimistic: show message instantly with "sending" status
    const tempId = `temp-${Date.now()}`;
    if (text && !file) {
      const optimisticMsg: Message = {
        id: tempId,
        direction: 'outbound',
        content: text,
        createdAt: new Date().toISOString(),
        status: 'sending',
        phoneNumber,
        hasMedia: false,
        messageType: 'text',
      };
      setMessages(prev => {
        const updated = [...prev, optimisticMsg];
        prevMessageFingerprintRef.current = updated.map(m => m.id + (m.status || '')).join(',');
        previousMessageCountRef.current = updated.length;
        return updated;
      });
    }

    // Clear input immediately for snappy feel
    setMessageInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    if (file) handleRemoveFile();

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('to', phoneNumber);
      if (text) {
        formData.append('body', text);
      }
      if (file) {
        formData.append('file', file);
      }

      const res = await fetch('/api/messages/send', {
        method: 'POST',
        body: formData
      });

      const data = await res.json().catch(() => null);
      if (data?.reason === 'rate_limited') {
        // Remove optimistic message on rate limit
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setMessageInput(text);
        setRateLimitWarning(true);
        setTimeout(() => setRateLimitWarning(false), 5000);
        return;
      }

      if (!res.ok) {
        // Mark optimistic message as failed
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, status: 'failed' } : m
        ));
        return;
      }

      // Replace temp message with real ID (webhook will update status)
      const realId = data?.messageId || data?.messages?.[0]?.id;
      if (realId && text && !file) {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: realId, status: 'sent' } : m
        ));
      } else {
        // File messages or no real ID — fetch to get the actual message
        setMessages(prev => prev.filter(m => m.id !== tempId));
        await fetchMessages();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Mark optimistic message as failed
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, status: 'failed' } : m
      ));
    } finally {
      setSending(false);
    }
  };

  const handleTemplateSent = async () => {
    await fetchMessages();

    // Notify parent to refresh conversation list and select this conversation
    if (phoneNumber && onTemplateSent) {
      await onTemplateSent(phoneNumber);
    }
  };

  const handleMessageSearch = useCallback((query: string) => {
    setMessageSearchQuery(query);
    if (!query.trim()) {
      setMessageSearchResults([]);
      setSearchMatchIndex(0);
      return;
    }
    const q = query.toLowerCase();
    const results = messages.filter(
      (m) =>
        m.content?.toLowerCase().includes(q) ||
        m.caption?.toLowerCase().includes(q)
    );
    setMessageSearchResults(results);
    setSearchMatchIndex(0);
    if (results.length > 0) {
      requestAnimationFrame(() => {
        document.getElementById(`msg-${results[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [messages]);

  const navigateSearch = useCallback((direction: 'prev' | 'next') => {
    if (messageSearchResults.length === 0) return;
    const newIndex = direction === 'next'
      ? (searchMatchIndex + 1) % messageSearchResults.length
      : (searchMatchIndex - 1 + messageSearchResults.length) % messageSearchResults.length;
    setSearchMatchIndex(newIndex);
    requestAnimationFrame(() => {
      document.getElementById(`msg-${messageSearchResults[newIndex].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [messageSearchResults, searchMatchIndex]);

  // Cmd+F / Ctrl+F keyboard shortcut to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowMessageSearch(prev => {
          if (prev) {
            setMessageSearchQuery('');
            setMessageSearchResults([]);
            return false;
          }
          return true;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (showMessageSearch) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [showMessageSearch]);

  if (!conversationIds || conversationIds.length === 0) {
    return (
      <div className={cn(
        "flex-1 flex flex-col items-center justify-center bg-[var(--wa-bg)] panel-slide",
        !isVisible ? "panel-slide-right" : "panel-slide-center"
      )}>
        <div className="flex flex-col items-center text-center px-8 max-w-md">
          <div className="h-20 w-20 rounded-full bg-[var(--wa-green)]/10 flex items-center justify-center mb-6">
            <MessageSquare className="h-10 w-10 text-[var(--wa-green)]" />
          </div>
          <h2 className="text-2xl font-light text-[var(--wa-text-tertiary)] mb-3">WhatsApp Inbox</h2>
          <p className="text-sm text-[var(--wa-text-secondary)] leading-relaxed">
            Select a conversation from the sidebar to view messages and start chatting.
          </p>
        </div>
      </div>
    );
  }

  // Full skeleton only for very first render (no contact info yet)
  if (loading && !contactName && !phoneNumber) {
    return (
      <div className={cn(
        "flex-1 flex flex-col chat-bg panel-slide",
        !isVisible ? "panel-slide-right" : "panel-slide-center"
      )}>
        <div className="border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)] safe-area-top">
          <div className="flex items-center h-[60px] px-2 sm:px-3">
            {onBack && (
              <button
                onClick={onBack}
                className="md:hidden flex items-center justify-center h-10 w-8 -mr-1 text-[var(--wa-text-tertiary)] rounded-full flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-36 mb-1.5" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-[900px] mx-auto space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] md:max-w-[65%] rounded-lg px-3 py-2 shadow-sm',
                  i % 2 === 0 ? 'bg-[var(--wa-bubble-out)]' : 'bg-[var(--wa-bubble-in)]'
                )}>
                  <Skeleton className="h-4 mb-2" style={{ width: `${100 + (i * 37) % 150}px` }} />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 flex flex-row chat-bg panel-slide overflow-hidden",
        !isVisible ? "panel-slide-right" : "panel-slide-center"
      )}
    >
      {/* Main chat column */}
      <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)] safe-area-top">
        <div className="flex items-center h-[60px] px-2 sm:px-3">
          {/* Back button — overlaps with avatar on mobile like WhatsApp */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden flex items-center justify-center h-10 w-8 -mr-1 text-[var(--wa-text-tertiary)] active:bg-black/5 rounded-full flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Avatar + contact info */}
          {(() => {
            const identifier = contactName || phoneNumber || '';
            const avatarColor = getAvatarColor(identifier);
            return (
              <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-1">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={cn(avatarColor.bg, avatarColor.text, "text-xs font-semibold")}>
                      {getAvatarInitials(contactName, phoneNumber)}
                    </AvatarFallback>
                  </Avatar>
                  {conversationStatus === 'active' && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-[2px] border-[var(--wa-panel-header)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[16px] font-medium text-[var(--wa-text-primary)] truncate leading-tight">
                    {contactName || phoneNumber || 'Conversation'}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[12px] text-[var(--wa-text-secondary)] truncate leading-tight">
                      {messageInput.trim() ? (
                        <span className="text-[var(--wa-accent)] italic">typing...</span>
                      ) : (
                        contactName && phoneNumber ? phoneNumber : (phoneNumber || '')
                      )}
                    </p>
                    {conversationStatus === 'ended' ? (
                      <span className="text-[10px] font-medium text-[var(--wa-notice-ended-text)] bg-[var(--wa-notice-ended-bg)] px-1.5 py-0.5 rounded-full leading-none border border-[var(--wa-notice-ended-border)] flex-shrink-0">
                        Ended
                      </span>
                    ) : conversationStatus === 'active' ? (
                      <span className="text-[10px] font-medium text-[var(--wa-notice-ok-text)] bg-[var(--wa-notice-ok-bg)] px-1.5 py-0.5 rounded-full leading-none border border-[var(--wa-notice-ok-border)] flex-shrink-0">
                        Active
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action buttons — icons only on mobile, text on lg+ */}
          <div className="flex items-center flex-shrink-0">
            {/* Desktop: visible text buttons */}
            <div className="hidden lg:flex items-center gap-0.5">
              {conversationStatus === 'active' ? (
                <Button
                  onClick={() => setConfirmAction('close')}
                  disabled={updatingStatus}
                  variant="ghost"
                  size="sm"
                  className="text-[var(--wa-notice-ended-text)] hover:bg-[var(--wa-notice-ended-bg)] text-xs gap-1.5 h-9 px-3 transition-colors duration-200"
                >
                  <CircleCheck className="h-4 w-4" />
                  Close
                </Button>
              ) : conversationStatus === 'ended' ? (
                <Button
                  onClick={() => setConfirmAction('reopen')}
                  disabled={updatingStatus}
                  variant="ghost"
                  size="sm"
                  className="text-[var(--wa-notice-ok-text)] hover:bg-[var(--wa-notice-ok-bg)] text-xs gap-1.5 h-9 px-3 transition-colors duration-200"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reopen
                </Button>
              ) : null}
              {phoneNumber && onMarkUnread && (
                <Button
                  onClick={() => onMarkUnread(phoneNumber)}
                  variant="ghost"
                  size="sm"
                  className="text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 text-xs gap-1.5 h-9 px-3 transition-colors duration-200"
                >
                  <MailOpen className="h-4 w-4" />
                  Unread
                </Button>
              )}
              <Button
                onClick={() => setShowCustomerSidebar(!showCustomerSidebar)}
                variant="ghost"
                className={cn("xl:hidden h-9 px-2.5 text-xs font-medium gap-1.5 transition-colors duration-200 text-amber-500", showCustomerSidebar ? "bg-amber-500/10" : "hover:bg-amber-500/10")}
              >
                <Info className="h-3.5 w-3.5" />
                Info
              </Button>
            </div>

            {/* Mobile/Tablet: icon buttons + overflow menu */}
            <div className="flex lg:hidden items-center">
              <Button
                onClick={() => setShowCustomerSidebar(!showCustomerSidebar)}
                variant="ghost"
                size="icon"
                className={cn("h-9 w-9 transition-colors duration-200 text-amber-500", showCustomerSidebar ? "bg-amber-500/10" : "hover:bg-amber-500/10")}
              >
                <Info className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-[var(--wa-text-tertiary)] hover:text-[var(--wa-text-primary)] h-10 w-10 transition-colors duration-200">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg">
                  {conversationStatus === 'active' ? (
                    <DropdownMenuItem
                      onClick={() => setConfirmAction('close')}
                      disabled={updatingStatus}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 py-2.5"
                    >
                      <CircleCheck className="h-4 w-4 mr-3" />
                      Close conversation
                    </DropdownMenuItem>
                  ) : conversationStatus === 'ended' ? (
                    <DropdownMenuItem
                      onClick={() => setConfirmAction('reopen')}
                      disabled={updatingStatus}
                      className="text-green-600 focus:text-green-600 focus:bg-green-50 py-2.5"
                    >
                      <RotateCcw className="h-4 w-4 mr-3" />
                      Reopen conversation
                    </DropdownMenuItem>
                  ) : null}
                  {phoneNumber && onMarkUnread && (
                    <DropdownMenuItem onClick={() => onMarkUnread(phoneNumber)} className="py-2.5">
                      <MailOpen className="h-4 w-4 mr-3" />
                      Mark as unread
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowMessageSearch(!showMessageSearch)} className="py-2.5">
                    <Search className="h-4 w-4 mr-3" />
                    Search messages
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {showMessageSearch && (
        <div className="border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-bg)] px-3 py-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={messageSearchQuery}
            onChange={(e) => handleMessageSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigateSearch(e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                setShowMessageSearch(false); setMessageSearchQuery(''); setMessageSearchResults([]); setSearchMatchIndex(0);
              }
            }}
            placeholder="Search messages..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)]/50 outline-none"
          />
          {messageSearchQuery && (
            <span className="text-xs text-[var(--wa-text-secondary)] tabular-nums whitespace-nowrap">
              {messageSearchResults.length > 0 ? `${searchMatchIndex + 1} of ${messageSearchResults.length}` : 'No results'}
            </span>
          )}
          {messageSearchResults.length > 1 && (
            <>
              <button onClick={() => navigateSearch('prev')} className="text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] p-0.5">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button onClick={() => navigateSearch('next')} className="text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] p-0.5">
                <ChevronDown className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={() => { setShowMessageSearch(false); setMessageSearchQuery(''); setMessageSearchResults([]); setSearchMatchIndex(0); }}
            className="text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 24-hour messaging window sticky notice */}
      {conversationStatus !== 'ended' && messages.length > 0 && (
        <div className="sticky top-0 z-10">
          {windowInfo.status === 'no-inbound' ? (
            <div className="flex items-center gap-2 px-3 sm:px-4 md:px-[30px] py-2.5 bg-[var(--wa-notice-warn-bg)] backdrop-blur-md border-b border-[var(--wa-notice-warn-border)] shadow-sm group relative">
              <Info className="h-3.5 w-3.5 text-[var(--wa-notice-warn-text)] flex-shrink-0" />
              <p className="text-[11px] text-[var(--wa-notice-warn-text)] leading-snug flex-1 cursor-default">
                <span className="font-medium">No reply from customer yet.</span> Send a template to start.
              </p>
              <button
                onClick={() => setShowTemplateDialog(true)}
                className="text-[10px] font-semibold text-[var(--wa-notice-warn-text)] bg-[var(--wa-notice-warn-btn-bg)] hover:bg-[var(--wa-notice-warn-btn-hover)] px-2.5 py-0.5 rounded-full flex-shrink-0 transition-colors whitespace-nowrap"
              >
                Send Template
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-full left-3 right-3 mt-2 p-3 bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] text-[11px] leading-relaxed rounded-lg shadow-lg z-50 pointer-events-none">
                <p className="font-medium mb-1">WhatsApp 24-Hour Messaging Window</p>
                <p className="text-[var(--wa-tooltip-text)]/80">This customer hasn&apos;t replied yet, so the 24-hour messaging window hasn&apos;t started. You can only send pre-approved template messages until they reply.</p>
                <div className="absolute top-0 left-6 -translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-[var(--wa-tooltip-bg)]" />
              </div>
            </div>
          ) : windowInfo.status === 'expired' ? (
            <div className="flex items-center gap-2 px-3 sm:px-4 md:px-[30px] py-2.5 bg-[var(--wa-notice-warn-bg)] backdrop-blur-md border-b border-[var(--wa-notice-warn-border)] shadow-sm group relative">
              <Info className="h-3.5 w-3.5 text-[var(--wa-notice-warn-text)] flex-shrink-0" />
              <p className="text-[11px] text-[var(--wa-notice-warn-text)] leading-snug flex-1 cursor-default">
                <span className="font-medium">24-hour window expired.</span> Only template messages allowed.
              </p>
              <button
                onClick={() => setShowTemplateDialog(true)}
                className="text-[10px] font-semibold text-[var(--wa-notice-warn-text)] bg-[var(--wa-notice-warn-btn-bg)] hover:bg-[var(--wa-notice-warn-btn-hover)] px-2.5 py-0.5 rounded-full flex-shrink-0 transition-colors whitespace-nowrap"
              >
                Send Template
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-full left-3 right-3 mt-2 p-3 bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] text-[11px] leading-relaxed rounded-lg shadow-lg z-50 pointer-events-none">
                <p className="font-medium mb-1">WhatsApp 24-Hour Messaging Window</p>
                <p className="text-[var(--wa-tooltip-text)]/80">More than 24 hours have passed since this customer&apos;s last reply. Use a template message to re-engage — the window resets when they reply.</p>
                <div className="absolute top-0 left-6 -translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-[var(--wa-tooltip-bg)]" />
              </div>
            </div>
          ) : windowInfo.status === 'expiring-soon' ? (
            <div className="flex items-center gap-2 px-3 sm:px-4 md:px-[30px] py-2.5 bg-[var(--wa-notice-urgent-bg)] backdrop-blur-md border-b border-[var(--wa-notice-urgent-border)] shadow-sm group relative">
              <Info className="h-3.5 w-3.5 text-[var(--wa-notice-urgent-text)] flex-shrink-0" />
              <p className="text-[11px] text-[var(--wa-notice-urgent-text)] leading-snug flex-1 cursor-default">
                <span className="font-medium">Window closing soon.</span> ~{Math.ceil(windowInfo.hoursLeft)}h left.
              </p>
              <button
                onClick={() => setShowTemplateDialog(true)}
                className="text-[10px] font-semibold text-[var(--wa-notice-urgent-text)] bg-[var(--wa-notice-urgent-btn-bg)] hover:bg-[var(--wa-notice-urgent-btn-hover)] px-2.5 py-0.5 rounded-full flex-shrink-0 transition-colors whitespace-nowrap"
              >
                Send Template
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-full left-3 right-3 mt-2 p-3 bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] text-[11px] leading-relaxed rounded-lg shadow-lg z-50 pointer-events-none">
                <p className="font-medium mb-1">WhatsApp 24-Hour Messaging Window</p>
                <p className="text-[var(--wa-tooltip-text)]/80">You have ~{Math.ceil(windowInfo.hoursLeft)} hours left to send free-form messages. After this window closes, only pre-approved template messages can be delivered.</p>
                <div className="absolute top-0 left-6 -translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-[var(--wa-tooltip-bg)]" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 sm:px-4 md:px-[30px] py-2.5 bg-[var(--wa-notice-ok-bg)] backdrop-blur-md border-b border-[var(--wa-notice-ok-border)] shadow-sm group relative">
              <Info className="h-3.5 w-3.5 text-[var(--wa-notice-ok-text)] flex-shrink-0" />
              <p className="text-[11px] text-[var(--wa-notice-ok-text)] leading-snug flex-1 cursor-default">
                <span className="font-medium">24-hour window active.</span> ~{Math.floor(windowInfo.hoursLeft)}h remaining.
              </p>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-full left-3 right-3 mt-2 p-3 bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] text-[11px] leading-relaxed rounded-lg shadow-lg z-50 pointer-events-none">
                <p className="font-medium mb-1">WhatsApp 24-Hour Messaging Window</p>
                <p className="text-[var(--wa-tooltip-text)]/80">The messaging window is open — you can send any message type freely. The window resets each time the customer sends a message.</p>
                <div className="absolute top-0 left-6 -translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-[var(--wa-tooltip-bg)]" />
              </div>
            </div>
          )}
        </div>
      )}

      <ScrollArea ref={messagesContainerRef} className="flex-1 h-0 px-3 py-3 sm:px-4 md:px-[30px]" onClick={onInteraction}>
        <div>
        {/* Load older messages button — shown at top when more sessions exist */}
        {hasOlderSessions && messages.length > 0 && (
          <div className="flex justify-center py-3">
            <Button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 h-8 px-4 text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover-bg)] rounded-full border border-[var(--wa-border)]"
            >
              {loadingOlder ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Load older messages
                </>
              )}
            </Button>
          </div>
        )}
        {messages.length === 0 && loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--wa-text-secondary)]/40 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-[var(--wa-text-secondary)]/40 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-[var(--wa-text-secondary)]/40 animate-bounce" />
            </div>
          </div>
        ) : messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="h-16 w-16 rounded-full bg-[var(--wa-hover)] flex items-center justify-center mb-4">
              <MessageSquare className="h-7 w-7 text-[var(--wa-text-secondary)]" />
            </div>
            <p className="text-sm text-[var(--wa-text-secondary)]">No messages yet</p>
            <p className="text-xs text-[var(--wa-text-secondary)]/60 mt-1">Send a message to start the conversation</p>
          </div>
        ) : (
          (() => {
            // Calculate where to show "X unread messages" divider
            // It goes before the first unread inbound message (counting from end)
            let unreadDividerIndex = -1;
            if (initialUnreadCount > 0) {
              let inboundCount = 0;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].direction === 'inbound') {
                  inboundCount++;
                  if (inboundCount === initialUnreadCount) {
                    unreadDividerIndex = i;
                    break;
                  }
                }
              }
            }
            return messages.map((message, index) => {
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
            const showDateDivider = shouldShowDateDivider(message, prevMessage);
            const showConversationSeparator = message.conversationId &&
              prevMessage?.conversationId &&
              message.conversationId !== prevMessage.conversationId;
            const showFirstConversation = index === 0 && message.conversationId && conversationIds && conversationIds.length > 1;

            // Message grouping: reduce spacing between consecutive same-direction messages
            const isSameDirectionAsPrev = prevMessage?.direction === message.direction && !showDateDivider && !showConversationSeparator && !showFirstConversation;
            const isSameDirectionAsNext = nextMessage?.direction === message.direction;
            const isFirstInGroup = !isSameDirectionAsPrev;
            const isLastInGroup = !isSameDirectionAsNext;

            const sessionStatus = conversationStatuses?.[message.conversationId!];
            const sessionLabel = `Session ${message.conversationId?.slice(0, 8)}`;

            return (
              <div key={message.id}>
                {index === unreadDividerIndex && (
                  <div ref={unreadDividerRef} className="flex items-center gap-2 my-4">
                    <div className="flex-1 border-t border-[#06cf9c]/40" />
                    <span className="text-[12px] text-white bg-[#06cf9c] px-3 py-1 rounded-lg shadow-sm whitespace-nowrap">
                      {initialUnreadCount} unread message{initialUnreadCount !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 border-t border-[#06cf9c]/40" />
                  </div>
                )}
                {showFirstConversation && (
                  <div className="flex items-center gap-2 my-5">
                    <div className="flex-1 border-t border-[var(--wa-border-strong)]/60" />
                    <span className="text-[11px] text-[var(--wa-icon)] bg-[var(--wa-date-pill-bg)] backdrop-blur-sm px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1.5 shadow-sm border border-[var(--wa-border)]">
                      <span className={cn("h-1.5 w-1.5 rounded-full inline-block", sessionStatus === 'active' ? "bg-green-500" : "bg-gray-400")} />
                      {sessionLabel}
                    </span>
                    <div className="flex-1 border-t border-[var(--wa-border-strong)]/60" />
                  </div>
                )}
                {showConversationSeparator && (
                  <div className="flex items-center gap-2 my-5">
                    <div className="flex-1 border-t border-[var(--wa-border-strong)]/60" />
                    <span className="text-[11px] text-[var(--wa-icon)] bg-[var(--wa-date-pill-bg)] backdrop-blur-sm px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1.5 shadow-sm border border-[var(--wa-border)]">
                      <span className={cn("h-1.5 w-1.5 rounded-full inline-block", sessionStatus === 'active' ? "bg-green-500" : "bg-gray-400")} />
                      {sessionLabel}
                    </span>
                    <div className="flex-1 border-t border-[var(--wa-border-strong)]/60" />
                  </div>
                )}
                {showDateDivider && (
                  <div className="flex justify-center my-4">
                    <span className="text-[12px] text-[var(--wa-text-tertiary)] bg-[var(--wa-date-pill-bg)] backdrop-blur-sm px-3 py-1 rounded-lg shadow-sm">
                      {formatDateDivider(message.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  id={`msg-${message.id}`}
                  className={cn(
                    'flex group',
                    isSameDirectionAsPrev ? 'mt-[2px]' : 'mt-2',
                    message.direction === 'outbound' ? 'justify-end pl-[48px] sm:pl-[60px]' : 'justify-start pr-[48px] sm:pr-[60px]'
                  )}
                >
                  {/* Inbound tail */}
                  {message.direction === 'inbound' && isFirstInGroup && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className="flex-shrink-0 -mr-[1px] mt-0 text-[var(--wa-bubble-in)]">
                      <path d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" fill="currentColor" />
                    </svg>
                  )}
                  {message.direction === 'inbound' && !isFirstInGroup && <div className="w-[8px] flex-shrink-0" />}

                  <div
                    className={cn(
                      'relative break-words',
                      message.direction === 'outbound'
                        ? 'bg-[var(--wa-bubble-out)] text-[var(--wa-text-primary)]'
                        : 'bg-[var(--wa-bubble-in)] text-[var(--wa-text-primary)]',
                      isFirstInGroup
                        ? (message.direction === 'outbound' ? 'rounded-[7.5px] rounded-tr-0' : 'rounded-[7.5px] rounded-tl-0')
                        : 'rounded-[7.5px]',
                      'shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                      message.hasMedia || message.metadata?.mediaId ? 'p-[3px] max-w-[330px]' : 'px-[9px] pt-[6px] pb-[8px]',
                      messageSearchQuery && messageSearchResults.some(r => r.id === message.id) && (
                        messageSearchResults[searchMatchIndex]?.id === message.id
                          ? 'ring-2 ring-yellow-400/80 shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                          : 'ring-1 ring-yellow-400/30'
                      )
                    )}
                  >
                    {/* Media rendering — support both direct URLs and mediaId proxy */}
                    {(() => {
                      const md = message.mediaData as Record<string, unknown> | undefined;
                      const mediaUrl = md?.url as string | undefined 
                        || (md?.mediaId ? `/api/media/${md.mediaId}` : undefined)
                        || (message.metadata?.mediaUrl as string | undefined)
                        || (message.metadata?.mediaId ? `/api/media/${message.metadata.mediaId}` : undefined);
                      const hasMediaContent = message.hasMedia && mediaUrl;
                      
                      if (!hasMediaContent) return null;
                      
                      const mediaType = (md?.type as string) || '';
                      
                      return (
                      <div className={cn('overflow-hidden rounded-[5px]', message.content && message.content !== '[Image attached]' || message.caption ? 'mb-[3px]' : '')}>
                        {message.messageType === 'sticker' ? (
                          <LazyImage
                            src={mediaUrl}
                            alt="Sticker"
                            className="max-w-[150px] max-h-[150px] h-auto"
                          />
                        ) : (md?.contentType as string)?.startsWith('image/') || message.messageType === 'image' || mediaType === 'image' ? (
                          <LazyImage
                            src={mediaUrl}
                            alt="Media"
                            className="rounded-[5px] max-w-full h-auto max-h-[250px] object-cover cursor-pointer"
                            onClick={() => setLightboxUrl(mediaUrl)}
                          />
                        ) : (md?.contentType as string)?.startsWith('video/') || message.messageType === 'video' || mediaType === 'video' ? (
                          <video
                            src={mediaUrl}
                            controls
                            className="rounded-[5px] max-w-full h-auto max-h-[250px]"
                          />
                        ) : (md?.contentType as string)?.startsWith('audio/') || message.messageType === 'audio' || mediaType === 'audio' ? (
                          <div className="px-2 pt-2">
                            <audio src={mediaUrl} controls className="w-full max-w-[280px]" />
                          </div>
                        ) : (
                          <div className="px-2 pt-2">
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[var(--wa-green)] hover:underline"
                            >
                              📎 {(md?.filename as string) || message.filename || 'Download file'}
                            </a>
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    {message.caption && (
                      <p className={cn(
                        "text-[14.2px] leading-[19px] break-words overflow-wrap-anywhere whitespace-pre-wrap",
                        (message.hasMedia || message.metadata?.mediaId) && 'px-[6px] pb-[2px]'
                      )}>
                        {highlightText(message.caption, searchHighlight)}
                      </p>
                    )}

                    {/* Template body text (shown below media for template messages with [Image]/[Video]/[Document] prefix) */}
                    {message.messageType === 'template' && message.hasMedia && message.content && (() => {
                      const bodyText = message.content.replace(/^\[(Image|Video|Document)\]\s*\n*/, '');
                      if (!bodyText) return null;
                      return (
                        <p className="text-[14.2px] leading-[19px] break-words overflow-wrap-anywhere whitespace-pre-wrap px-[6px] pb-[2px]">
                          {highlightText(bodyText, searchHighlight)}
                        </p>
                      );
                    })()}

                    {message.content && !message.hasMedia && !(message.metadata?.mediaId && message.messageType) && message.content !== '[Image attached]' && (
                      <p className="text-[14.2px] leading-[19px] break-words overflow-wrap-anywhere whitespace-pre-wrap">
                        {highlightText(message.content, searchHighlight)}
                      </p>
                    )}

                    {/* CTA URL button — WhatsApp-style action button at bottom */}
                    {message.messageType === 'interactive' && (
                      message.metadata?.message_type_data?.type === 'cta_url' ||
                      message.metadata?.interactive?.type === 'cta_url'
                    ) && (
                      <div className="mt-[2px] -mx-[9px] -mb-[8px] border-t border-[var(--wa-border)]">
                        <div className="flex items-center justify-center gap-1.5 py-[7px] text-[var(--wa-green)] text-[14.2px] cursor-default">
                          <Link className="h-4 w-4" />
                          <span>{message.metadata?.interactive?.action?.parameters?.display_text || 'Open Link'}</span>
                        </div>
                      </div>
                    )}

                    {/* Button reply — show selected button label */}
                    {message.messageType === 'interactive' && (
                      message.metadata?.message_type_data?.type === 'button_reply' ||
                      message.metadata?.interactive?.type === 'button_reply'
                    ) && !message.content?.startsWith('Selected:') && (
                      <div className="mt-[2px] -mx-[9px] -mb-[8px] border-t border-[var(--wa-border)]">
                        <div className="flex items-center justify-center gap-1.5 py-[7px] text-[var(--wa-green)] text-[14.2px]">
                          <Zap className="h-3.5 w-3.5" />
                          <span>{(message.metadata?.interactive as Record<string, unknown>)?.button_reply 
                            ? ((message.metadata?.interactive as Record<string, unknown>).button_reply as Record<string, unknown>).title as string 
                            : 'Button Reply'}</span>
                        </div>
                      </div>
                    )}

                    {/* Error notice — shown before timestamp for failed messages */}
                    {message.direction === 'outbound' && message.status === 'failed' && (
                      <div className="flex items-start gap-1.5 mt-1.5 p-2 bg-[var(--wa-notice-ended-bg)] rounded-md border border-[var(--wa-notice-ended-border)]">
                        <Info className="h-3.5 w-3.5 text-[var(--wa-notice-ended-text)] flex-shrink-0 mt-[1px]" />
                        <p className="text-[11px] text-[var(--wa-notice-ended-text)] leading-relaxed">
                          {message.errorDetails?.title ? (
                            <>
                              {message.errorDetails.title}.
                              {message.errorDetails.message && <> {message.errorDetails.message}</>}
                              {message.errorDetails.code && <span className="opacity-70"> (Error #{message.errorDetails.code})</span>}
                            </>
                          ) : (
                            <>Message failed to send. The 24-hour customer service window has closed — more than 24 hours have passed since the customer last replied. Use a template message to re-engage.</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Timestamp + status — inline float for text, overlay for media-only */}
                    {(() => {
                      const isMediaOnly = (message.hasMedia || message.metadata?.mediaId) && (!message.content || message.content === '[Image attached]') && !message.caption;
                      return (
                        <span className={cn(
                          "flex items-center gap-1 text-[11px] leading-none select-none",
                          isMediaOnly
                            ? "absolute bottom-[5px] right-[7px] bg-black/40 text-white/90 px-[5px] py-[3px] rounded-md"
                            : "float-right ml-3 -mb-[5px] mt-[3px] text-[var(--wa-text-secondary)]",
                          (message.hasMedia || message.metadata?.mediaId) && !isMediaOnly && 'px-[6px]'
                        )}>
                          {formatMessageTime(message.createdAt)}
                          {message.direction === 'outbound' && message.status && (
                            message.status === 'failed' ? (
                              <svg viewBox="0 0 16 16" width="16" height="16" className="flex-shrink-0">
                                <circle cx="8" cy="8" r="7" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                                <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            ) : message.status === 'read' ? (
                              <svg viewBox="0 0 16 11" width="16" height="11" className="flex-shrink-0">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.356-.153.591.591 0 0 0-.356.153l-.381.381a.481.481 0 0 0-.127.357c0 .127.051.254.127.33l2.716 2.716a.6.6 0 0 0 .432.178.56.56 0 0 0 .432-.204l6.7-8.271a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#53bdeb" />
                                <path d="M14.757.653a.457.457 0 0 0-.305-.102.493.493 0 0 0-.381.178l-6.19 7.636-0.61-.635.93-1.147 6.19-7.636a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#53bdeb" opacity="0" />
                                <path d="M14.757.653a.457.457 0 0 0-.305-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.356-.153.591.591 0 0 0-.356.153l-.381.381a.481.481 0 0 0-.127.357c0 .127.051.254.127.33l2.716 2.716a.6.6 0 0 0 .432.178.56.56 0 0 0 .432-.204l6.7-8.271a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#53bdeb" />
                              </svg>
                            ) : message.status === 'delivered' ? (
                              <svg viewBox="0 0 16 11" width="16" height="11" className="flex-shrink-0">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.356-.153.591.591 0 0 0-.356.153l-.381.381a.481.481 0 0 0-.127.357c0 .127.051.254.127.33l2.716 2.716a.6.6 0 0 0 .432.178.56.56 0 0 0 .432-.204l6.7-8.271a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#00a884" />
                                <path d="M14.757.653a.457.457 0 0 0-.305-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.356-.153.591.591 0 0 0-.356.153l-.381.381a.481.481 0 0 0-.127.357c0 .127.051.254.127.33l2.716 2.716a.6.6 0 0 0 .432.178.56.56 0 0 0 .432-.204l6.7-8.271a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#00a884" />
                              </svg>
                            ) : message.status === 'sent' ? (
                              <svg viewBox="0 0 12 11" width="12" height="11" className="flex-shrink-0">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.356-.153.591.591 0 0 0-.356.153l-.381.381a.481.481 0 0 0-.127.357c0 .127.051.254.127.33l2.716 2.716a.6.6 0 0 0 .432.178.56.56 0 0 0 .432-.204l6.7-8.271a.592.592 0 0 0 .102-.356.4.4 0 0 0-.102-.305l-.305-.254z" fill="#8696a0" />
                              </svg>
                            ) : message.status === 'sending' ? (
                              <svg viewBox="0 0 16 15" width="16" height="15" className="flex-shrink-0">
                                <path d="M9.75 7.713H8.244V5.359a.5.5 0 0 0-.494-.5.5.5 0 0 0-.494.5v2.947a.5.5 0 0 0 .494.5H9.75a.5.5 0 0 0 .494-.5.5.5 0 0 0-.494-.593z" fill="#8696a0" />
                                <path d="M7.75.25a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zm0 13.5a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="#8696a0" />
                              </svg>
                            ) : null
                          )}
                        </span>
                      );
                    })()}

                  </div>

                  {/* Outbound tail */}
                  {message.direction === 'outbound' && isFirstInGroup && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className="flex-shrink-0 -ml-[1px] mt-0 text-[var(--wa-bubble-out)]">
                      <path d="M6.467 3.568 0 12.193V1h5.188c1.77 0 2.338 1.156 1.279 2.568z" fill="currentColor" />
                    </svg>
                  )}
                  {message.direction === 'outbound' && !isFirstInGroup && <div className="w-[8px] flex-shrink-0" />}

                </div>
              </div>
            );
          });
          })()
        )}
        {/* Workflow execution waiting indicator in chat */}
        {workflowExecution && (workflowExecution.status === 'waiting' || workflowExecution.status === 'handoff') && messages.length > 0 && (
          <div className="flex justify-center py-2 px-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-system-bubble)] rounded-lg shadow-sm">
              <Info className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
              <span className="text-[12px] text-[var(--wa-text-secondary)]">
                {workflowExecution.status === 'handoff' ? 'Workflow handed off to human' : 'Workflow execution is waiting'}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

            {/* Workflow execution banner */}
            {workflowExecution && (
              <div className="px-2 py-2.5 bg-amber-50 dark:bg-amber-950/40">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-1.5 px-2.5 py-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400 truncate">{workflowExecution.workflowName}</span>
                    <span className="text-[11px] text-amber-600/70 dark:text-amber-500/70 flex-shrink-0 ml-auto sm:ml-0">
                      · {workflowExecution.status === 'handoff' ? 'You have control' : workflowExecution.status === 'waiting' ? 'Waiting' : workflowExecution.status === 'paused' ? 'Paused' : 'Running'}
                    </span>
                  </div>
                  {workflowExecution.status === 'handoff' ? (
                    <button
                      onClick={() => handleWorkflowAction('ended')}
                      disabled={workflowActionLoading}
                      className="w-full sm:w-auto text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-full transition-colors flex items-center justify-center gap-1 disabled:opacity-50 flex-shrink-0"
                    >
                      <Play className="h-3 w-3" />
                      Resume Workflow
                    </button>
                  ) : (
                    <button
                      onClick={() => handleWorkflowAction('handoff')}
                      disabled={workflowActionLoading}
                      className="w-full sm:w-auto text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-full transition-colors flex items-center justify-center gap-1 disabled:opacity-50 flex-shrink-0"
                    >
                      <HandMetal className="h-3 w-3" />
                      Take Control
                    </button>
                  )}
                </div>
              </div>
            )}

      <div className="border-t border-[var(--wa-border-strong)] safe-area-bottom">

            <div className="px-[5px] bg-[var(--wa-panel-header)]">
            {selectedFile && (
              <div className="pt-3 pb-0">
                <div className="flex items-center gap-3 p-2.5 bg-[var(--wa-panel-bg)] rounded-lg border border-[var(--wa-border)]">
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="w-12 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-12 h-12 bg-[var(--wa-hover)] rounded flex items-center justify-center flex-shrink-0">
                      <Paperclip className="h-5 w-5 text-[var(--wa-text-secondary)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{selectedFile.name}</p>
                    <p className="text-[11px] text-[var(--wa-text-secondary)]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    onClick={handleRemoveFile}
                    type="button"
                    className="text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] p-1.5 rounded-full hover:bg-[var(--wa-hover)] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {conversationStatus === 'ended' ? (
              <div className="flex items-center min-h-[60px] bg-red-500/10 border-t border-red-500/20 -mx-[5px] px-[5px]">
                <div className="flex-1 flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <CircleCheck className="h-3.5 w-3.5 text-red-400" />
                    </div>
                    <span className="text-[13px] font-medium text-red-400">Conversation ended</span>
                  </div>
                  <button
                    className="text-[12px] font-semibold text-[var(--wa-green)] bg-[var(--wa-green)]/10 hover:bg-[var(--wa-green)]/20 active:bg-[var(--wa-green)]/30 disabled:opacity-50 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors"
                    disabled={updatingStatus}
                    onClick={() => setConfirmAction('reopen')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {updatingStatus ? 'Reopening...' : 'Reopen'}
                  </button>
                </div>
              </div>
            ) : (
              <>
              {rateLimitWarning && (
                <div className="mx-1 mb-1 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-[13px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  ⚠️ Rate limited — message not sent. Please wait a moment and try again.
                </div>
              )}
              <form onSubmit={handleSendMessage} className="py-1.5 sm:py-2 flex gap-1.5 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                />
                <div className="flex-1 min-w-0 flex items-end bg-[var(--wa-input-bg)] rounded-[21px] border-0 outline-none ring-0 focus-within:ring-[var(--wa-green)]/60 focus-within:ring-2 transition-all duration-200">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={sending}
                        className="text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)] h-[44px] w-11 flex items-center justify-center flex-shrink-0 transition-colors duration-200 disabled:opacity-40 rounded-l-[21px]"
                        title="Actions"
                      >
                        <Plus className="h-[22px] w-[22px]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-lg max-h-[60vh] overflow-y-auto">
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="py-2.5">
                        <ImagePlus className="h-4 w-4 mr-3 text-blue-500" />
                        Attach file
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[var(--wa-text-secondary)]">Interactive</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setShowInteractiveDialog(true)} className="py-2.5">
                        <ListTree className="h-4 w-4 mr-3 text-violet-500" />
                        Button message
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowListDialog(true)} className="py-2.5">
                        <List className="h-4 w-4 mr-3 text-violet-500" />
                        List message
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowCtaDialog(true)} className="py-2.5">
                        <Link className="h-4 w-4 mr-3 text-violet-500" />
                        CTA URL message
                      </DropdownMenuItem>
                      {replyTemplates.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[var(--wa-text-secondary)]">Quick Reply</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setShowQuickReplyDialog(true)} className="py-2.5">
                            <MessageSquareQuote className="h-4 w-4 mr-3 text-emerald-500" />
                            Templates
                            <span className="ml-auto text-[10px] text-[var(--wa-text-secondary)]">{replyTemplates.length}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (messageInput.trim() || selectedFile) {
                          handleSendMessage(e);
                        }
                      }
                    }}
                    placeholder="Type a message"
                    disabled={sending}
                    rows={1}
                    className="flex-1 min-w-0 bg-transparent py-[11px] pr-2 text-[15px] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)]/50 resize-none disabled:opacity-50 appearance-none"
                    style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                  />
                  <button
                    type="submit"
                    disabled={sending || (!messageInput.trim() && !selectedFile)}
                    className="bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] active:bg-[var(--wa-green-darker)] text-white rounded-full h-[38px] w-[38px] flex items-center justify-center flex-shrink-0 transition-all duration-200 disabled:opacity-30 disabled:hover:bg-[var(--wa-green)] mr-[3px] mb-[3px]"
                  >
                    <Send className="h-5 w-5 ml-0.5" />
                  </button>
                </div>
              </form>
              </>
            )}
            </div>
      </div>

      <InteractiveMessageDialog
        open={showInteractiveDialog}
        onOpenChange={setShowInteractiveDialog}
        conversationId={conversationIds?.[0]}
        phoneNumber={phoneNumber}
        onMessageSent={fetchMessages}
      />

      <InteractiveListDialog
        open={showListDialog}
        onOpenChange={setShowListDialog}
        phoneNumber={phoneNumber}
        onMessageSent={fetchMessages}
      />

      <CtaUrlDialog
        open={showCtaDialog}
        onOpenChange={setShowCtaDialog}
        phoneNumber={phoneNumber}
        onMessageSent={fetchMessages}
      />

      <TemplateSelectorDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        phoneNumber={phoneNumber ?? ''}
        onTemplateSent={fetchMessages}
      />

      {/* Close / Reopen confirmation dialog */}
      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl">
          {confirmAction === 'close' ? (
            <>
              <DialogHeader>
                <div className="mx-auto h-12 w-12 rounded-full bg-[var(--wa-notice-ended-bg)] flex items-center justify-center mb-2">
                  <CircleCheck className="h-6 w-6 text-[var(--wa-notice-ended-text)]" />
                </div>
                <DialogTitle className="text-center">Close conversation?</DialogTitle>
                <DialogDescription className="text-center">
                  This will mark the conversation with <span className="font-medium text-[var(--wa-text-primary)]">{contactName || phoneNumber}</span> as ended. You can reopen it anytime.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-2 sm:justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                  disabled={updatingStatus}
                  className="flex-1 rounded-full border border-[var(--wa-border-strong)]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleStatusChange('ended')}
                  disabled={updatingStatus}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
                >
                  {updatingStatus ? 'Closing...' : 'Close'}
                </Button>
              </DialogFooter>
            </>
          ) : confirmAction === 'reopen' ? (
            <>
              <DialogHeader>
                <div className="mx-auto h-12 w-12 rounded-full bg-[var(--wa-notice-ok-bg)] flex items-center justify-center mb-2">
                  <RotateCcw className="h-6 w-6 text-[var(--wa-notice-ok-text)]" />
                </div>
                <DialogTitle className="text-center">Reopen conversation?</DialogTitle>
                <DialogDescription className="text-center">
                  This will reactivate the conversation with <span className="font-medium text-[var(--wa-text-primary)]">{contactName || phoneNumber}</span> so you can send messages again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-2 sm:justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmAction(null)}
                  disabled={updatingStatus}
                  className="flex-1 rounded-full border border-[var(--wa-border-strong)]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleStatusChange('active')}
                  disabled={updatingStatus}
                  className="flex-1 bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white rounded-full"
                >
                  {updatingStatus ? 'Reopening...' : 'Reopen'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Quick Reply Dialog */}
      <Dialog open={showQuickReplyDialog} onOpenChange={setShowQuickReplyDialog}>
        <DialogContent className="sm:max-w-[540px] rounded-2xl p-0 gap-0 max-h-[80vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-[var(--wa-border)]">
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <MessageSquareQuote className="h-4.5 w-4.5 text-emerald-500" />
              Quick Reply Templates
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Select a template to insert into your message
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {(() => {
              const grouped = replyTemplates.reduce<Record<string, typeof replyTemplates>>((acc, t) => {
                const cat = t.category || 'General';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(t);
                return acc;
              }, {});
              return Object.entries(grouped).map(([cat, items], gi) => (
                <div key={cat}>
                  {(gi > 0 || Object.keys(grouped).length > 1) && (
                    <div className={cn("px-1 py-1", gi > 0 && "mt-3 pt-2 border-t border-[var(--wa-border)]")}>
                      {(() => {
                        const catLower = cat.toLowerCase();
                        const colors: Record<string, string> = {
                          'bola sepak': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                          'general': 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
                          'marketing': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                          'utility': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                          'authentication': 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                        };
                        const colorClass = colors[catLower] || 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
                        return <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded", colorClass)}>{cat}</span>;
                      })()}
                    </div>
                  )}
                  <div className="space-y-2">
                    {items.map((t) => (
                      <div
                        key={t.id}
                        className="group rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/[0.06] transition-all duration-200 overflow-hidden"
                      >
                        {/* Header with inline action */}
                        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 border-b border-black/5 dark:border-white/5">
                          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <MessageSquareQuote className="h-3.5 w-3.5 text-emerald-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[13px] font-semibold text-[var(--wa-text-primary)] truncate">{t.title}</h4>
                            {(() => {
                              const cat = (t.category || 'General').toLowerCase();
                              const colors: Record<string, string> = {
                                'bola sepak': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                'general': 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
                                'marketing': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                                'utility': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                'authentication': 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                              };
                              const colorClass = colors[cat] || 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
                              return <span className={cn("text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded", colorClass)}>{t.category || 'General'}</span>;
                            })()}
                          </div>
                          <button
                            onClick={() => {
                              setMessageInput(prev => prev ? prev + '\n' + t.body : t.body);
                              setShowQuickReplyDialog(false);
                              requestAnimationFrame(() => {
                                if (textareaRef.current) {
                                  textareaRef.current.style.height = 'auto';
                                  textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
                                  textareaRef.current.focus();
                                }
                              });
                            }}
                            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
                          >
                            <Send className="h-3 w-3" />
                            Use
                          </button>
                        </div>
                        {/* Body */}
                        <div className="px-3.5 py-2.5">
                          <p className="text-[11.5px] text-[var(--wa-text-secondary)] whitespace-pre-wrap leading-[1.6] pl-[38px]">{t.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {phoneNumber && (
        <>
          {/* Overlay sidebar for smaller screens */}
          <div className="xl:hidden">
            <CustomerSidebar
              phoneNumber={phoneNumber}
              open={showCustomerSidebar}
              onClose={() => setShowCustomerSidebar(false)}
              onInsertText={(text) => setMessageInput(prev => prev ? prev + '\n' + text : text)}
            />
          </div>
        </>
      )}
      </div>

      {/* Inline sidebar for desktop (xl+) with resize handle */}
      {phoneNumber && (
        <div className="hidden xl:flex">
          <div
            className="w-0 relative z-10 cursor-col-resize flex items-center justify-center group"
            onMouseDown={handleSidebarResizeStart}
          >
            <div className="absolute inset-y-0 -left-1 -right-1 w-2 flex items-center justify-center hover:bg-[var(--wa-green)]/20 active:bg-[var(--wa-green)]/30 transition-colors">
              <div className="w-[2px] h-8 rounded-full bg-transparent group-hover:bg-[var(--wa-green)]/60 group-active:bg-[var(--wa-green)] transition-colors" />
            </div>
          </div>
          <CustomerSidebar
            phoneNumber={phoneNumber}
            open={true}
            onClose={() => {}}
            inline
            panelWidth={sidebarWidth}
            onInsertText={(text) => setMessageInput(prev => prev ? prev + '\n' + text : text)}
          />
        </div>
      )}
    </div>
  );
});
