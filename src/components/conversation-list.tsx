'use client';

import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { Search, X, Moon, Sun, Phone, Globe, MapPin, Mail, Info, CheckCheck, Bell, BellOff, Loader2, Settings, Eye, EyeOff, Save } from 'lucide-react';
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
  onSelectConversation: (conversation: Conversation) => void;
  onConversationsUpdated?: (conversations: Conversation[]) => void;
  selectedConversationId?: string;
  isHidden?: boolean;
  unreadCounts?: Map<string, number>;
  pollInterval?: number;
  notificationEnabled?: boolean;
  notificationPermission?: string;
  onToggleNotification?: () => Promise<void> | void;
};

export type ConversationListRef = {
  refresh: () => Promise<Conversation[]>;
  selectByPhoneNumber: (phoneNumber: string) => void;
  updateConversation: (updated: Conversation) => void;
};

export const ConversationList = forwardRef<ConversationListRef, Props>(
  ({ onSelectConversation, onConversationsUpdated, selectedConversationId, isHidden = false, unreadCounts = new Map(), pollInterval = 10000, notificationEnabled = false, notificationPermission = 'default', onToggleNotification }, ref) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      const newConversations = data.data || [];
      setHasMore(!!data.hasMore);
      // Only update state if data actually changed to avoid scroll reset
      const fingerprint = JSON.stringify(newConversations.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
      if (fingerprint !== prevDataRef.current) {
        prevDataRef.current = fingerprint;
        setConversations(newConversations);
        onConversationsUpdatedRef.current?.(newConversations);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch('/api/conversations?cursor=next');
      const data = await response.json();
      const allConversations: Conversation[] = data.data || [];
      setHasMore(!!data.hasMore);
      if (allConversations.length > 0) {
        prevDataRef.current = JSON.stringify(allConversations.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
        setConversations(allConversations);
        onConversationsUpdatedRef.current?.(allConversations);
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
    enabled: true,
    onPoll: fetchConversations
  });

  const selectByPhoneNumber = (phoneNumber: string) => {
    const conversation = conversations.find(conv => conv.phoneNumber === phoneNumber);
    if (conversation) {
      onSelectConversation(conversation);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      try {
        const response = await fetch('/api/conversations?refresh=true');
        if (!response.ok) return conversations;
        const data = await response.json();
        const newConversations = data.data || [];
        setHasMore(!!data.hasMore);
        prevDataRef.current = JSON.stringify(newConversations.map((c: Conversation) => c.id + c.status + c.lastActiveAt + (c.lastMessage?.content || '')));
        setConversations(newConversations);
        return newConversations;
      } catch {
        return conversations;
      }
    },
    selectByPhoneNumber,
    updateConversation: (updated: Conversation) => {
      setConversations(prev => prev.map(c => c.phoneNumber === updated.phoneNumber ? updated : c));
    }
  }));

  // Infinite scroll: observe sentinel element at bottom of list (disabled for unread tab)
  useEffect(() => {
    if (activeTab === 'unread') return;
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
  }, [hasMore, loadingMore, loadMoreConversations, activeTab]);

  const filteredConversations = conversations.filter((conv) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = conv.phoneNumber.toLowerCase().includes(query) ||
      conv.contactName?.toLowerCase().includes(query) ||
      // Also search within last message content
      conv.lastMessage?.content?.toLowerCase().includes(query);
    const matchesTab = activeTab === 'all' || (activeTab === 'unread' && unreadCounts.has(conv.phoneNumber));
    return matchesSearch && matchesTab;
  });

  const unreadCount = conversations.filter(c => unreadCounts.has(c.phoneNumber)).length;

  // Detect unread conversations that aren't in loaded pages yet
  const loadedPhoneNumbers = new Set(conversations.map(c => c.phoneNumber));
  const hasUnloadedUnread = activeTab === 'unread' && Array.from(unreadCounts.keys()).some(
    (phone) => !loadedPhoneNumbers.has(phone)
  );

  if (loading) {
    return (
      <div className={cn(
        "w-full md:w-96 md:border-r border-[var(--wa-border-strong)] bg-[var(--wa-panel-bg)] flex flex-col panel-slide",
        isHidden ? "panel-slide-left" : "panel-slide-center"
      )}>
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

  return (
    <div className={cn(
      "w-full md:w-96 md:border-r border-[var(--wa-border-strong)] bg-[var(--wa-panel-bg)] flex flex-col panel-slide",
      isHidden ? "panel-slide-left" : "panel-slide-center"
    )}>
      <div className="px-4 pt-5 pb-3 border-b border-[var(--wa-border-strong)] bg-[var(--wa-panel-header)]">
        <div className="safe-area-top" />
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setShowProfile(true)}
            className="flex-shrink-0 rounded-full ring-2 ring-transparent hover:ring-[var(--wa-green)]/40 transition-all"
            title="View business profile"
          >
            <Avatar className="h-10 w-10">
              {profile?.profilePictureUrl && <AvatarImage src={profile.profilePictureUrl} alt="Business" />}
              <AvatarFallback className="bg-[var(--wa-green)] text-white text-xs font-semibold">
                {profile?.verifiedName ? profile.verifiedName.slice(0, 2).toUpperCase() : 'WA'}
              </AvatarFallback>
            </Avatar>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-[16px] font-bold text-[var(--wa-text-primary)] leading-tight truncate">
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
            <div className="relative group">
              <Button
                onClick={() => setShowSettings(true)}
                variant="ghost"
                size="icon"
                className="text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border-strong)]/30 h-9 w-9"
              >
                <Settings className="h-[18px] w-[18px]" />
              </Button>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 text-[11px] rounded-md bg-[var(--wa-tooltip-bg)] text-[var(--wa-tooltip-text)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                Settings
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
        {filteredConversations.length === 0 ? (
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
              onClick={() => onSelectConversation(conversation)}
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
                      {conversation.contactName || conversation.phoneNumber}
                    </p>
                    <span className={cn("text-[12px] flex-shrink-0", isUnread ? "text-[var(--wa-green)] font-semibold" : "text-[var(--wa-text-secondary)]")}>
                      {formatConversationDate(conversation.lastActiveAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <p className={cn("text-[13px] truncate flex-1", isUnread ? "text-[var(--wa-text-primary)] font-medium" : "text-[var(--wa-text-secondary)]")}>
                      {conversation.lastMessage ? (
                        <>
                          {conversation.lastMessage.direction === 'outbound' && (
                            <CheckCheck className="inline h-[15px] w-[15px] text-[var(--wa-read-check)] align-text-bottom mr-0.5" />
                          )}
                          {getMessageTypeIcon(conversation.lastMessage.type)}
                          {conversation.lastMessage.content}
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
        {activeTab !== 'unread' && <div ref={sentinelRef} className="h-1" />}
        {loadingMore && activeTab !== 'unread' && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
          </div>
        )}
      </ScrollArea>

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
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Settings</DialogTitle>
          </DialogHeader>
          <SettingsForm onClose={() => setShowSettings(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
});

ConversationList.displayName = 'ConversationList';

function SettingsForm({ onClose }: { onClose: () => void }) {
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
    <div className="space-y-4 pt-2">
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
