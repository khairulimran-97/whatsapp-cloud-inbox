'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Sun, Moon, Zap, ChevronRight, CheckCircle2,
  XCircle, Clock, Activity, RefreshCw, Loader2, Store, ChevronDown,
  CircleDot, BarChart3, Search, TrendingUp, Calendar, Hash, Timer,
} from 'lucide-react';
import Link from 'next/link';

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
  return d.toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + '+08:00');
  return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Automation {
  id: number;
  name: string;
  trigger_type: string;
  trigger_type_label: string;
  is_active: boolean;
  execution_count: number;
  last_executed_at: string | null;
  team_name: string;
  created_at: string;
  merchantId?: string;
  merchantName?: string;
}

interface Execution {
  execution_id: number;
  status: string;
  trigger_type: string;
  trigger_type_label: string;
  started_at: string;
  completed_at: string | null;
  duration: string | null;
  error_message: string | null;
}

interface Stats {
  total_executions: number;
  last_executed_at: string | null;
  by_status: Record<string, number>;
}

interface ExecMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

const TRIGGER_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  transaction_success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500' },
  transaction_failed: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', icon: 'text-red-500' },
  payment_received: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500' },
  customer_created: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', icon: 'text-purple-500' },
  order_created: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500' },
};
const DEFAULT_TRIGGER_COLOR = { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', icon: 'text-slate-500' };

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [execMeta, setExecMeta] = useState<ExecMeta | null>(null);
  const [execLoading, setExecLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMerchant, setFilterMerchant] = useState<string>('all');

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations');
      const json = await res.json();
      setAutomations(json.data || []);
    } catch {
      setAutomations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const selectAutomation = useCallback(async (auto: Automation) => {
    setSelectedId(auto.id);
    setSelectedMerchantId(auto.merchantId);
    setShowDetail(true);
    setStats(null);
    setExecutions([]);
    setExecMeta(null);

    const merchantParam = auto.merchantId ? `&merchant_id=${auto.merchantId}` : '';
    setStatsLoading(true);
    setExecLoading(true);

    const [statsRes, execRes] = await Promise.allSettled([
      fetch(`/api/automations/${auto.id}/stats?_=${Date.now()}${merchantParam}`),
      fetch(`/api/automations/${auto.id}/executions?page=1${merchantParam}`),
    ]);

    if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
      const sj = await statsRes.value.json();
      setStats(sj.data);
    }
    setStatsLoading(false);

    if (execRes.status === 'fulfilled' && execRes.value.ok) {
      const ej = await execRes.value.json();
      setExecutions(ej.data || []);
      setExecMeta(ej.meta || null);
    }
    setExecLoading(false);
  }, []);

  const loadMoreExecutions = useCallback(async () => {
    if (!execMeta || execMeta.current_page >= execMeta.last_page || execLoading) return;
    setExecLoading(true);
    const merchantParam = selectedMerchantId ? `&merchant_id=${selectedMerchantId}` : '';
    try {
      const res = await fetch(`/api/automations/${selectedId}/executions?page=${execMeta.current_page + 1}${merchantParam}`);
      const json = await res.json();
      setExecutions(prev => [...prev, ...(json.data || [])]);
      setExecMeta(json.meta || null);
    } catch { /* ignore */ }
    setExecLoading(false);
  }, [execMeta, execLoading, selectedId, selectedMerchantId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAutomations();
    if (selectedId) {
      const auto = automations.find(a => a.id === selectedId);
      if (auto) selectAutomation(auto);
    }
  };

  // Unique merchant names for filter
  const merchantNames = useMemo(() => {
    const names = new Set<string>();
    automations.forEach(a => names.add(a.merchantName || a.team_name || 'Default'));
    return Array.from(names);
  }, [automations]);

  // Filter and search
  const filteredAutomations = useMemo(() => {
    let list = automations;
    if (filterMerchant !== 'all') {
      list = list.filter(a => (a.merchantName || a.team_name || 'Default') === filterMerchant);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.trigger_type_label.toLowerCase().includes(q) ||
        a.team_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [automations, filterMerchant, searchQuery]);

  // Group by merchant
  const grouped = useMemo(() => {
    const map: Record<string, Automation[]> = {};
    filteredAutomations.forEach(a => {
      const key = a.merchantName || a.team_name || 'Default';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filteredAutomations]);
  const groupKeys = Object.keys(grouped);

  // Summary stats
  const totalRuns = useMemo(() => automations.reduce((s, a) => s + a.execution_count, 0), [automations]);
  const activeCount = useMemo(() => automations.filter(a => a.is_active).length, [automations]);

  if (!mounted) return null;

  const selectedAuto = automations.find(a => a.id === selectedId);

  // Success rate
  const successRate = stats && stats.total_executions > 0
    ? Math.round(((stats.by_status?.completed || 0) / stats.total_executions) * 100)
    : null;

  return (
    <div className="h-dvh flex flex-col bg-[var(--wa-bg)] text-[var(--wa-text-primary)]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-[56px] bg-[var(--wa-panel-header)] border-b border-[var(--wa-border-strong)] flex-shrink-0 safe-area-top">
        <Link
          href="/"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold flex items-center gap-2">
            <Zap className="h-4.5 w-4.5 text-amber-500" />
            BCL Automations
          </h1>
          <p className="text-[11px] text-[var(--wa-text-secondary)] truncate">
            {activeCount} active · {totalRuns.toLocaleString()} total runs · {merchantNames.length} merchant{merchantNames.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('h-4.5 w-4.5', refreshing && 'animate-spin')} />
        </button>
        <button
          onClick={toggleTheme}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Toggle theme"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* List panel */}
        <div className={cn(
          'md:w-[380px] lg:w-[420px] md:border-r md:border-[var(--wa-border-strong)] flex flex-col overflow-hidden',
          showDetail && 'hidden md:flex'
        )}>
          {/* Search + filter bar */}
          <div className="px-3 py-2.5 border-b border-[var(--wa-border)] flex-shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search automations..."
                className="w-full h-8 pl-8 pr-3 text-[12.5px] rounded-lg bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] outline-none border border-transparent focus:border-[var(--wa-green)]/30 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {merchantNames.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <FilterPill active={filterMerchant === 'all'} onClick={() => setFilterMerchant('all')} count={automations.length}>
                  All
                </FilterPill>
                {merchantNames.map(name => (
                  <FilterPill
                    key={name}
                    active={filterMerchant === name}
                    onClick={() => setFilterMerchant(name)}
                    count={automations.filter(a => (a.merchantName || a.team_name || 'Default') === name).length}
                  >
                    {name}
                  </FilterPill>
                ))}
              </div>
            )}
          </div>

          {/* Automation list */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-amber-500/60" />
                <p className="text-[12px] text-[var(--wa-text-secondary)]">Loading automations...</p>
              </div>
            ) : filteredAutomations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--wa-text-secondary)]">
                <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                  <Zap className="h-8 w-8 text-amber-500/50" />
                </div>
                <p className="text-sm font-medium">No automations found</p>
                <p className="text-[11px] mt-1 text-center px-8">
                  {searchQuery ? 'Try a different search term' : 'Configure BCL merchants in Settings to get started'}
                </p>
              </div>
            ) : (
              groupKeys.map(groupName => (
                <div key={groupName}>
                  {groupKeys.length > 1 && (
                    <div className="px-4 py-2 bg-[var(--wa-panel-header)]/80 backdrop-blur-sm border-b border-[var(--wa-border)] sticky top-0 z-10">
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">{groupName}</span>
                        <span className="text-[10px] bg-[var(--wa-hover)] text-[var(--wa-text-secondary)] px-1.5 py-0.5 rounded-full ml-auto">{grouped[groupName].length}</span>
                      </div>
                    </div>
                  )}
                  {grouped[groupName].map(auto => {
                    const triggerColor = TRIGGER_COLORS[auto.trigger_type] || DEFAULT_TRIGGER_COLOR;
                    const isSelected = selectedId === auto.id && selectedMerchantId === auto.merchantId;
                    return (
                      <button
                        key={`${auto.id}-${auto.merchantId}`}
                        onClick={() => selectAutomation(auto)}
                        className={cn(
                          'w-full text-left px-4 py-3 border-b border-[var(--wa-border)] transition-all duration-150',
                          isSelected
                            ? 'bg-amber-500/8 dark:bg-amber-500/10 border-l-2 border-l-amber-500'
                            : 'hover:bg-[var(--wa-hover)] border-l-2 border-l-transparent'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', triggerColor.bg)}>
                            <Zap className={cn('h-4.5 w-4.5', triggerColor.icon)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold truncate flex-1">{auto.name}</span>
                              <span className={cn(
                                'flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider',
                                auto.is_active
                                  ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                  : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                              )}>
                                {auto.is_active ? 'Active' : 'Off'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={cn(
                                'text-[10px] px-1.5 py-[2px] rounded-md font-medium inline-flex items-center gap-1',
                                triggerColor.bg, triggerColor.text
                              )}>
                                <CircleDot className="h-2.5 w-2.5" />
                                {auto.trigger_type_label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--wa-text-secondary)]">
                              <span className="flex items-center gap-1">
                                <BarChart3 className="h-3 w-3" />
                                {auto.execution_count.toLocaleString()}
                              </span>
                              {auto.last_executed_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {timeAgo(auto.last_executed_at)}
                                </span>
                              )}
                              {groupKeys.length <= 1 && auto.team_name && (
                                <span className="flex items-center gap-1 ml-auto truncate max-w-[100px]">
                                  <Store className="h-3 w-3 flex-shrink-0" />
                                  {auto.team_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-[var(--wa-text-secondary)]/50 mt-3 flex-shrink-0 md:hidden" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className={cn(
          'flex-1 flex flex-col overflow-hidden bg-[var(--wa-bg)]',
          !showDetail && 'hidden md:flex'
        )}>
          {!selectedAuto ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--wa-text-secondary)]">
              <div className="h-20 w-20 rounded-2xl bg-amber-500/5 flex items-center justify-center mb-4">
                <Activity className="h-10 w-10 text-amber-500/30" />
              </div>
              <p className="text-[14px] font-medium">Select an automation</p>
              <p className="text-[12px] mt-1">View stats and execution history</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="px-4 py-3.5 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border-strong)] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDetail(false)}
                    className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <ArrowLeft className="h-4.5 w-4.5" />
                  </button>
                  <div className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).bg
                  )}>
                    <Zap className={cn('h-4.5 w-4.5', (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).icon)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[14px] font-semibold truncate">{selectedAuto.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1',
                        (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).bg,
                        (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).text
                      )}>
                        <CircleDot className="h-2.5 w-2.5" />
                        {selectedAuto.trigger_type_label}
                      </span>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                        selectedAuto.is_active
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                      )}>
                        {selectedAuto.is_active ? '● Active' : '○ Inactive'}
                      </span>
                      {selectedAuto.merchantName && (
                        <span className="text-[10px] text-[var(--wa-text-secondary)] flex items-center gap-1">
                          <Store className="h-2.5 w-2.5" />
                          {selectedAuto.merchantName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats section */}
              <div className="px-4 py-3.5 border-b border-[var(--wa-border)] flex-shrink-0">
                {statsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="rounded-xl p-3 bg-[var(--wa-panel-header)] border border-[var(--wa-border)] animate-pulse">
                        <div className="h-3 w-12 bg-[var(--wa-hover)] rounded mb-2" />
                        <div className="h-6 w-16 bg-[var(--wa-hover)] rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <StatCard
                      label="Total Runs"
                      value={(stats?.total_executions ?? selectedAuto.execution_count).toLocaleString()}
                      icon={<BarChart3 className="h-4 w-4" />}
                      color="blue"
                    />
                    <StatCard
                      label="Completed"
                      value={(stats?.by_status?.completed || 0).toLocaleString()}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      color="emerald"
                      subtext={successRate !== null ? `${successRate}%` : undefined}
                    />
                    <StatCard
                      label="Failed"
                      value={(stats?.by_status?.failed || 0).toLocaleString()}
                      icon={<XCircle className="h-4 w-4" />}
                      color="red"
                      alert={(stats?.by_status?.failed || 0) > 0}
                    />
                    <StatCard
                      label="Last Run"
                      value={(stats?.last_executed_at || selectedAuto.last_executed_at) ? timeAgo((stats?.last_executed_at || selectedAuto.last_executed_at)!) : '—'}
                      icon={<Clock className="h-4 w-4" />}
                      color="amber"
                    />
                  </div>
                )}

                {/* Success rate bar */}
                {stats && stats.total_executions > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-[var(--wa-text-secondary)] mb-1.5">
                      <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Success Rate</span>
                      <span className="font-semibold">{successRate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--wa-hover)] overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          successRate! >= 95 ? 'bg-emerald-500' : successRate! >= 80 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Automation metadata */}
              <div className="px-4 py-2.5 border-b border-[var(--wa-border)] flex-shrink-0">
                <div className="flex items-center gap-4 text-[11px] text-[var(--wa-text-secondary)] flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Store className="h-3 w-3 text-[var(--wa-text-secondary)]/60" />
                    {selectedAuto.team_name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-[var(--wa-text-secondary)]/60" />
                    Created {formatDate(selectedAuto.created_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3 text-[var(--wa-text-secondary)]/60" />
                    ID: {selectedAuto.id}
                  </span>
                </div>
              </div>

              {/* Executions list */}
              <div className="flex-1 overflow-auto">
                <div className="px-4 py-2.5 bg-[var(--wa-panel-header)]/80 backdrop-blur-sm border-b border-[var(--wa-border)] sticky top-0 z-10 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    Execution History
                  </span>
                  {execMeta && (
                    <span className="text-[10px] bg-[var(--wa-hover)] text-[var(--wa-text-secondary)] px-2 py-0.5 rounded-full">
                      {execMeta.total.toLocaleString()} total
                    </span>
                  )}
                </div>

                {/* Execution cards grid */}

                {execLoading && executions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500/50" />
                    <p className="text-[11px] text-[var(--wa-text-secondary)]">Loading executions...</p>
                  </div>
                ) : executions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--wa-text-secondary)]">
                    <div className="h-14 w-14 rounded-2xl bg-[var(--wa-hover)] flex items-center justify-center mb-3">
                      <Activity className="h-7 w-7 opacity-30" />
                    </div>
                    <p className="text-[12px] font-medium">No executions yet</p>
                    <p className="text-[11px] mt-0.5">This automation hasn&apos;t been triggered</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
                      {executions.map((exec) => (
                        <ExecutionCard key={exec.execution_id} exec={exec} />
                      ))}
                    </div>

                    {execMeta && execMeta.current_page < execMeta.last_page && (
                      <button
                        onClick={loadMoreExecutions}
                        disabled={execLoading}
                        className="w-full py-3.5 text-center text-[12px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 transition-colors flex items-center justify-center gap-2 font-medium"
                      >
                        {execLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        Load more · {(execMeta.total - executions.length).toLocaleString()} remaining
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function FilterPill({ active, onClick, children, count }: {
  active: boolean; onClick: () => void; children: React.ReactNode; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors inline-flex items-center gap-1.5',
        active
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
          : 'bg-[var(--wa-hover)] text-[var(--wa-text-secondary)] border border-transparent hover:border-[var(--wa-border)]'
      )}
    >
      {children}
      <span className={cn(
        'text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1',
        active ? 'bg-amber-500/20' : 'bg-black/5 dark:bg-white/10'
      )}>
        {count}
      </span>
    </button>
  );
}

function StatCard({
  label, value, icon, color, subtext, alert,
}: {
  label: string; value: string; icon: React.ReactNode; color: string; subtext?: string; alert?: boolean;
}) {
  const colorMap: Record<string, { bg: string; iconColor: string; valueBold?: string }> = {
    blue: { bg: 'bg-blue-500/8', iconColor: 'text-blue-500' },
    emerald: { bg: 'bg-emerald-500/8', iconColor: 'text-emerald-500' },
    red: { bg: 'bg-red-500/8', iconColor: 'text-red-500', valueBold: 'text-red-500' },
    amber: { bg: 'bg-amber-500/8', iconColor: 'text-amber-500' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={cn(
      'rounded-xl p-3 border transition-colors',
      c.bg,
      alert ? 'border-red-500/30' : 'border-transparent'
    )}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={c.iconColor}>{icon}</span>
        <span className="text-[10px] text-[var(--wa-text-secondary)] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-[20px] font-bold leading-none', alert && c.valueBold)}>{value}</span>
        {subtext && <span className="text-[10px] text-[var(--wa-text-secondary)] font-medium">{subtext}</span>}
      </div>
    </div>
  );
}

function ExecutionCard({ exec }: { exec: Execution }) {
  const isCompleted = exec.status === 'completed';
  const isFailed = exec.status === 'failed';

  return (
    <div className={cn(
      'rounded-lg border border-[var(--wa-border)] p-2.5 text-[11px] transition-colors',
      isCompleted && 'bg-emerald-500/5',
      isFailed && 'bg-red-500/5 border-red-500/20',
      !isCompleted && !isFailed && 'bg-amber-500/5'
    )}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {isCompleted ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
        ) : isFailed ? (
          <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 text-amber-500 animate-spin flex-shrink-0" />
        )}
        <span className={cn(
          'text-[10px] font-semibold uppercase',
          isCompleted && 'text-emerald-600 dark:text-emerald-400',
          isFailed && 'text-red-600 dark:text-red-400',
          !isCompleted && !isFailed && 'text-amber-600 dark:text-amber-400'
        )}>
          {exec.status}
        </span>
        {exec.duration && (
          <span className="text-[10px] text-[var(--wa-text-secondary)] font-mono ml-auto">{exec.duration}</span>
        )}
      </div>
      <div className="text-[10.5px] text-[var(--wa-text-secondary)]">
        {timeAgo(exec.started_at)} · {formatTime(exec.started_at)}
      </div>
    </div>
  );
}
