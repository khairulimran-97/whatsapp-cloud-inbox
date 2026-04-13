'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Sun, Moon, Zap, CheckCircle2,
  XCircle, Clock, Activity, Loader2, Store, ChevronDown,
  CircleDot, BarChart3, Search, Calendar, Hash,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

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
  transaction_success: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-500' },
  transaction_failed: { bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-400', icon: 'text-red-500' },
  payment_received: { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-500' },
  customer_created: { bg: 'bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-500' },
  order_created: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500' },
};
const DEFAULT_TRIGGER_COLOR = { bg: 'bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-400', icon: 'text-indigo-500' };

export default function AutomationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const id = searchParams.get('id');
    return id ? Number(id) : null;
  });
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | undefined>(() => {
    return searchParams.get('merchant') || undefined;
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [execMeta, setExecMeta] = useState<ExecMeta | null>(null);
  const [searchingAll, setSearchingAll] = useState(false);
  const [execLoading, setExecLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [filterMerchant, setFilterMerchant] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const selectAutomation = useCallback(async (auto: Automation) => {
    setSelectedId(auto.id);
    setSelectedMerchantId(auto.merchantId);
    // Update URL query params for sharing
    const params = new URLSearchParams();
    params.set('id', String(auto.id));
    if (auto.merchantId) params.set('merchant', auto.merchantId);
    router.replace(`/automations?${params.toString()}`, { scroll: false });
    setStats(null);
    setExecutions([]);
    setExecMeta(null);
    setStatusFilter(null);

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

  // Load all remaining pages to find filtered results
  const loadAllPages = useCallback(async () => {
    if (!execMeta || execMeta.current_page >= execMeta.last_page || searchingAll) return;
    setSearchingAll(true);
    const merchantParam = selectedMerchantId ? `&merchant_id=${selectedMerchantId}` : '';
    let page = execMeta.current_page + 1;
    const lastPage = execMeta.last_page;
    let allNew: Execution[] = [];
    let latestMeta = execMeta;
    while (page <= lastPage) {
      try {
        const res = await fetch(`/api/automations/${selectedId}/executions?page=${page}${merchantParam}`);
        const json = await res.json();
        allNew = [...allNew, ...(json.data || [])];
        latestMeta = json.meta || latestMeta;
      } catch { break; }
      page++;
    }
    setExecutions(prev => [...prev, ...allNew]);
    setExecMeta(latestMeta);
    setSearchingAll(false);
  }, [execMeta, searchingAll, selectedId, selectedMerchantId]);

  // Unique merchant names for filter
  const merchantNames = useMemo(() => {
    const names = new Set<string>();
    automations.forEach(a => names.add(a.merchantName || a.team_name || 'Default'));
    return Array.from(names);
  }, [automations]);

  // Default to first merchant on load
  useEffect(() => {
    if (merchantNames.length > 0 && !filterMerchant) {
      setFilterMerchant(merchantNames[0]);
    }
  }, [merchantNames, filterMerchant]);

  // Filter and search
  const filteredAutomations = useMemo(() => {
    let list = automations;
    if (filterMerchant) {
      list = list.filter(a => (a.merchantName || a.team_name || 'Default') === filterMerchant);
    }
    return list;
  }, [automations, filterMerchant]);

  // Auto-select: from URL params or first automation
  useEffect(() => {
    if (filteredAutomations.length === 0) return;
    // Try URL params first
    const urlId = searchParams.get('id');
    const urlMerchant = searchParams.get('merchant');
    if (urlId) {
      const fromUrl = filteredAutomations.find(a => String(a.id) === urlId && (!urlMerchant || a.merchantId === urlMerchant));
      if (fromUrl) {
        // Always call selectAutomation if data hasn't been loaded yet
        if (fromUrl.id !== selectedId || fromUrl.merchantId !== selectedMerchantId || (!stats && !statsLoading)) {
          selectAutomation(fromUrl);
        }
        return;
      }
    }
    // Fallback to first
    if (!filteredAutomations.find(a => a.id === selectedId && a.merchantId === selectedMerchantId) || (!stats && !statsLoading)) {
      selectAutomation(filteredAutomations[0]);
    }
  }, [filteredAutomations, selectedId, selectedMerchantId, selectAutomation, searchParams, stats, statsLoading]);


  if (!mounted) return null;

  const selectedAuto = automations.find(a => a.id === selectedId);

  // Success rate
  const successRate = stats && stats.total_executions > 0
    ? Math.round(((stats.by_status?.completed || 0) / stats.total_executions) * 100)
    : null;

  return (
    <div className="h-dvh flex flex-col bg-[var(--wa-bg)] text-[var(--wa-text-primary)]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-[56px] bg-gradient-to-r from-amber-500/5 via-transparent to-purple-500/5 dark:from-amber-500/10 dark:via-transparent dark:to-purple-500/10 border-b border-amber-200/50 dark:border-amber-500/20 flex-shrink-0 safe-area-top">
        <Link
          href="/"
          className="h-9 w-9 flex items-center justify-center rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent leading-tight">
              BCL Automations
            </h1>
            <p className="text-[11px] text-amber-600/60 dark:text-amber-400/50 truncate">
              Workflow monitoring & execution history
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {merchantNames.length > 1 && (
            <div className="relative">
              <select
                value={filterMerchant}
                onChange={e => setFilterMerchant(e.target.value)}
                className="appearance-none h-8 pl-2.5 pr-7 text-[12px] rounded-lg bg-white/60 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 outline-none cursor-pointer font-medium"
              >
                {merchantNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-500 pointer-events-none" />
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="h-8 w-8 flex items-center justify-center rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Content — always show detail, dropdown to switch automation */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
              Configure BCL merchants in Settings to get started
            </p>
          </div>
        ) : (
          /* Detail view */
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--wa-bg)]">
            {selectedAuto && (
              <>
              {/* Detail header with automation dropdown */}
              <div className="px-3 sm:px-4 py-3 bg-gradient-to-r from-slate-50 to-white dark:from-white/[0.03] dark:to-transparent border-b border-slate-200 dark:border-[var(--wa-border-strong)] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
                    (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).bg
                  )}>
                    <Zap className={cn('h-4 w-4', (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).icon)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {filteredAutomations.length > 1 ? (
                      <div className="relative">
                        <select
                          value={`${selectedAuto.id}|${selectedAuto.merchantId}`}
                          onChange={e => {
                            const [aId, mId] = e.target.value.split('|');
                            const auto = filteredAutomations.find(a => String(a.id) === aId && a.merchantId === mId);
                            if (auto) selectAutomation(auto);
                          }}
                          className="appearance-none w-full h-9 pl-2.5 pr-7 text-[14px] font-semibold rounded-lg bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] border border-slate-200 dark:border-[var(--wa-border)] outline-none cursor-pointer truncate"
                        >
                          {filteredAutomations.map(a => (
                            <option key={`${a.id}-${a.merchantId}`} value={`${a.id}|${a.merchantId}`}>
                              {a.name} {a.is_active ? '● Active' : '○ Off'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--wa-text-secondary)] pointer-events-none" />
                      </div>
                    ) : (
                      <h2 className="text-[15px] font-semibold truncate">{selectedAuto.name}</h2>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-1',
                        (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).bg,
                        (TRIGGER_COLORS[selectedAuto.trigger_type] || DEFAULT_TRIGGER_COLOR).text
                      )}>
                        <CircleDot className="h-2.5 w-2.5" />
                        {selectedAuto.trigger_type_label}
                      </span>
                      <span className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded-md font-semibold',
                        selectedAuto.is_active
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                      )}>
                        {selectedAuto.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Metadata inline */}
                <div className="flex items-center gap-3 mt-2 ml-[44px] md:ml-[46px] text-[11px] text-slate-500 dark:text-slate-300 flex-wrap">
                  {selectedAuto.merchantName && (
                    <span className="flex items-center gap-1">
                      <Store className="h-2.5 w-2.5" />
                      {selectedAuto.merchantName}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {formatDate(selectedAuto.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash className="h-2.5 w-2.5" />
                    {selectedAuto.id}
                  </span>
                </div>
              </div>

              {/* Stats section */}
              <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 dark:border-[var(--wa-border)] flex-shrink-0">
                {statsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="rounded-xl p-3 bg-[var(--wa-panel-header)] border border-slate-200 dark:border-[var(--wa-border)] animate-pulse">
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
                      active={statusFilter === null}
                      onClick={() => setStatusFilter(null)}
                    />
                    <StatCard
                      label="Completed"
                      value={(stats?.by_status?.completed || 0).toLocaleString()}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      color="emerald"
                      subtext={successRate !== null ? `${successRate}%` : undefined}
                      active={statusFilter === 'completed'}
                      onClick={() => setStatusFilter(statusFilter === 'completed' ? null : 'completed')}
                    />
                    <StatCard
                      label="Failed"
                      value={(stats?.by_status?.failed || 0).toLocaleString()}
                      icon={<XCircle className="h-4 w-4" />}
                      color="red"
                      alert={(stats?.by_status?.failed || 0) > 0}
                      active={statusFilter === 'failed'}
                      onClick={() => setStatusFilter(statusFilter === 'failed' ? null : 'failed')}
                    />
                    <StatCard
                      label="Last Run"
                      value={(stats?.last_executed_at || selectedAuto.last_executed_at) ? timeAgo((stats?.last_executed_at || selectedAuto.last_executed_at)!) : '—'}
                      icon={<Clock className="h-4 w-4" />}
                      color="amber"
                    />
                  </div>
                )}

              </div>

              {/* Automation metadata */}
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[var(--wa-border)] flex-shrink-0">
                <div className="flex items-center gap-4 text-[12px] flex-wrap">
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300 font-medium">
                    <Store className="h-3.5 w-3.5" />
                    {selectedAuto.team_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-blue-600/80 dark:text-blue-300">
                    <Calendar className="h-3.5 w-3.5" />
                    Created {formatDate(selectedAuto.created_at)}
                  </span>
                  <span className="flex items-center gap-1.5 text-purple-600/80 dark:text-purple-300">
                    <Hash className="h-3.5 w-3.5" />
                    ID: {selectedAuto.id}
                  </span>
                </div>
              </div>

              {/* Executions list */}
              <div className="flex-1 overflow-auto">
                <div className="px-4 py-2.5 bg-[var(--wa-panel-header)]/80 backdrop-blur-sm border-b border-slate-200 dark:border-[var(--wa-border)] sticky top-0 z-10 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-600 dark:text-white/90 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Execution History
                    {statusFilter && (
                      <button
                        onClick={() => setStatusFilter(null)}
                        className={cn(
                          'ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold normal-case tracking-normal',
                          statusFilter === 'failed'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : statusFilter === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        )}
                      >
                        {statusFilter}
                        <XCircle className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  {execMeta && (
                    <span className="text-[11px] bg-[var(--wa-hover)] text-slate-600 dark:text-white/80 px-2 py-0.5 rounded-full font-medium">
                      {statusFilter
                        ? `${executions.filter(e => e.status === statusFilter).length} of ${execMeta.total.toLocaleString()}`
                        : `${execMeta.total.toLocaleString()} total`
                      }
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
                ) : (() => {
                  const filtered = executions.filter(e => !statusFilter || e.status === statusFilter);
                  const hasMorePages = execMeta && execMeta.current_page < execMeta.last_page;
                  return filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--wa-text-secondary)]">
                      <div className="h-14 w-14 rounded-2xl bg-[var(--wa-hover)] flex items-center justify-center mb-3">
                        <Activity className="h-7 w-7 opacity-30" />
                      </div>
                      {hasMorePages ? (
                        <>
                          <p className="text-[12px] font-medium">No {statusFilter} in loaded pages</p>
                          <p className="text-[11px] mt-0.5">
                            Only page {execMeta!.current_page} of {execMeta!.last_page} loaded
                          </p>
                          <button
                            onClick={loadAllPages}
                            disabled={searchingAll}
                            className="mt-3 text-[11px] text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1.5 font-semibold"
                          >
                            {searchingAll ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Searching all pages...</>
                            ) : (
                              <>Search all {execMeta!.last_page} pages</>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-[12px] font-medium">No {statusFilter} executions</p>
                          <p className="text-[11px] mt-0.5">
                            {statusFilter === 'failed' ? 'All executions completed successfully' : 'None found across all pages'}
                          </p>
                        </>
                      )}
                      <button
                        onClick={() => setStatusFilter(null)}
                        className="mt-2 text-[11px] text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:underline"
                      >
                        Clear filter
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
                        {filtered.map((exec) => (
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
                  );
                })()}
              </div>
            </>
            )}
          </div>
        )}
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
  label, value, icon, color, subtext, alert, active, onClick,
}: {
  label: string; value: string; icon: React.ReactNode; color: string; subtext?: string; alert?: boolean; active?: boolean; onClick?: () => void;
}) {
  const colorMap: Record<string, { bg: string; iconColor: string; valueBold?: string; activeBorder: string }> = {
    blue: { bg: 'bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/15 dark:to-indigo-500/15', iconColor: 'text-blue-500', activeBorder: 'ring-blue-500/40' },
    emerald: { bg: 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/15 dark:to-teal-500/15', iconColor: 'text-emerald-500', activeBorder: 'ring-emerald-500/40' },
    red: { bg: 'bg-gradient-to-br from-red-500/10 to-rose-500/10 dark:from-red-500/15 dark:to-rose-500/15', iconColor: 'text-red-500', valueBold: 'text-red-500', activeBorder: 'ring-red-500/40' },
    amber: { bg: 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 dark:from-amber-500/15 dark:to-orange-500/15', iconColor: 'text-amber-500', activeBorder: 'ring-amber-500/40' },
  };
  const c = colorMap[color] || colorMap.blue;

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'rounded-xl p-3 border transition-all text-left',
        c.bg,
        alert ? 'border-red-500/30' : 'border-slate-200 dark:border-transparent',
        onClick && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
        active && `ring-2 ${c.activeBorder}`
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={c.iconColor}>{icon}</span>
        <span className="text-[11px] text-slate-600 dark:text-white/70 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-[22px] font-bold leading-none dark:text-white', alert && c.valueBold)}>{value}</span>
        {subtext && <span className="text-[11px] text-slate-500 dark:text-white/60 font-medium">{subtext}</span>}
      </div>
    </Wrapper>
  );
}

function ExecutionCard({ exec }: { exec: Execution }) {
  const isCompleted = exec.status === 'completed';
  const isFailed = exec.status === 'failed';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      'rounded-xl border p-3 text-[12px] transition-colors',
      isCompleted && 'bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border-emerald-300/50 dark:border-emerald-500/20',
      isFailed && 'bg-gradient-to-br from-red-500/5 to-rose-500/5 border-red-300/50 dark:border-red-500/20',
      !isCompleted && !isFailed && 'bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-300/50 dark:border-amber-500/20'
    )}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {isCompleted ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
        ) : isFailed ? (
          <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin flex-shrink-0" />
        )}
        <span className={cn(
          'text-[11px] font-semibold uppercase',
          isCompleted && 'text-emerald-600 dark:text-emerald-300',
          isFailed && 'text-red-600 dark:text-red-300',
          !isCompleted && !isFailed && 'text-amber-600 dark:text-amber-300'
        )}>
          {exec.status}
        </span>
        {exec.duration && (
          <span className="text-[11px] text-slate-500 dark:text-white/60 font-mono ml-auto">{exec.duration}</span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-white/70">
        <span>#{exec.execution_id}</span>
        <span>{timeAgo(exec.started_at)} · {formatTime(exec.started_at)}</span>
      </div>
      {isFailed && exec.error_message && (
        <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-300 bg-red-500/10 rounded px-2 py-1.5">
          <div className={expanded ? '' : 'line-clamp-2'}>{exec.error_message}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="mt-0.5 text-[10px] font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-300 underline"
          >
            {expanded ? 'Show less' : 'View more'}
          </button>
        </div>
      )}
    </div>
  );
}
