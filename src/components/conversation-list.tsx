'use client';

import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback, type ReactNode } from 'react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { Search, X, Moon, Sun, Phone, Globe, MapPin, Mail, Info, CheckCheck, Bell, BellOff, Loader2, Settings, Eye, EyeOff, Save, Plus, Pencil, Trash2, MessageSquareText, CloudDownload, TriangleAlert, RefreshCw, Database, ExternalLink, CalendarDays, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Highlight matching text segments
function highlightMatch(text: string, query: string): ReactNode {
  if (!query || !text) return text;
  // Also match if user typed leading-zero phone (strip leading 0)
  const stripped = query.replace(/^0+/, '');
  const escapedParts = [query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  if (stripped !== query) {
    escapedParts.push(stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  const regex = new RegExp(`(${escapedParts.join('|')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-[var(--wa-green)]/30 text-inherit rounded-sm px-0.5">{part}</mark>
      : part
  );
}

type ProfileData = {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profilePictureUrl?: string;
};

type Conversation = {
  id: string;
  conversationIds: string[];
  conversationStatuses: Record<string, string>;
  phoneNumber: string;
  status: string;
  lastActiveAt: string;
  phoneNumberId: string;
  metadata?: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  totalConversations?: number;
  lastMessage?: {
    content: string;
    direction: string;
    type?: string;
  };
};

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

function formatConversationDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);

    // Within the last hour — show minutes
    if (diffMin < 1) return 'Now';
    if (diffMin < 60) return `${diffMin}m`;
    // Within last 12 hours — show hours
    if (isToday(date) && diffHr < 12) return `${diffHr}h`;
    // Today — show time
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  } catch {
    return '';
  }
}

function getAvatarInitials(contactName?: string, phoneNumber?: string): string {
  if (contactName) {
    const clean = contactName.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    if (words.length === 1 && words[0].length >= 2) {
      return words[0].slice(0, 2).toUpperCase();
    }
  }

  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '');
    return digits.slice(-2);
  }

  return '??';
}

function getMessageTypeIcon(type?: string): string {
  switch (type) {
    case 'image': return '📷 ';
    case 'video': return '📹 ';
    case 'audio': return '🎵 ';
    case 'document': return '📄 ';
    case 'sticker': return '🏷️ ';
    case 'location': return '📍 ';
    case 'contacts': return '👤 ';
    case 'template': return '📋 ';
    default: return '';
  }
}

type Props = {
  onSelectConversation: (conversation: Conversation, searchQuery?: string) => void;
  onConversationsUpdated?: (conversations: Conversation[]) => void;
  selectedConversationId?: string;
  isHidden?: boolean;
  unreadCounts?: Map<string, number>;
  pollInterval?: number;
  notificationEnabled?: boolean;
  notificationPermission?: string;
  onToggleNotification?: () => Promise<void> | void;
  typingPhone?: string | null;
  panelWidth?: number;
};

export type ConversationListRef = {
  refresh: () => Promise<Conversation[]>;
  selectByPhoneNumber: (phoneNumber: string) => void;
  updateConversation: (updated: Conversation) => void;
  updateConversationFromWebhook: (phoneNumber: string, data: {
    conversationId: string;
    status: string;
    lastMessage?: { content: string; direction: string; type?: string };
    contactName?: string;
    lastActiveAt?: string;
  }) => void;
};

const PAGE_SIZE = 50;

export const ConversationList = forwardRef<ConversationListRef, Props>(
  ({ onSelectConversation, onConversationsUpdated, selectedConversationId, isHidden = false, unreadCounts = new Map(), pollInterval = 10000, notificationEnabled = false, notificationPermission = 'default', onToggleNotification, typingPhone, panelWidth }, ref) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSync, setNeedsSync] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const { theme, toggleTheme } = useTheme();
  const prevDataRef = useRef<string>('');
  const onConversationsUpdatedRef = useRef(onConversationsUpdated);
  onConversationsUpdatedRef.current = onConversationsUpdated;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then((data: ProfileData) => setProfile(data))
      .catch(() => {});
  }, []);

  // Tick every 30s to refresh relative timestamps (e.g. "10m" → "11m")
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Server-side search with debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      setSearchPage(1);
      setSearchHasMore(false);
      return;
    }

    setSearching(true);
    setSearchPage(1);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations?search=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data.data ?? []);
        setSearchHasMore(!!data.hasMore);
      } catch {
        setSearchResults([]);
        setSearchHasMore(false);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const loadMoreSearchResults = useCallback(async () => {
    if (loadingMoreSearch || !searchHasMore || !searchQuery.trim()) return;
    setLoadingMoreSearch(true);
    const nextPage = searchPage + 1;
    try {
      const res = await fetch(`/api/conversations?search=${encodeURIComponent(searchQuery.trim())}&page=${nextPage}`);
      const data = await res.json();
      const newResults: Conversation[] = data.data ?? [];
      setSearchResults(prev => {
        const existing = new Set((prev ?? []).map(c => c.phoneNumber));
        const unique = newResults.filter((c: Conversation) => !existing.has(c.phoneNumber));
        return [...(prev ?? []), ...unique];
      });
      setSearchHasMore(!!data.hasMore);
      setSearchPage(nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingMoreSearch(false);
    }
  }, [loadingMoreSearch, searchHasMore, searchQuery, searchPage]);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();

      // API says SQLite needs sync
      if (data.needsSync) {
        // Auto-sync if triggered by force resync, migration, or API indicates resync
        const isForceResync = sessionStorage.getItem('force_resync') === '1';
        sessionStorage.removeItem('force_resync');
        const shouldAutoSync = isForceResync || data.isResync;
        setNeedsSync(true);
        if (shouldAutoSync) setAutoSync(true);
        setLoading(false);
        return;
      }

      const newConversations = data.data || [];
      setHasMore(!!data.hasMore);
      const fingerprint = JSON.stringify(newConversations.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
      if (fingerprint !== prevDataRef.current) {
        prevDataRef.current = fingerprint;
        setConversations(prev => {
          if (prev.length <= PAGE_SIZE) return newConversations;
          // Merge: page 1 from server + keep scrolled-in pages, deduplicate by phone
          const page1Phones = new Set(newConversations.map((c: Conversation) => c.phoneNumber));
          const rest = prev.slice(PAGE_SIZE).filter((c: Conversation) => !page1Phones.has(c.phoneNumber));
          return [...newConversations, ...rest];
        });
        onConversationsUpdatedRef.current?.(newConversations);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // User-triggered sync: fetch all pages from Kapso API
  const startSync = useCallback(async () => {
    setSyncing(true);
    setSyncCount(0);
    try {
      // First page
      const res = await fetch('/api/conversations?sync=true');
      const data = await res.json();
      let allConvs: Conversation[] = data.data || [];
      let hasMorePages = !!data.hasMore;
      setSyncCount(allConvs.length);
      setConversations(allConvs);
      onConversationsUpdatedRef.current?.(allConvs);

      // Fetch remaining pages with delay and retry
      let retries = 0;
      while (hasMorePages) {
        await new Promise(r => setTimeout(r, 500)); // 500ms delay between pages
        try {
          const nextRes = await fetch('/api/conversations?cursor=next');
          if (!nextRes.ok) throw new Error(`HTTP ${nextRes.status}`);
          const nextData = await nextRes.json();
          allConvs = nextData.data || [];
          hasMorePages = !!nextData.hasMore;
          setSyncCount(allConvs.length);
          setConversations(allConvs);
          onConversationsUpdatedRef.current?.(allConvs);
          retries = 0;
        } catch (pageError) {
          retries++;
          if (retries >= 5) throw pageError; // Give up after 5 consecutive failures
          console.warn(`[Sync] Page fetch failed (retry ${retries}/5), waiting...`);
          await new Promise(r => setTimeout(r, 3000 * retries)); // Exponential backoff
        }
      }

      prevDataRef.current = JSON.stringify(allConvs.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
      setHasMore(false);
      setNeedsSync(false);
    } catch (error) {
      console.error('Error syncing conversations:', error);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Auto-start sync when triggered by force resync (not first setup)
  useEffect(() => {
    if (autoSync && needsSync && !syncing) {
      startSync();
    }
  }, [autoSync, needsSync, syncing, startSync]);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      pageRef.current += 1;
      const response = await fetch(`/api/conversations?page=${pageRef.current}`);
      const data = await response.json();
      const newPage: Conversation[] = data.data || [];
      setHasMore(!!data.hasMore);
      if (newPage.length > 0) {
        setConversations(prev => {
          const existingPhones = new Set(prev.map(c => c.phoneNumber));
          const uniqueNew = newPage.filter((c: Conversation) => !existingPhones.has(c.phoneNumber));
          const merged = [...prev, ...uniqueNew];
          prevDataRef.current = JSON.stringify(merged.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
          onConversationsUpdatedRef.current?.(merged);
          return merged;
        });
      }
    } catch (error) {
      console.error('Error loading more conversations:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-polling for conversations (every 30 seconds, uses cache/quick fetch)
  const { isPolling } = useAutoPolling({
    interval: pollInterval,
    enabled: pollInterval > 0,
    onPoll: fetchConversations
  });

  // Prevent closing window during sync
  useEffect(() => {
    if (!syncing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [syncing]);

  const selectByPhoneNumber = (phoneNumber: string) => {
    const conversation = conversations.find(conv => conv.phoneNumber === phoneNumber);
    if (conversation) {
      onSelectConversation(conversation);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      try {
        pageRef.current = 1;
        const response = await fetch('/api/conversations?refresh=true');
        if (!response.ok) return conversations;
        const data = await response.json();
        const newConversations = data.data || [];
        setHasMore(!!data.hasMore);
        prevDataRef.current = JSON.stringify(newConversations.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
        setConversations(newConversations);
        onConversationsUpdatedRef.current?.(newConversations);
        return newConversations;
      } catch {
        return conversations;
      }
    },
    selectByPhoneNumber,
    updateConversation: (updated: Conversation) => {
      setConversations(prev => prev.map(c => c.phoneNumber === updated.phoneNumber ? updated : c));
    },
    updateConversationFromWebhook: (phoneNumber: string, data) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.phoneNumber === phoneNumber);
        if (idx === -1) {
          // Contact not in current list — add to top with webhook data
          const newConv: Conversation = {
            id: data.conversationId,
            conversationIds: [data.conversationId],
            conversationStatuses: { [data.conversationId]: data.status },
            phoneNumber,
            status: data.status || 'active',
            lastActiveAt: data.lastActiveAt || new Date().toISOString(),
            phoneNumberId: '',
            contactName: data.contactName || phoneNumber,
            lastMessage: data.lastMessage,
            totalConversations: 1,
          };
          return [newConv, ...prev];
        }
        const existing = prev[idx];
        const updatedStatuses = { ...existing.conversationStatuses, [data.conversationId]: data.status };
        const updatedIds = existing.conversationIds.includes(data.conversationId)
          ? existing.conversationIds
          : [data.conversationId, ...existing.conversationIds];
        const overallStatus = Object.values(updatedStatuses).some(s => s === 'active') ? 'active' : 'ended';
        const updated: Conversation = {
          ...existing,
          conversationIds: updatedIds,
          conversationStatuses: updatedStatuses,
          status: overallStatus,
          ...(data.contactName && { contactName: data.contactName }),
          ...(data.lastMessage && { lastMessage: data.lastMessage }),
          ...(data.lastActiveAt && { lastActiveAt: data.lastActiveAt }),
        };
        const next = [...prev];
        next[idx] = updated;
        // Re-sort by lastActiveAt (move updated to top)
        next.sort((a, b) => {
          if (!a.lastActiveAt) return 1;
          if (!b.lastActiveAt) return -1;
          return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
        });
        return next;
      });
    }
  }));

  // Infinite scroll: observe sentinel element at bottom of list (disabled for unread tab and during search)
  useEffect(() => {
    if (activeTab === 'unread' || searchQuery) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreConversations();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreConversations, activeTab, searchQuery]);

  // When searching, use server-side results; otherwise filter locally
  const filteredConversations = searchResults !== null
    ? searchResults.filter(conv => {
        const matchesTab = activeTab === 'all' || (activeTab === 'unread' && unreadCounts.has(conv.phoneNumber));
        return matchesTab;
      })
    : conversations.filter((conv) => {
        const matchesTab = activeTab === 'all' || (activeTab === 'unread' && unreadCounts.has(conv.phoneNumber));
        return matchesTab;
      });

  const unreadCount = conversations.filter(c => unreadCounts.has(c.phoneNumber)).length;

  // Detect unread conversations that aren't in loaded pages yet
  const loadedPhoneNumbers = new Set(conversations.map(c => c.phoneNumber));
  const hasUnloadedUnread = activeTab === 'unread' && Array.from(unreadCounts.keys()).some(
    (phone) => !loadedPhoneNumbers.has(phone)
  );

  if (loading) {
    return (
      <div
        className={cn(
          "w-full md:flex-shrink-0 md:border-r md:border-[var(--wa-border-strong)] bg-[var(--wa-panel-bg)] flex flex-col panel-slide",
          isHidden ? "panel-slide-left" : "panel-slide-center",
          panelWidth ? "panel-resizable" : "md:w-96"
        )}
        style={panelWidth ? { ['--panel-w' as string]: `${panelWidth}px` } : undefined}
      >
        <div className="px-4 pt-5 pb-3 border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)]">
          <div className="safe-area-top" />
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="flex-1 py-1">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex gap-3 px-3 py-4 items-center">
              <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sync screen — shown when syncing conversations from Kapso API
  if (needsSync || syncing) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--wa-panel-bg)] flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm px-8">
          {syncing || autoSync ? (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-[var(--wa-green)]/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[var(--wa-green)] animate-spin" />
              </div>
              <div>
                <p className="text-[17px] font-semibold text-[var(--wa-text-primary)]">Syncing conversations...</p>
                <p className="text-[14px] text-[var(--wa-text-secondary)] mt-2">{syncCount > 0 ? `${syncCount} contacts loaded` : 'Starting sync...'}</p>
              </div>
              <div className="w-full bg-[var(--wa-border)] rounded-full h-1.5 overflow-hidden">
                <div className="bg-[var(--wa-green)] h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <TriangleAlert className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-[13px] text-red-400 text-left">Do not close this window until sync is complete.</p>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-[var(--wa-green)]/10 flex items-center justify-center">
                <CloudDownload className="h-8 w-8 text-[var(--wa-green)]" />
              </div>
              <div>
                <p className="text-[17px] font-semibold text-[var(--wa-text-primary)]">Sync your conversations</p>
                <p className="text-[14px] text-[var(--wa-text-secondary)] mt-2">
                  Load your conversation history from WhatsApp Cloud API. This only needs to happen once.
                </p>
              </div>
              <button
                onClick={startSync}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[var(--wa-green)] text-white text-[15px] font-medium hover:bg-[var(--wa-green)]/90 transition-colors"
              >
                <CloudDownload className="h-5 w-5" />
                Sync Now
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full md:flex-shrink-0 md:border-r md:border-[var(--wa-border-strong)] bg-[var(--wa-panel-bg)] flex flex-col panel-slide",
        isHidden ? "panel-slide-left" : "panel-slide-center",
        panelWidth ? "panel-resizable" : "md:w-96"
      )}
      style={panelWidth ? { ['--panel-w' as string]: `${panelWidth}px` } : undefined}
    >
      <div className="px-4 pt-5 pb-3 border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)]">
        <div className="safe-area-top" />
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setShowProfile(true)}
            className="group flex items-center gap-3 flex-1 min-w-0 rounded-xl px-2 py-1.5 -mx-2 -my-1.5 hover:bg-[var(--wa-green)]/[0.06] active:bg-[var(--wa-green)]/10 transition-all duration-200"
            title="View business profile"
          >
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--wa-green)]/40 animate-ping" style={{ animationDuration: '2.5s' }} />
              <Avatar className="h-10 w-10 ring-2 ring-[var(--wa-green)]/30 group-hover:ring-[var(--wa-green)]/50 transition-all">
                {profile?.profilePictureUrl && <AvatarImage src={profile.profilePictureUrl} alt="Business" />}
                <AvatarFallback className="bg-[var(--wa-green)] text-white text-xs font-semibold">
                  {profile?.verifiedName ? profile.verifiedName.slice(0, 2).toUpperCase() : 'WA'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-[var(--wa-panel-header)]" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[14px] font-bold text-[var(--wa-text-primary)] leading-tight truncate">
                  {profile?.verifiedName || profile?.displayPhoneNumber || 'Support Inbox'}
                </h1>
                {isPolling && (
                  <div
                    className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"
                    title="Auto-updating"
                  />
                )}
              </div>
              <p className="text-[12px] text-[var(--wa-text-secondary)] truncate leading-tight mt-0.5">
                Support Inbox
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--wa-text-secondary)]/40 group-hover:text-[var(--wa-text-secondary)] transition-colors flex-shrink-0" />
          </button>
          <div className="flex items-center flex-shrink-0">
            <div className="relative group">
              <Button
                onClick={() => setShowPushDialog(true)}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-9",
                  notificationEnabled
                    ? "text-[var(--wa-green)] hover:bg-[var(--wa-green)]/10"
                    : "text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border-strong)]/30"
                )}
              >
                {notificationEnabled ? <Bell className="h-[18px] w-[18px]" /> : <BellOff className="h-[18px] w-[18px]" />}
              </Button>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 text-[11px] rounded-md bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                {notificationPermission === 'denied'
                  ? 'Blocked — enable in browser settings'
                  : notificationEnabled
                    ? 'Disable notifications'
                    : 'Enable notifications'}
              </span>
            </div>
            <div className="relative group">
              <Button
                onClick={toggleTheme}
                variant="ghost"
                size="icon"
                className="text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border-strong)]/30 h-9 w-9"
              >
                {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </Button>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 text-[11px] rounded-md bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            </div>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--wa-text-secondary)]" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="pl-9 pr-9 bg-[var(--wa-search-bg)] border-[var(--wa-border-strong)] focus-visible:ring-0 focus-visible:border-[var(--wa-green)]/50 rounded-lg h-9 text-[13px] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)]">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            "text-[13px] font-medium px-3 py-1 rounded-full transition-colors",
            activeTab === 'all'
              ? "bg-[var(--wa-green)] text-white"
              : "bg-[var(--wa-hover)] text-[var(--wa-text-tertiary)] hover:bg-[var(--wa-active)]"
          )}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={cn(
            "text-[13px] font-medium px-3 py-1 rounded-full transition-colors flex items-center gap-1.5",
            activeTab === 'unread'
              ? "bg-[var(--wa-green)] text-white"
              : "bg-[var(--wa-hover)] text-[var(--wa-text-tertiary)] hover:bg-[var(--wa-active)]"
          )}
        >
          Unread
          {unreadCount > 0 && (
            <span className={cn(
              "text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full leading-none",
              activeTab === 'unread'
                ? "bg-white/25 text-white"
                : "bg-[var(--wa-green)] text-white"
            )}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <ScrollArea className="flex-1 h-0 overflow-hidden">
        {searching ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="h-16 w-16 rounded-full bg-[var(--wa-hover)] flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-[var(--wa-text-secondary)]" />
            </div>
            <p className="text-[var(--wa-text-secondary)] text-sm">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </p>
            {searchQuery && (
              <p className="text-[var(--wa-text-secondary)]/60 text-xs mt-1">Try a different search term</p>
            )}
          </div>
        ) : (
          <div className="w-full overflow-hidden">
          {filteredConversations.map((conversation) => {
            const msgCount = unreadCounts.get(conversation.phoneNumber) ?? 0;
            const isUnread = msgCount > 0;
            const identifier = conversation.contactName || conversation.phoneNumber;
            const avatarColor = getAvatarColor(identifier);
            return (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation, searchQuery || undefined)}
              className={cn(
                'w-full px-3 py-4 md:py-3 border-b border-[var(--wa-border)] hover:bg-[var(--wa-hover)] active:bg-[var(--wa-active)] text-left transition-colors relative overflow-hidden',
                selectedConversationId === conversation.phoneNumber && 'bg-[var(--wa-selected)]'
              )}
            >
              <div className="flex gap-3 items-center overflow-hidden">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className={cn(avatarColor.bg, avatarColor.text, "text-sm font-semibold")}>
                      {getAvatarInitials(conversation.contactName, conversation.phoneNumber)}
                    </AvatarFallback>
                  </Avatar>
                  {conversation.status === 'active' && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-[var(--wa-panel-bg)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className={cn("text-[15px] text-[var(--wa-text-primary)] truncate", isUnread ? "font-bold" : "font-normal")}>
                      {searchQuery
                        ? highlightMatch(conversation.contactName || conversation.phoneNumber, searchQuery)
                        : (conversation.contactName || conversation.phoneNumber)}
                    </p>
                    {/* Show phone number below name during search if contact has a name */}
                    {searchQuery && conversation.contactName && (
                      <span className="text-[11px] text-[var(--wa-text-secondary)] truncate">
                        {highlightMatch(conversation.phoneNumber, searchQuery)}
                      </span>
                    )}
                    <span className={cn("text-[12px] flex-shrink-0", isUnread ? "text-[var(--wa-green)] font-semibold" : "text-[var(--wa-text-secondary)]")}>
                      {formatConversationDate(conversation.lastActiveAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <p className={cn("text-[13px] truncate flex-1", isUnread ? "text-[var(--wa-text-primary)] font-medium" : "text-[var(--wa-text-secondary)]")}>
                      {typingPhone === conversation.phoneNumber ? (
                        <span className="text-[var(--wa-green)] italic font-bold">typing...</span>
                      ) : conversation.lastMessage ? (
                        <>
                          {conversation.lastMessage.direction === 'outbound' && (
                            <CheckCheck className="inline h-[15px] w-[15px] text-[var(--wa-read-check)] align-text-bottom mr-0.5" />
                          )}
                          {getMessageTypeIcon(conversation.lastMessage.type)}
                          {searchQuery
                            ? highlightMatch(conversation.lastMessage.content, searchQuery)
                            : conversation.lastMessage.content}
                        </>
                      ) : (
                        <span className="italic">No messages</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isUnread && (
                        <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--wa-green)] flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white leading-none">{msgCount}</span>
                        </span>
                      )}
                      {conversation.status === 'ended' && (
                        <span className="text-[10px] font-medium text-[var(--wa-notice-ended-text)] bg-[var(--wa-notice-ended-bg)] px-1.5 py-0.5 rounded-full leading-none border border-[var(--wa-notice-ended-border)]">
                          Ended
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </button>
            );
          })}
          </div>
        )}

        {/* Hint for unloaded unread conversations */}
        {hasUnloadedUnread && (
          <div className="px-4 py-3 text-center">
            <p className="text-[12px] text-[var(--wa-text-secondary)]/70 italic">
              Some unread conversations may not be loaded yet
            </p>
          </div>
        )}

        {/* Sentinel for infinite scroll */}
        {activeTab !== 'unread' && !searchQuery && <div ref={sentinelRef} className="h-1" />}
        {loadingMore && activeTab !== 'unread' && !searchQuery && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
          </div>
        )}

        {/* Search pagination */}
        {searchQuery && searchHasMore && (
          <div className="flex justify-center py-3">
            {loadingMoreSearch ? (
              <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
            ) : (
              <button
                onClick={loadMoreSearchResults}
                className="text-[12px] text-[var(--wa-green)] hover:underline"
              >
                Load more results
              </button>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Bottom action bar */}
      <div className="flex items-center border-t border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)] flex-shrink-0 safe-area-bottom divide-x divide-[var(--wa-border-strong)]">
        <button
          onClick={() => setShowQuickReply(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 sm:pt-[14px] sm:pb-[13px] text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
        >
          <MessageSquareText className="h-4 w-4" />
          <span className="text-[10px]">Quick Reply</span>
        </button>
        <button
          onClick={() => window.open('/ppv-schedule', '_blank')}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 sm:pt-[14px] sm:pb-[13px] text-emerald-500 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        >
          <CalendarDays className="h-4 w-4" />
          <span className="text-[10px]">PPV Schedule</span>
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 sm:pt-[14px] sm:pb-[13px] text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span className="text-[10px]">Settings</span>
        </button>
      </div>

      {/* Quick Reply Dialog */}
      <Dialog open={showQuickReply} onOpenChange={setShowQuickReply}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Quick Reply</DialogTitle>
            <DialogDescription className="sr-only">Manage quick reply templates</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            <ReplyTemplatesTab onClose={() => setShowQuickReply(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Business Profile Modal */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl p-0 overflow-hidden">
          {/* Header with avatar */}
          <div className="bg-[var(--wa-green)] px-6 pt-8 pb-6 text-center">
            <Avatar className="h-20 w-20 mx-auto mb-3 ring-4 ring-white/20">
              {profile?.profilePictureUrl && <AvatarImage src={profile.profilePictureUrl} alt="Business" />}
              <AvatarFallback className="bg-white/20 text-white text-2xl font-semibold">
                {profile?.verifiedName ? profile.verifiedName.slice(0, 2).toUpperCase() : 'WA'}
              </AvatarFallback>
            </Avatar>
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-semibold">
                {profile?.verifiedName || 'Business Account'}
              </DialogTitle>
              <DialogDescription className="sr-only">Business profile details</DialogDescription>
            </DialogHeader>
            {profile?.displayPhoneNumber && (
              <p className="text-white/80 text-sm mt-1">{profile.displayPhoneNumber}</p>
            )}
          </div>

          {/* Details */}
          <div className="px-6 py-4 space-y-3">
            {profile?.about && (
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">About</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)]">{profile.about}</p>
                </div>
              </div>
            )}

            {profile?.displayPhoneNumber && (
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Phone</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)]">{profile.displayPhoneNumber}</p>
                </div>
              </div>
            )}

            {profile?.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Address</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)]">{profile.address}</p>
                </div>
              </div>
            )}

            {profile?.email && (
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Email</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)]">{profile.email}</p>
                </div>
              </div>
            )}

            {profile?.websites && profile.websites.length > 0 && (
              <div className="flex items-start gap-3">
                <Globe className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Website</p>
                  {profile.websites.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-[var(--wa-green)] hover:underline block">
                      {url}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {profile?.description && (
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Description</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)]">{profile.description}</p>
                </div>
              </div>
            )}

            {profile?.vertical && (
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-[var(--wa-text-secondary)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] uppercase tracking-wide font-medium">Category</p>
                  <p className="text-[14px] text-[var(--wa-text-primary)] capitalize">{profile.vertical}</p>
                </div>
              </div>
            )}

            {profile?.phoneNumberId && (
              <div className="pt-2 border-t border-[var(--wa-border)]">
                <p className="text-[11px] text-[var(--wa-text-secondary)]">
                  Phone Number ID: <span className="font-mono">{profile.phoneNumberId}</span>
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Push Notification Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <div className="mx-auto h-12 w-12 rounded-full bg-[var(--wa-green)]/10 flex items-center justify-center mb-2">
              {notificationEnabled
                ? <BellOff className="h-6 w-6 text-[var(--wa-text-secondary)]" />
                : <Bell className="h-6 w-6 text-[var(--wa-green)]" />
              }
            </div>
            <DialogTitle className="text-center">
              {notificationEnabled ? 'Disable notifications?' : 'Enable notifications?'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {notificationEnabled
                ? 'You will no longer receive push notifications for new messages.'
                : 'Get notified when new messages arrive, even when the browser tab is closed or minimized.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => setShowPushDialog(false)}
              className="flex-1 rounded-full border border-[var(--wa-border-strong)]"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setShowPushDialog(false);
                await onToggleNotification?.();
              }}
              className={cn(
                "flex-1 rounded-full text-white",
                notificationEnabled
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)]"
              )}
            >
              {notificationEnabled ? 'Disable' : 'Enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">Settings</DialogTitle>
            <DialogDescription className="sr-only">App settings and configuration</DialogDescription>
          </DialogHeader>
          <SettingsDialog onClose={() => setShowSettings(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
});

ConversationList.displayName = 'ConversationList';

type ReplyTemplate = {
  id: string;
  title: string;
  category: string;
  body: string;
  created_at: string;
};

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'bcl' | 'data'>('bcl');

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex border-b border-[var(--wa-border)] mb-4">
        <button
          onClick={() => setTab('bcl')}
          className={cn(
            "flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === 'bcl'
              ? "border-[var(--wa-green)] text-[var(--wa-green)]"
              : "border-transparent text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
          )}
        >
          BCL API
        </button>
        <button
          onClick={() => setTab('data')}
          className={cn(
            "flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === 'data'
              ? "border-[var(--wa-green)] text-[var(--wa-green)]"
              : "border-transparent text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
          )}
        >
          Data
        </button>
      </div>
      {tab === 'bcl' ? <BclSettingsTab onClose={onClose} /> : <DataTab />}
    </div>
  );
}

function BclSettingsTab({ onClose }: { onClose: () => void }) {
  const [bclKey, setBclKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [appPassword, setAdminSecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [appPasswordConfigured, setAdminConfigured] = useState(true);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setMaskedKey(data.bcl_api_key || '');
        setAdminConfigured(data.app_password_configured !== false);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-app-password': appPassword,
        },
        body: JSON.stringify({ bcl_api_key: bclKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Failed to save', error: true });
      } else {
        setMaskedKey(data.bcl_api_key || '');
        setBclKey('');
        setAdminSecret('');
        setMessage({ text: 'BCL API key saved successfully' });
        setTimeout(() => onClose(), 1500);
      }
    } catch {
      setMessage({ text: 'Network error', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">
          BCL API Key
        </label>
        {maskedKey && (
          <p className="text-xs text-[var(--wa-text-secondary)] mt-1 font-mono bg-[var(--wa-hover)] px-2 py-1.5 rounded">
            Current: {maskedKey}
          </p>
        )}
        <div className="relative mt-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={bclKey}
            onChange={(e) => setBclKey(e.target.value)}
            placeholder="Enter new BCL API key"
            className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!appPasswordConfigured && (
        <p className="text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
          ⚠ Set <code className="font-mono bg-[var(--wa-hover)] px-1 rounded">APP_PASSWORD</code> in your environment to enable settings updates.
        </p>
      )}

      {appPasswordConfigured && (
        <div>
          <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">
            App Password
          </label>
          <div className="relative mt-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              value={appPassword}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Enter app password to confirm"
              className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={cn("text-xs px-3 py-2 rounded-lg", message.error ? "text-red-400 bg-red-500/10" : "text-green-400 bg-green-500/10")}>
          {message.text}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} className="text-sm">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !bclKey || (!appPassword && appPasswordConfigured)}
          className="bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white text-sm gap-1.5"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}

function ReplyTemplatesTab({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ReplyTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/reply-templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const resetForm = () => {
    setTitle('');
    setCategory('');
    setBody('');
    setEditingTemplate(null);
    setShowForm(false);
    setMessage(null);
  };

  const openEdit = (t: ReplyTemplate) => {
    setEditingTemplate(t);
    setTitle(t.title);
    setCategory(t.category);
    setBody(t.body);
    setShowForm(true);
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const isEdit = !!editingTemplate;
      const res = await fetch('/api/reply-templates', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(isEdit && { id: editingTemplate.id }),
          title,
          category: category || 'General',
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Failed to save', error: true });
      } else {
        setMessage({ text: isEdit ? 'Template updated' : 'Template created' });
        await fetchTemplates();
        setTimeout(resetForm, 800);
      }
    } catch {
      setMessage({ text: 'Network error', error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      const res = await fetch(`/api/reply-templates?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchTemplates();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch {
      alert('Network error');
    }
  };

  // Group templates by category
  const grouped = templates.reduce<Record<string, ReplyTemplate[]>>((acc, t) => {
    const cat = t.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[var(--wa-text-primary)]">
          {editingTemplate ? 'Edit Template' : 'New Template'}
        </h4>
        <div>
          <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Greeting"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Greeting, Payment, Support"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Message Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type the reply template message..."
            rows={4}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50 resize-none"
          />
        </div>
        {message && (
          <p className={cn("text-xs px-3 py-2 rounded-lg", message.error ? "text-red-400 bg-red-500/10" : "text-green-400 bg-green-500/10")}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={resetForm} className="text-sm">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || !body.trim()}
            className="bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white text-sm gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingTemplate ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 flex flex-col min-h-0">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--wa-text-secondary)]">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
        <Button
          onClick={() => { setShowForm(true); setEditingTemplate(null); }}
          className="bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white text-xs h-8 px-3 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquareText className="h-8 w-8 mx-auto text-[var(--wa-text-secondary)]/40 mb-2" />
          <p className="text-sm text-[var(--wa-text-secondary)]">No reply templates yet</p>
          <p className="text-xs text-[var(--wa-text-secondary)]/60 mt-1">Add templates for quick CS replies</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[40vh] -mx-1 px-1">
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <h5 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-1.5">{cat}</h5>
                <div className="space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="group p-2.5 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-hover)] hover:border-[var(--wa-green)]/30 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[var(--wa-text-primary)] truncate">{t.title}</p>
                          <p className="text-[11px] text-[var(--wa-text-secondary)] mt-0.5 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => openEdit(t)}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-panel-bg)] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="flex justify-end pt-1">
        <Button variant="ghost" onClick={onClose} className="text-sm">Close</Button>
      </div>
    </div>
  );
}

function DataTab() {
  const [syncing, setSyncing] = useState(false);
  const [dbStats, setDbStats] = useState<{ conversations: number; messages: number; contacts: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/db-status')
      .then(r => r.json())
      .then(data => setDbStats({ conversations: data.conversations, messages: data.messages, contacts: data.contacts }))
      .catch(() => {});
  }, []);

  const handleResync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/conversations', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: data.message || 'Resync triggered successfully' });
        sessionStorage.setItem('force_resync', '1');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMessage({ text: data.error || 'Failed to resync', error: true });
      }
    } catch {
      setMessage({ text: 'Network error', error: true });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {dbStats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Conversations', value: dbStats.conversations },
            { label: 'Messages', value: dbStats.messages },
            { label: 'Contacts', value: dbStats.contacts },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[var(--wa-hover)] rounded-lg p-3 text-center">
              <p className="text-lg font-semibold text-[var(--wa-text-primary)]">{value.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--wa-text-secondary)] uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--wa-hover)] rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Database className="h-5 w-5 text-[var(--wa-text-secondary)] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-[var(--wa-text-primary)]">Force Resync</h3>
            <p className="text-xs text-[var(--wa-text-secondary)] mt-1 leading-relaxed">
              Re-fetch all conversations from Kapso API. Existing messages are kept — only conversation metadata (status, timestamps, contacts) is refreshed.
            </p>
          </div>
        </div>
        <Button
          onClick={handleResync}
          disabled={syncing}
          className="w-full bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white text-sm gap-2"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? 'Resyncing...' : 'Resync All Conversations'}
        </Button>
      </div>

      <div className="bg-[var(--wa-hover)] rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ExternalLink className="h-5 w-5 text-[var(--wa-text-secondary)] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-[var(--wa-text-primary)]">Database Viewer</h3>
            <p className="text-xs text-[var(--wa-text-secondary)] mt-1 leading-relaxed">
              Browse SQLite tables, search data, and inspect rows. Generates a temporary token (4h) for secure access.
            </p>
          </div>
        </div>
        <Button
          onClick={async () => {
            try {
              const res = await fetch('/api/admin/db-token', { method: 'POST' });
              const data = await res.json();
              if (data.token) {
                window.open(`/admin/db?token=${data.token}`, '_blank');
              }
            } catch { /* ignore */ }
          }}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm gap-2"
        >
          <Database className="h-4 w-4" />
          Open Database Viewer
        </Button>
      </div>

      {message && (
        <p className={cn("text-xs px-3 py-2 rounded-lg", message.error ? "text-red-400 bg-red-500/10" : "text-green-400 bg-green-500/10")}>
          {message.text}
        </p>
      )}
    </div>
  );
}

