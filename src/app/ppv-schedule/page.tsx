'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, Check, Save, Loader2, ArrowLeft, X, Sun, Moon, Clock, MapPin, User, CreditCard, MessageSquare, Trophy } from 'lucide-react';
import Link from 'next/link';

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface PPVSchedule {
  id: string;
  matchDatetime: string;
  matchDetails: string;
  category: string;
  status: string;
  bclAccount: string;
  pic: string;
  remark: string;
}

const PPV_STATUSES = ['upcoming', 'live', 'completed', 'cancelled'];

export default function PPVSchedulePage() {
  const [schedules, setSchedules] = useState<PPVSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PPVSchedule | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterTime, setFilterTime] = useState<'active' | 'schedule' | 'completed'>('active');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [matchDatetime, setMatchDatetime] = useState('');
  const [matchDetails, setMatchDetails] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('upcoming');
  const [bclAccount, setBclAccount] = useState('');
  const [pic, setPic] = useState('');
  const [remark, setRemark] = useState('');

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/ppv-schedules');
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  useEffect(() => {
    const stored = localStorage.getItem('whatsapp-inbox-theme');
    const dark = stored !== 'light';
    document.documentElement.classList.toggle('dark', dark);
    setIsDark(dark);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('whatsapp-inbox-theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  const resetForm = () => {
    setMatchDatetime(''); setMatchDetails(''); setCategory('');
    setStatus('upcoming'); setBclAccount(''); setPic(''); setRemark('');
    setEditing(null); setShowForm(false); setMessage(null);
  };

  const openEdit = (s: PPVSchedule) => {
    setEditing(s);
    const dt = new Date(s.matchDatetime);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setMatchDatetime(local); setMatchDetails(s.matchDetails); setCategory(s.category);
    setStatus(s.status); setBclAccount(s.bclAccount || ''); setPic(s.pic || ''); setRemark(s.remark || '');
    setShowForm(true); setMessage(null);
  };

  const handleSave = async () => {
    if (!matchDatetime || !matchDetails) {
      setMessage({ text: 'Date/time and match details are required', error: true });
      return;
    }
    setSaving(true); setMessage(null);
    try {
      const isEdit = !!editing;
      const res = await fetch('/api/ppv-schedules', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit && { id: editing.id }),
          matchDatetime: new Date(matchDatetime).toISOString(),
          matchDetails, category, status, bclAccount, pic, remark,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error || 'Failed to save', error: true }); }
      else { setMessage({ text: isEdit ? 'Updated' : 'Added' }); await fetchSchedules(); setTimeout(resetForm, 600); }
    } catch { setMessage({ text: 'Network error', error: true }); }
    finally { setSaving(false); }
  };

  const handleMarkComplete = async (s: PPVSchedule) => {
    try {
      await fetch('/api/ppv-schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, status: 'completed' }),
      });
      await fetchSchedules();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await fetch(`/api/ppv-schedules?id=${id}`, { method: 'DELETE' });
      await fetchSchedules();
    } catch { /* ignore */ }
  };

  const allCategories = useMemo(() => [...new Set(schedules.map(s => s.category))].filter(Boolean), [schedules]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const todayMatches = schedules.filter(s => {
    const dt = new Date(s.matchDatetime);
    return dt >= todayStart && dt < todayEnd && s.status !== 'completed' && s.status !== 'cancelled';
  });
  const hasTodayMatches = todayMatches.length > 0;

  const nextDate = schedules
    .filter(s => new Date(s.matchDatetime) >= todayEnd && s.status !== 'completed' && s.status !== 'cancelled')
    .map(s => { const d = new Date(s.matchDatetime); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })
    .sort((a, b) => a - b)[0];
  const nextDayEnd = nextDate ? nextDate + 86400000 : 0;
  const nextMatches = nextDate ? schedules.filter(s => {
    const t = new Date(s.matchDatetime).getTime();
    return t >= nextDate && t < nextDayEnd && s.status !== 'completed' && s.status !== 'cancelled';
  }) : [];

  const activeMatches = hasTodayMatches ? todayMatches : nextMatches;
  const activeLabel = hasTodayMatches ? 'Today' : 'Upcoming';
  const activeCount = activeMatches.length;
  const scheduleMatches = schedules.filter(s => s.status !== 'completed' && s.status !== 'cancelled');
  const completedMatches = schedules.filter(s => s.status === 'completed' || s.status === 'cancelled');

  const timeFiltered = filterTime === 'active' ? activeMatches
    : filterTime === 'schedule' ? scheduleMatches : completedMatches;

  const filtered = filterCategory === 'all' ? timeFiltered : timeFiltered.filter(s => s.category === filterCategory);

  // Group by date, then by PIC within each date
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const ta = new Date(a.matchDatetime).getTime();
      const tb = new Date(b.matchDatetime).getTime();
      return filterTime === 'completed' ? tb - ta : ta - tb;
    });

    // Group by date first
    const dateMap = new Map<string, PPVSchedule[]>();
    for (const s of sorted) {
      const d = new Date(s.matchDatetime);
      const key = d.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (!dateMap.has(key)) dateMap.set(key, []);
      dateMap.get(key)!.push(s);
    }

    // Within each date, group by PIC
    const result: { date: string; pics: { pic: string; items: PPVSchedule[] }[] }[] = [];
    for (const [date, items] of dateMap) {
      const picMap = new Map<string, PPVSchedule[]>();
      for (const s of items) {
        const picKey = s.pic?.trim() || 'No PIC yet';
        if (!picMap.has(picKey)) picMap.set(picKey, []);
        picMap.get(picKey)!.push(s);
      }
      // Named PICs first (alphabetical), "No PIC yet" last
      const pics = [...picMap.entries()]
        .sort((a, b) => {
          if (a[0] === 'No PIC yet') return 1;
          if (b[0] === 'No PIC yet') return -1;
          return a[0].localeCompare(b[0]);
        })
        .map(([pic, items]) => ({ pic, items }));
      result.push({ date, pics });
    }
    return result;
  }, [filtered, filterTime]);

  const statusBadge = (s: string) => {
    switch (s) {
      case 'upcoming': return { bg: 'bg-blue-500/10 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
      case 'live': return { bg: 'bg-red-500/10 dark:bg-red-500/15', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500 animate-pulse' };
      case 'completed': return { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
      case 'cancelled': return { bg: 'bg-gray-500/10 dark:bg-gray-500/15', text: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' };
      default: return { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-400' };
    }
  };

  const inputCls = "w-full mt-1.5 px-3.5 py-2.5 text-sm rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--wa-green)]/30 focus:border-[var(--wa-green)] transition-all";

  return (
    <div className="min-h-screen bg-[var(--wa-bg)] transition-colors duration-200">
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--wa-panel-bg)] border-b border-[var(--wa-border)] shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/" className="p-1.5 -ml-1.5 rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--wa-green)]/10 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-[var(--wa-green)]" />
                </div>
                <div>
                  <h1 className="text-[15px] font-semibold text-[var(--wa-text-primary)] leading-tight">PPV Schedule</h1>
                  <p className="text-[11px] text-[var(--wa-text-secondary)] leading-tight">{schedules.length} total matches</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={toggleTheme}
                className="p-2 rounded-xl text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors"
                title={mounted ? (isDark ? 'Light mode' : 'Dark mode') : undefined}>
                {mounted ? (isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />) : <Sun className="h-[18px] w-[18px] opacity-0" />}
              </button>
              <button onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold rounded-xl bg-[var(--wa-green)] text-white hover:opacity-90 active:scale-[0.97] transition-all shadow-sm">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex -mb-px">
            {([
              { key: 'active' as const, label: activeLabel, count: activeCount, color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', activeColor: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
              { key: 'schedule' as const, label: 'Schedule', count: scheduleMatches.length, color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', activeColor: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
              { key: 'completed' as const, label: 'Completed', count: completedMatches.length, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', activeColor: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
            ]).map(f => (
              <button key={f.key} onClick={() => setFilterTime(f.key)}
                className={cn(
                  "flex-1 py-3 text-[13px] font-medium transition-all border-b-2 text-center relative",
                  filterTime === f.key
                    ? "border-[var(--wa-green)] text-[var(--wa-green)]"
                    : "border-transparent text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
                )}>
                {f.label}
                <span className={cn(
                  "ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold",
                  filterTime === f.key ? f.activeColor : f.color
                )}>{f.count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
        {/* Category pills */}
        {allCategories.length > 1 && (
          <div className="flex items-center gap-2 pb-4 mb-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:-mx-6 sm:px-6">
            <button onClick={() => setFilterCategory('all')}
              className={cn(
                "px-3.5 py-1.5 text-[12px] font-medium rounded-full transition-all whitespace-nowrap flex-shrink-0 border",
                filterCategory === 'all'
                  ? "bg-[var(--wa-green)]/10 text-[var(--wa-green)] border-[var(--wa-green)]/25"
                  : "bg-[var(--wa-panel-bg)] text-[var(--wa-text-secondary)] border-[var(--wa-border)] hover:border-[var(--wa-text-secondary)]"
              )}>
              All
            </button>
            {allCategories.map(c => (
              <button key={c} onClick={() => setFilterCategory(filterCategory === c ? 'all' : c)}
                className={cn(
                  "px-3.5 py-1.5 text-[12px] font-medium rounded-full transition-all whitespace-nowrap flex-shrink-0 border",
                  filterCategory === c
                    ? "bg-[var(--wa-green)]/10 text-[var(--wa-green)] border-[var(--wa-green)]/25"
                    : "bg-[var(--wa-panel-bg)] text-[var(--wa-text-secondary)] border-[var(--wa-border)] hover:border-[var(--wa-text-secondary)]"
                )}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--wa-green)] mb-3" />
            <p className="text-sm text-[var(--wa-text-secondary)]">Loading schedules…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-[var(--wa-hover)] flex items-center justify-center mb-4">
              <CalendarDays className="h-8 w-8 text-[var(--wa-text-secondary)] opacity-60" />
            </div>
            <p className="text-sm font-medium text-[var(--wa-text-primary)] mb-1">No matches found</p>
            <p className="text-xs text-[var(--wa-text-secondary)]">
              {filterTime === 'active' ? 'No upcoming matches scheduled' :
               filterTime === 'completed' ? 'No completed matches yet' : 'No matches in this category'}
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {grouped.map(({ date, pics }) => {
              const dateTotal = pics.reduce((sum, p) => sum + p.items.length, 0);
              return (
              <section key={date}>
                {/* Date centered separator */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-indigo-500/20" />
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/8 dark:bg-indigo-500/10 whitespace-nowrap">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {date}
                    <span className="opacity-50">({dateTotal})</span>
                  </span>
                  <div className="flex-1 h-px bg-indigo-500/20" />
                </div>

                {/* PIC groups with left accent border */}
                <div className="space-y-4">
                  {pics.map(({ pic, items }) => (
                    <div key={pic} className="space-y-2">
                      {items.map((s) => {
                        const dt = new Date(s.matchDatetime);
                        const timeStr = dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
                        const badge = statusBadge(s.status);
                        return (
                          <div key={s.id} className="group flex items-stretch rounded-xl bg-[var(--wa-panel-bg)] border border-[var(--wa-border)] overflow-hidden transition-all hover:shadow-md hover:border-[var(--wa-border-strong,var(--wa-border))]">
                            {/* PIC vertical label integrated into card */}
                            <div className={cn(
                              "relative flex items-center justify-center w-7 flex-shrink-0",
                              pic === 'No PIC yet'
                                ? "bg-gray-200 dark:bg-gray-700"
                                : "bg-violet-500"
                            )}>
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                                "[writing-mode:vertical-lr] rotate-180",
                                pic === 'No PIC yet'
                                  ? "text-gray-500 dark:text-gray-400"
                                  : "text-white"
                              )}>{pic}</span>
                            </div>

                            {/* Card content */}
                            <div className="flex-1 min-w-0">
                              <div className="px-4 py-3.5">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="text-[14px] font-semibold text-[var(--wa-text-primary)] leading-snug">{s.matchDetails}</h3>
                                  <div className={cn("flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold", badge.bg, badge.text)}>
                                    <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot)} />
                                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 mt-3 text-[12px] text-[var(--wa-text-secondary)]">
                                  <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                    <Clock className="h-3.5 w-3.5 opacity-50" />
                                    {timeStr}
                                  </span>
                                  <span className="opacity-30">·</span>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--wa-green)]/10 text-[var(--wa-green)] font-medium text-[11px] whitespace-nowrap flex-shrink-0">
                                    <Trophy className="h-3 w-3" />
                                    {s.category}
                                  </span>
                                  {s.bclAccount && (
                                    <>
                                      <span className="opacity-30">·</span>
                                      <a href={`https://${s.bclAccount.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[var(--wa-green)] hover:underline ml-auto flex-shrink-0">
                                        <CreditCard className="h-3.5 w-3.5 opacity-60" />{s.bclAccount}
                                      </a>
                                    </>
                                  )}
                                </div>
                                {s.remark && (
                                  <div className="mt-2 text-[12px] text-[var(--wa-text-secondary)] italic opacity-70">{s.remark}</div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center border-t border-[var(--wa-border)] divide-x divide-[var(--wa-border)]">
                                {s.status !== 'completed' && s.status !== 'cancelled' && (
                                  <button onClick={() => handleMarkComplete(s)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5 transition-colors">
                                    <Check className="h-3.5 w-3.5" /> Complete
                                  </button>
                                )}
                                <button onClick={() => openEdit(s)}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)] transition-colors">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </button>
                                <button onClick={() => handleDelete(s.id)}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium text-red-500 dark:text-red-400 hover:bg-red-500/5 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Slideover */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40 animate-[fadeIn_0.2s_ease-out]" onClick={resetForm} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] z-50 bg-[var(--wa-panel-bg)] border-l border-[var(--wa-border)] shadow-2xl flex flex-col animate-[slideIn_0.25s_ease-out]">
            {/* Slideover header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--wa-border)] flex-shrink-0">
              <h3 className="text-[15px] font-semibold text-[var(--wa-text-primary)]">
                {editing ? 'Edit Schedule' : 'New Schedule'}
              </h3>
              <button onClick={resetForm} className="p-1.5 rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Slideover body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" /> Date & Time
                </label>
                <input type="datetime-local" value={matchDatetime} onChange={e => setMatchDatetime(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                  <Trophy className="h-3.5 w-3.5" /> Match Details
                </label>
                <input value={matchDetails} onChange={e => setMatchDetails(e.target.value)} placeholder="e.g. JDT vs Selangor" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                    <CalendarDays className="h-3.5 w-3.5" /> Category
                  </label>
                  <input list="ppv-cats" value={category} onChange={e => setCategory(e.target.value)} placeholder="Type or select" className={inputCls} />
                  <datalist id="ppv-cats">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                    {PPV_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                    <CreditCard className="h-3.5 w-3.5" /> BCL Account
                  </label>
                  <input value={bclAccount} onChange={e => setBclAccount(e.target.value)} placeholder="Optional" className={inputCls} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                    <User className="h-3.5 w-3.5" /> PIC
                  </label>
                  <input value={pic} onChange={e => setPic(e.target.value)} placeholder="Optional" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--wa-text-secondary)] uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" /> Remark
                </label>
                <textarea value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional notes" rows={3}
                  className={cn(inputCls, "resize-none")} />
              </div>
            </div>

            {/* Slideover footer */}
            <div className="px-5 py-4 border-t border-[var(--wa-border)] flex-shrink-0 space-y-2">
              {message && (
                <div className={cn("text-[12px] font-medium px-3 py-2 rounded-lg",
                  message.error ? "text-red-600 dark:text-red-400 bg-red-500/10" : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                )}>{message.text}</div>
              )}
              <div className="flex gap-2.5">
                <button onClick={resetForm}
                  className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-xl border border-[var(--wa-border)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)] active:scale-[0.98] transition-all">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !matchDatetime || !matchDetails}
                  className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-[var(--wa-green)] text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editing ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
