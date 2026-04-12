'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Sun, Moon, Zap, ChevronRight, Play, CheckCircle2,
  XCircle, Clock, Activity, RefreshCw, Loader2, Store, ChevronDown,
  ChevronUp, AlertTriangle,
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

// Trigger type color map
const TRIGGER_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  transaction_success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  transaction_failed: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  payment_received: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  customer_created: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  order_created: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
};
const DEFAULT_TRIGGER_COLOR = { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' };

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

    // Fetch stats and first page of executions in parallel
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

  // Group automations by merchant
  const grouped = automations.reduce<Record<string, Automation[]>>((acc, a) => {
    const key = a.merchantName || a.team_name || 'Default';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped);

  if (!mounted) return null;

  const selectedAuto = automations.find(a => a.id === selectedId);

  return (
    <div className="h-dvh flex flex-col bg-[var(--wa-bg)] text-[var(--wa-text-primary)]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border-strong)] flex-shrink-0 safe-area-top">
        <Link
          href="/"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold flex items-center gap-2">
            <Zap className="h-4.5 w-4.5 text-amber-500" />
            Automations
          </h1>
          <p className="text-[11px] text-[var(--wa-text-secondary)] truncate">
            {automations.length} automation{automations.length !== 1 ? 's' : ''} across {groupKeys.length} merchant{groupKeys.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <RefreshCw className={cn('h-4.5 w-4.5', refreshing && 'animate-spin')} />
        </button>
        <button
          onClick={toggleTheme}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* List panel */}
        <div className={cn(
          'md:w-[360px] lg:w-[400px] md:border-r md:border-[var(--wa-border-strong)] flex flex-col overflow-hidden',
          showDetail && 'hidden md:flex'
        )}>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--wa-text-secondary)]" />
              </div>
            ) : automations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-[var(--wa-text-secondary)]">
                <Zap className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">No automations found</p>
                <p className="text-xs mt-1">Configure BCL merchants in Settings</p>
              </div>
            ) : (
              groupKeys.map(groupName => (
                <div key={groupName}>
                  {groupKeys.length > 1 && (
                    <div className="px-4 py-2 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)] sticky top-0 z-10">
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
                        <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wide">{groupName}</span>
                        <span className="text-[10px] text-[var(--wa-text-secondary)] ml-auto">{grouped[groupName].length}</span>
                      </div>
                    </div>
                  )}
                  {grouped[groupName].map(auto => {
                    const triggerColor = TRIGGER_COLORS[auto.trigger_type] || DEFAULT_TRIGGER_COLOR;
                    return (
                      <button
                        key={`${auto.id}-${auto.merchantId}`}
                        onClick={() => selectAutomation(auto)}
                        className={cn(
                          'w-full text-left px-4 py-3.5 border-b border-[var(--wa-border)] hover:bg-[var(--wa-hover)] transition-colors',
                          selectedId === auto.id && selectedMerchantId === auto.merchantId && 'bg-[var(--wa-hover)]'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', triggerColor.bg)}>
                            <Zap className={cn('h-4 w-4', triggerColor.text)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13.5px] font-medium truncate">{auto.name}</span>
                              <div className={cn(
                                'flex-shrink-0 h-2 w-2 rounded-full',
                                auto.is_active ? 'bg-green-500' : 'bg-gray-400'
                              )} />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                'text-[10.5px] px-1.5 py-0.5 rounded-md font-medium',
                                triggerColor.bg, triggerColor.text
                              )}>
                                {auto.trigger_type_label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--wa-text-secondary)]">
                              <span className="flex items-center gap-1">
                                <Play className="h-3 w-3" />
                                {auto.execution_count.toLocaleString()} runs
                              </span>
                              {auto.last_executed_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {timeAgo(auto.last_executed_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-[var(--wa-text-secondary)] mt-1 flex-shrink-0 md:hidden" />
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
          'flex-1 flex flex-col overflow-hidden',
          !showDetail && 'hidden md:flex'
        )}>
          {!selectedAuto ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--wa-text-secondary)]">
              <Activity className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Select an automation to view details</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="px-4 py-3 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border-strong)] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDetail(false)}
                    className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <ArrowLeft className="h-4.5 w-4.5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[14px] font-semibold truncate">{selectedAuto.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {selectedAuto.merchantName && (
                        <span className="text-[11px] text-[var(--wa-text-secondary)] flex items-center gap-1">
                          <Store className="h-3 w-3" />
                          {selectedAuto.merchantName}
                        </span>
                      )}
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                        selectedAuto.is_active
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                      )}>
                        {selectedAuto.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats cards */}
              <div className="px-4 py-3 border-b border-[var(--wa-border)] flex-shrink-0">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
                  </div>
                ) : stats ? (
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      label="Total Runs"
                      value={stats.total_executions.toLocaleString()}
                      icon={<Play className="h-4 w-4 text-blue-500" />}
                    />
                    <StatCard
                      label="Completed"
                      value={(stats.by_status?.completed || 0).toLocaleString()}
                      icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      subtext={stats.total_executions > 0
                        ? `${Math.round(((stats.by_status?.completed || 0) / stats.total_executions) * 100)}%`
                        : undefined}
                    />
                    <StatCard
                      label="Failed"
                      value={(stats.by_status?.failed || 0).toLocaleString()}
                      icon={<XCircle className="h-4 w-4 text-red-500" />}
                      alert={(stats.by_status?.failed || 0) > 0}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      label="Total Runs"
                      value={selectedAuto.execution_count.toLocaleString()}
                      icon={<Play className="h-4 w-4 text-blue-500" />}
                    />
                    <StatCard
                      label="Last Run"
                      value={selectedAuto.last_executed_at ? timeAgo(selectedAuto.last_executed_at) : '—'}
                      icon={<Clock className="h-4 w-4 text-amber-500" />}
                    />
                    <StatCard
                      label="Created"
                      value={formatDateTime(selectedAuto.created_at).split(',')[0]}
                      icon={<Activity className="h-4 w-4 text-purple-500" />}
                    />
                  </div>
                )}
              </div>

              {/* Automation info */}
              <div className="px-4 py-2.5 border-b border-[var(--wa-border)] flex-shrink-0">
                <div className="flex items-center gap-4 text-[11.5px] text-[var(--wa-text-secondary)]">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {selectedAuto.trigger_type_label}
                  </span>
                  <span className="flex items-center gap-1">
                    <Store className="h-3 w-3" />
                    {selectedAuto.team_name}
                  </span>
                  {selectedAuto.last_executed_at && (
                    <span className="flex items-center gap-1 ml-auto">
                      <Clock className="h-3 w-3" />
                      Last: {formatDateTime(selectedAuto.last_executed_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Executions list */}
              <div className="flex-1 overflow-auto">
                <div className="px-4 py-2 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)] sticky top-0 z-10">
                  <span className="text-[11px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wide">
                    Recent Executions
                    {execMeta && ` (${execMeta.total.toLocaleString()})`}
                  </span>
                </div>

                {execLoading && executions.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--wa-text-secondary)]" />
                  </div>
                ) : executions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-[var(--wa-text-secondary)]">
                    <Activity className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-xs">No executions yet</p>
                  </div>
                ) : (
                  <>
                    {executions.map(exec => (
                      <ExecutionRow key={exec.execution_id} exec={exec} />
                    ))}

                    {execMeta && execMeta.current_page < execMeta.last_page && (
                      <button
                        onClick={loadMoreExecutions}
                        disabled={execLoading}
                        className="w-full py-3 text-center text-[12px] text-blue-500 dark:text-blue-400 hover:bg-[var(--wa-hover)] transition-colors border-b border-[var(--wa-border)] flex items-center justify-center gap-2"
                      >
                        {execLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        Load more ({execMeta.total - executions.length} remaining)
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

function StatCard({
  label, value, icon, subtext, alert,
}: {
  label: string; value: string; icon: React.ReactNode; subtext?: string; alert?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl px-3 py-2.5 bg-[var(--wa-panel-header)] border border-[var(--wa-border)]',
      alert && 'border-red-500/30'
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-[var(--wa-text-secondary)] uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-[18px] font-bold', alert && 'text-red-500')}>{value}</span>
        {subtext && <span className="text-[10px] text-[var(--wa-text-secondary)]">{subtext}</span>}
      </div>
    </div>
  );
}

function ExecutionRow({ exec }: { exec: Execution }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = exec.status === 'completed';
  const isFailed = exec.status === 'failed';

  return (
    <div className="border-b border-[var(--wa-border)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0',
            isCompleted && 'bg-emerald-500/10',
            isFailed && 'bg-red-500/10',
            !isCompleted && !isFailed && 'bg-amber-500/10'
          )}>
            {isCompleted ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : isFailed ? (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-medium">#{exec.execution_id}</span>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium',
                isCompleted && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                isFailed && 'bg-red-500/10 text-red-600 dark:text-red-400',
                !isCompleted && !isFailed && 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}>
                {exec.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--wa-text-secondary)]">
              <span>{timeAgo(exec.started_at)}</span>
              {exec.duration && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{exec.duration}</span>}
            </div>
          </div>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-[52px]">
          <div className="text-[11px] space-y-1 text-[var(--wa-text-secondary)]">
            <div className="flex gap-2">
              <span className="text-[var(--wa-text-secondary)]/70 w-16 flex-shrink-0">Trigger</span>
              <span>{exec.trigger_type_label}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--wa-text-secondary)]/70 w-16 flex-shrink-0">Started</span>
              <span>{formatDateTime(exec.started_at)}</span>
            </div>
            {exec.completed_at && (
              <div className="flex gap-2">
                <span className="text-[var(--wa-text-secondary)]/70 w-16 flex-shrink-0">Ended</span>
                <span>{formatDateTime(exec.completed_at)}</span>
              </div>
            )}
            {exec.duration && (
              <div className="flex gap-2">
                <span className="text-[var(--wa-text-secondary)]/70 w-16 flex-shrink-0">Duration</span>
                <span>{exec.duration}</span>
              </div>
            )}
            {exec.error_message && (
              <div className="flex gap-2 mt-1.5">
                <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-500 dark:text-red-400">{exec.error_message}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
