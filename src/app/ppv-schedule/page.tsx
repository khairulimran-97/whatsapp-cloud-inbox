'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, Check, Save, Loader2, ArrowLeft, X, Sun, Moon } from 'lucide-react';
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

  // Theme init
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const dark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  const resetForm = () => {
    setMatchDatetime('');
    setMatchDetails('');
    setCategory('');
    setStatus('upcoming');
    setBclAccount('');
    setPic('');
    setRemark('');
    setEditing(null);
    setShowForm(false);
    setMessage(null);
  };

  const openEdit = (s: PPVSchedule) => {
    setEditing(s);
    const dt = new Date(s.matchDatetime);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setMatchDatetime(local);
    setMatchDetails(s.matchDetails);
    setCategory(s.category);
    setStatus(s.status);
    setBclAccount(s.bclAccount || '');
    setPic(s.pic || '');
    setRemark(s.remark || '');
    setShowForm(true);
    setMessage(null);
  };

  const handleSave = async () => {
    if (!matchDatetime || !matchDetails) {
      setMessage({ text: 'Date/time and match details are required', error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const isEdit = !!editing;
      const res = await fetch('/api/ppv-schedules', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-password': localStorage.getItem('app_password') || '',
        },
        body: JSON.stringify({
          ...(isEdit && { id: editing.id }),
          matchDatetime: new Date(matchDatetime).toISOString(),
          matchDetails, category, status, bclAccount, pic, remark,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Failed to save', error: true });
      } else {
        setMessage({ text: isEdit ? 'Updated' : 'Added' });
        await fetchSchedules();
        setTimeout(resetForm, 600);
      }
    } catch {
      setMessage({ text: 'Network error', error: true });
    } finally { setSaving(false); }
  };

  const handleMarkComplete = async (s: PPVSchedule) => {
    try {
      await fetch('/api/ppv-schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-app-password': localStorage.getItem('app_password') || '' },
        body: JSON.stringify({ id: s.id, status: 'completed' }),
      });
      await fetchSchedules();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await fetch(`/api/ppv-schedules?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-app-password': localStorage.getItem('app_password') || '' },
      });
      await fetchSchedules();
    } catch { /* ignore */ }
  };

  const allCategories = [...new Set(schedules.map(s => s.category))];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Today's active matches
  const todayMatches = schedules.filter(s => {
    const dt = new Date(s.matchDatetime);
    return dt >= todayStart && dt < todayEnd && s.status !== 'completed' && s.status !== 'cancelled';
  });
  const hasTodayMatches = todayMatches.length > 0;

  // Next upcoming date (first future date after today with active matches)
  const nextDate = schedules
    .filter(s => new Date(s.matchDatetime) >= todayEnd && s.status !== 'completed' && s.status !== 'cancelled')
    .map(s => { const d = new Date(s.matchDatetime); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })
    .sort((a, b) => a - b)[0];
  const nextDayEnd = nextDate ? nextDate + 86400000 : 0;
  const nextMatches = nextDate ? schedules.filter(s => {
    const t = new Date(s.matchDatetime).getTime();
    return t >= nextDate && t < nextDayEnd && s.status !== 'completed' && s.status !== 'cancelled';
  }) : [];

  // "Active" tab: show today if available, otherwise upcoming
  const activeMatches = hasTodayMatches ? todayMatches : nextMatches;
  const activeLabel = hasTodayMatches ? 'Today' : 'Upcoming';
  const activeCount = activeMatches.length;

  // "Schedule" tab: all non-completed/non-cancelled
  const scheduleMatches = schedules.filter(s => s.status !== 'completed' && s.status !== 'cancelled');
  const scheduleCount = scheduleMatches.length;

  // "Completed" tab
  const completedMatches = schedules.filter(s => s.status === 'completed' || s.status === 'cancelled');
  const completedCount = completedMatches.length;

  const timeFiltered = filterTime === 'active' ? activeMatches
    : filterTime === 'schedule' ? scheduleMatches
    : completedMatches;

  const filtered = filterCategory === 'all' ? timeFiltered : timeFiltered.filter(s => s.category === filterCategory);

  const statusColor = (s: string) => {
    switch (s) {
      case 'upcoming': return 'text-blue-400 bg-blue-500/10';
      case 'live': return 'text-red-400 bg-red-500/10';
      case 'completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'cancelled': return 'text-gray-400 bg-gray-500/10';
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-[var(--wa-bg)]">
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--wa-green)]" />
              <h1 className="text-lg font-semibold text-[var(--wa-text-primary)]">PPV Schedule</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors"
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--wa-green)] text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        {/* Tab filter */}
        <div className="max-w-4xl mx-auto flex border-t border-[var(--wa-border)]">
          {([
            { key: 'active' as const, label: activeLabel, count: activeCount },
            { key: 'schedule' as const, label: 'Schedule', count: scheduleCount },
            { key: 'completed' as const, label: 'Completed', count: completedCount },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilterTime(f.key)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px text-center",
                filterTime === f.key
                  ? "border-[var(--wa-green)] text-[var(--wa-green)]"
                  : "border-transparent text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
              )}
            >
              {f.label} <span className="opacity-50">({f.count})</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        {/* Category pills */}
        {allCategories.length > 1 && (
          <div className="flex items-center gap-2 pb-4 overflow-x-auto">
            <button
              onClick={() => setFilterCategory('all')}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap flex-shrink-0",
                filterCategory === 'all'
                  ? "bg-[var(--wa-green)]/15 text-[var(--wa-green)]"
                  : "bg-[var(--wa-search-bg)] text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
              )}
            >
              All Categories
            </button>
            {allCategories.map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(filterCategory === c ? 'all' : c)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap flex-shrink-0",
                  filterCategory === c
                    ? "bg-[var(--wa-green)]/15 text-[var(--wa-green)]"
                    : "bg-[var(--wa-search-bg)] text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Slideover */}
        {showForm && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={resetForm} />
            <div className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50 bg-[var(--wa-panel-header)] border-l border-[var(--wa-border)] shadow-2xl flex flex-col animate-[slideIn_0.25s_ease-out]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--wa-border)]">
                <h3 className="text-base font-semibold text-[var(--wa-text-primary)]">
                  {editing ? 'Edit Schedule' : 'New Schedule'}
                </h3>
                <button onClick={resetForm} className="p-1.5 rounded-lg text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Date & Time</label>
                  <input type="datetime-local" value={matchDatetime} onChange={(e) => setMatchDatetime(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Match Details</label>
                  <input value={matchDetails} onChange={(e) => setMatchDetails(e.target.value)} placeholder="e.g. JDT vs Selangor"
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Category</label>
                  <input list="ppv-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Type or select"
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                  <datalist id="ppv-cats">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] focus:outline-none focus:border-[var(--wa-green)]/50">
                    {PPV_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">BCL Account</label>
                  <input value={bclAccount} onChange={(e) => setBclAccount(e.target.value)} placeholder="Optional"
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">PIC</label>
                  <input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Optional"
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--wa-text-secondary)] uppercase tracking-wider">Remark</label>
                  <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional notes"
                    className="w-full mt-1 px-3 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50" />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-[var(--wa-border)] flex gap-2">
                <button onClick={resetForm}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-[var(--wa-border)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)] transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !matchDatetime || !matchDetails}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-[var(--wa-green)] text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
              {message && (
                <div className={cn("px-5 pb-3 text-xs", message.error ? "text-red-400" : "text-emerald-400")}>{message.text}</div>
              )}
            </div>
          </>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--wa-text-secondary)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 text-[var(--wa-text-secondary)] opacity-50" />
            <p className="text-sm text-[var(--wa-text-secondary)]">No schedules found</p>
          </div>
        ) : (
          /* Schedule cards */
          <div className="space-y-3">
            {filtered.map((s) => {
              const dt = new Date(s.matchDatetime);
              const dateStr = dt.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
              const timeStr = dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={s.id} className="p-4 rounded-xl bg-[var(--wa-panel-header)] border border-[var(--wa-border)] transition-colors hover:border-[var(--wa-border)]/80">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--wa-green)]/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-[var(--wa-green)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-[var(--wa-text-primary)]">{s.matchDetails}</h3>
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", statusColor(s.status))}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-[var(--wa-text-secondary)]">{dateStr} · {timeStr}</span>
                        <span className="text-[11px] text-[var(--wa-text-secondary)] bg-[var(--wa-search-bg)] px-2 py-0.5 rounded-md">{s.category}</span>
                      </div>
                      {(s.bclAccount || s.pic || s.remark) && (
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-[var(--wa-text-secondary)]">
                          {s.bclAccount && <span>BCL: {s.bclAccount}</span>}
                          {s.pic && <span>PIC: {s.pic}</span>}
                          {s.remark && <span className="italic">{s.remark}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--wa-border)]">
                    {s.status !== 'completed' && (
                      <button onClick={() => handleMarkComplete(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                        <Check className="h-3.5 w-3.5" /> Complete
                      </button>
                    )}
                    <button onClick={() => openEdit(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)] transition-colors">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-red-400 hover:bg-red-500/10 transition-colors ml-auto">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
