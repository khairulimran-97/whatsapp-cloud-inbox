'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, Check, Save, Loader2, ArrowLeft } from 'lucide-react';
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
  const [filterTime, setFilterTime] = useState<'today' | 'next' | 'all'>('today');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

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
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

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

  const nextDate = schedules
    .filter(s => new Date(s.matchDatetime) >= todayEnd && s.status !== 'completed' && s.status !== 'cancelled')
    .map(s => { const d = new Date(s.matchDatetime); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })
    .sort((a, b) => a - b)[0];
  const nextDayEnd = nextDate ? nextDate + 86400000 : 0;

  const timeFiltered = schedules.filter(s => {
    const dt = new Date(s.matchDatetime);
    if (filterTime === 'today') return dt >= todayStart && dt < todayEnd;
    if (filterTime === 'next') return nextDate ? (dt.getTime() >= nextDate && dt.getTime() < nextDayEnd) : false;
    return true;
  });

  const filtered = filterCategory === 'all' ? timeFiltered : timeFiltered.filter(s => s.category === filterCategory);
  const todayCount = schedules.filter(s => { const dt = new Date(s.matchDatetime); return dt >= todayStart && dt < todayEnd; }).length;
  const nextCount = nextDate ? schedules.filter(s => { const t = new Date(s.matchDatetime).getTime(); return t >= nextDate && t < nextDayEnd; }).length : 0;

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
    <div className="min-h-screen bg-[var(--wa-bg-deeper,#0a0a0a)]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[var(--wa-panel-header,#1a1a1a)] border-b border-[var(--wa-border,#2a2a2c)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[var(--wa-text-secondary,#8e8e93)] hover:text-[var(--wa-text-primary,#fff)] transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--wa-green,#25D366)]" />
              <h1 className="text-lg font-semibold text-[var(--wa-text-primary,#fff)]">PPV Schedule</h1>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--wa-green,#25D366)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {/* Tab filter */}
        <div className="max-w-4xl mx-auto flex border-t border-[var(--wa-border,#2a2a2c)]">
          {([
            { key: 'today' as const, label: 'Today', count: todayCount },
            { key: 'next' as const, label: 'Upcoming', count: nextCount },
            { key: 'all' as const, label: 'All', count: schedules.length },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilterTime(f.key)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px text-center",
                filterTime === f.key
                  ? "border-[var(--wa-green,#25D366)] text-[var(--wa-green,#25D366)]"
                  : "border-transparent text-[var(--wa-text-secondary,#8e8e93)] hover:text-[var(--wa-text-primary,#fff)]"
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
                  ? "bg-[var(--wa-green,#25D366)]/15 text-[var(--wa-green,#25D366)]"
                  : "bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-secondary,#8e8e93)] hover:text-[var(--wa-text-primary,#fff)]"
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
                    ? "bg-[var(--wa-green,#25D366)]/15 text-[var(--wa-green,#25D366)]"
                    : "bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-secondary,#8e8e93)] hover:text-[var(--wa-text-primary,#fff)]"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <div className="mb-4 p-4 rounded-xl bg-[var(--wa-panel-header,#1a1a1a)] border border-[var(--wa-border,#2a2a2c)]">
            <h3 className="text-sm font-semibold text-[var(--wa-text-primary,#fff)] mb-3">
              {editing ? 'Edit Schedule' : 'New Schedule'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">Date & Time</label>
                <input type="datetime-local" value={matchDatetime} onChange={(e) => setMatchDatetime(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">Match Details</label>
                <input value={matchDetails} onChange={(e) => setMatchDetails(e.target.value)} placeholder="e.g. JDT vs Selangor"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] placeholder:text-[var(--wa-text-secondary,#8e8e93)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">Category</label>
                <input list="ppv-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Type or select"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] placeholder:text-[var(--wa-text-secondary,#8e8e93)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
                <datalist id="ppv-cats">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50">
                  {PPV_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">BCL Account</label>
                <input value={bclAccount} onChange={(e) => setBclAccount(e.target.value)} placeholder="Optional"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] placeholder:text-[var(--wa-text-secondary,#8e8e93)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">PIC</label>
                <input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Optional"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] placeholder:text-[var(--wa-text-secondary,#8e8e93)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-[var(--wa-text-secondary,#8e8e93)] uppercase tracking-wider">Remark</label>
                <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional notes"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] bg-[var(--wa-search-bg,#1a1a1a)] text-[var(--wa-text-primary,#fff)] placeholder:text-[var(--wa-text-secondary,#8e8e93)] focus:outline-none focus:border-[var(--wa-green,#25D366)]/50" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={resetForm}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--wa-border,#2a2a2c)] text-[var(--wa-text-secondary,#8e8e93)] hover:bg-[var(--wa-hover,#2a2a2c)]">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !matchDatetime || !matchDetails}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--wa-green,#25D366)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing ? 'Update' : 'Add'}
              </button>
            </div>
            {message && (
              <p className={cn("text-xs mt-2", message.error ? "text-red-400" : "text-emerald-400")}>{message.text}</p>
            )}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--wa-text-secondary,#8e8e93)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 text-[var(--wa-text-secondary,#8e8e93)] opacity-50" />
            <p className="text-sm text-[var(--wa-text-secondary,#8e8e93)]">No schedules found</p>
          </div>
        ) : (
          /* Schedule cards */
          <div className="space-y-3">
            {filtered.map((s) => {
              const dt = new Date(s.matchDatetime);
              const dateStr = dt.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
              const timeStr = dt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={s.id} className="p-4 rounded-xl bg-[var(--wa-panel-header,#1a1a1a)] border border-[var(--wa-border,#2a2a2c)] transition-colors hover:border-[var(--wa-border,#2a2a2c)]/80">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--wa-green,#25D366)]/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-[var(--wa-green,#25D366)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-[var(--wa-text-primary,#fff)]">{s.matchDetails}</h3>
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", statusColor(s.status))}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-[var(--wa-text-secondary,#8e8e93)]">{dateStr} · {timeStr}</span>
                        <span className="text-[11px] text-[var(--wa-text-secondary,#8e8e93)] bg-[var(--wa-search-bg,#1a1a1a)] px-2 py-0.5 rounded-md">{s.category}</span>
                      </div>
                      {(s.bclAccount || s.pic || s.remark) && (
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-[var(--wa-text-secondary,#8e8e93)]">
                          {s.bclAccount && <span>BCL: {s.bclAccount}</span>}
                          {s.pic && <span>PIC: {s.pic}</span>}
                          {s.remark && <span className="italic">{s.remark}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--wa-border,#2a2a2c)]">
                    {s.status !== 'completed' && (
                      <button onClick={() => handleMarkComplete(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                        <Check className="h-3.5 w-3.5" /> Complete
                      </button>
                    )}
                    <button onClick={() => openEdit(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-[var(--wa-text-secondary,#8e8e93)] hover:bg-[var(--wa-hover,#2a2a2c)] transition-colors">
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
