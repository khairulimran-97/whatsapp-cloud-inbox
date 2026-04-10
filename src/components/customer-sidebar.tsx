'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, User, Mail, Phone, MapPin, AlertCircle, Loader2, ExternalLink, ShieldCheck, Copy, Check, Search, KeyRound, Send, ChevronLeft, ChevronRight, Store } from 'lucide-react';

type Address = {
  address_lines?: string[];
  city?: string;
  postal_zone?: string;
  state?: string;
  country?: string;
};

type Customer = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  tin?: string;
  identification_number?: string;
  identification_scheme?: string;
  address?: Address;
};

type Stats = {
  transaction_count?: number;
  paid_transaction_count?: number;
  paid_amount?: number;
  first_transaction_at?: string;
  last_transaction_at?: string;
};

type Transaction = {
  id?: string;
  order_number?: string;
  amount?: number | string;
  status?: string;
  payment_channel?: string;
  is_paid?: boolean;
  created_at?: string;
  receipt_url?: string | null;
  payer_name?: string;
  payer_email?: string;
  payer_telephone_number?: string;
  status_description?: string;
  protected_content?: ProtectedContent[];
  [key: string]: unknown;
};

type ProtectedContent = {
  title: string;
  granted_at?: string;
  url?: string;
  access_token?: string;
};

type CustomerData = {
  configured: boolean;
  found?: boolean;
  customer?: Customer;
  stats?: Stats;
  recentTransactions?: Transaction[];
  protectedContent?: ProtectedContent[];
  error?: string;
};

type Props = {
  phoneNumber: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  panelWidth?: number;
  onInsertText?: (text: string) => void;
};

function formatRM(amount: number | string | undefined): string {
  if (amount == null) return 'RM 0.00';
  const cleaned = typeof amount === 'string' ? amount.replace(/[^0-9.\-]/g, '') : String(amount);
  const num = parseFloat(cleaned);
  return `RM ${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatAddress(address: Address | undefined): string | null {
  if (!address) return null;
  const parts: string[] = [];
  if (address.address_lines?.length) parts.push(address.address_lines.join(', '));
  if (address.postal_zone) parts.push(address.postal_zone);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.country && address.country !== 'MYS') parts.push(address.country);
  return parts.length > 0 ? parts.join(', ') : null;
}

function extractAccessToken(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

function getPhoneFlag(phone?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  const prefixes: [string, string][] = [
    ['60', '🇲🇾'], ['65', '🇸🇬'], ['62', '🇮🇩'], ['66', '🇹🇭'],
    ['63', '🇵🇭'], ['84', '🇻🇳'], ['856', '🇱🇦'], ['855', '🇰🇭'],
    ['95', '🇲🇲'], ['673', '🇧🇳'], ['91', '🇮🇳'], ['86', '🇨🇳'],
    ['81', '🇯🇵'], ['82', '🇰🇷'], ['61', '🇦🇺'], ['44', '🇬🇧'],
    ['1', '🇺🇸'], ['971', '🇦🇪'], ['966', '🇸🇦'],
  ];
  for (const [prefix, flag] of prefixes) {
    if (clean.startsWith(prefix)) return flag;
  }
  return '🌐';
}

function CopyButton({ text, title = 'Copy' }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="h-6 w-6 flex items-center justify-center rounded-md text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors flex-shrink-0"
      title={title}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-block max-w-full cursor-pointer"
      onClick={() => setShow(v => !v)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="pointer-events-none absolute left-0 top-full mt-1 z-[100] max-w-[280px] px-2 py-1 text-[11px] text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-md shadow-lg whitespace-normal break-words leading-snug">
          {text}
        </span>
      )}
    </span>
  );
}

function MagicLinkButton({ content, onInsertText }: { content: ProtectedContent; onInsertText?: (text: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const accessToken = content.access_token || (content.url ? extractAccessToken(content.url) : null);

  const handleGenerate = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate');
        return;
      }
      setMagicUrl(data.magic_url || data.data?.magic_url || null);
      if (!data.magic_url && !data.data?.magic_url) {
        setError('No magic URL returned');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!magicUrl) return;
    try {
      await navigator.clipboard.writeText(magicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleSend = () => {
    if (magicUrl && onInsertText) {
      onInsertText(magicUrl);
    }
  };

  if (!accessToken) return null;

  if (magicUrl) {
    return (
      <div className="mt-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border-b border-violet-500/15">
          <KeyRound className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[11px] font-semibold text-violet-400">Magic Link</span>
          <span className="text-[10px] text-violet-400/60 ml-auto">5 min · 3 uses</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] text-[var(--wa-text-primary)] break-all font-mono leading-relaxed bg-black/5 dark:bg-white/5 rounded px-2 py-1.5">{magicUrl}</p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {onInsertText && (
              <button
                onClick={handleSend}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)] transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Send to Chat
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg text-violet-400 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/30 transition-all disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        {loading ? 'Generating...' : 'Generate Magic Link'}
      </button>
      {error && (
        <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function ContentAccessItem({ content, onInsertText }: { content: ProtectedContent; onInsertText?: (text: string) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Tooltip text={content.title}>
            <p className="text-[13px] font-medium text-[var(--wa-text-primary)] leading-snug truncate">
              {content.title}
            </p>
          </Tooltip>
          {content.granted_at && (
            <p className="text-[11px] text-[var(--wa-text-secondary)]">
              {formatDateTime(content.granted_at)}
            </p>
          )}
        </div>
        {content.url && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 flex items-center justify-center rounded-md text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
              title="Open content"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <CopyButton text={content.url} title="Copy content URL" />
          </div>
        )}
      </div>
      <MagicLinkButton content={content} onInsertText={onInsertText} />
    </div>
  );
}

function getStatusStyle(status?: string) {
  switch (status) {
    case 'success':
    case 'completed':
      return 'bg-green-500/15 text-green-400';
    case 'pending':
      return 'bg-amber-500/15 text-amber-400';
    case 'failed':
    case 'cancelled':
      return 'bg-red-500/15 text-red-400';
    default:
      return 'bg-[var(--wa-panel-bg)] text-[var(--wa-text-secondary)]';
  }
}

function getStatusLabel(status?: string) {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function TransactionCard({ tx, onInsertText }: { tx: Transaction; onInsertText?: (text: string) => void }) {
  const relatedContent = tx.protected_content?.filter(pc => pc.url) ?? [];
  const isPaid = tx.status === 'success' || tx.status === 'completed' || tx.is_paid;

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/15 bg-[var(--wa-hover)] overflow-hidden">
      <div className={`h-[3px] ${isPaid ? 'bg-green-500' : tx.status === 'pending' ? 'bg-amber-500' : 'bg-red-500/60'}`} />
      <div className="p-3 space-y-2">
        {/* Order number + amount */}
        <div className="flex items-center justify-between">
          {tx.order_number && (
            tx.receipt_url ? (
              <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-[var(--wa-green)] underline decoration-[var(--wa-green)]/40 hover:decoration-[var(--wa-green)] truncate font-mono" title={tx.order_number}>
                {tx.order_number}
              </a>
            ) : (
              <p className="text-[13px] font-bold text-[var(--wa-text-primary)] truncate font-mono" title={tx.order_number}>
                {tx.order_number}
              </p>
            )
          )}
          <span className="text-sm font-bold text-[var(--wa-text-primary)] whitespace-nowrap flex-shrink-0 ml-2">
            {formatRM(tx.amount)}
          </span>
        </div>

        {/* Status + channel + date */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${getStatusStyle(tx.status)}`}>
            {getStatusLabel(tx.status)}
          </span>
          {tx.payment_channel && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 whitespace-nowrap">
              {tx.payment_channel}
            </span>
          )}
          <span className="text-[11px] text-[var(--wa-text-secondary)] ml-auto">
            {formatDateTime(tx.created_at)}
          </span>
        </div>

        {/* Content access */}
        {relatedContent.length > 0 && (
          <div className="pt-1.5 mt-1 border-t border-black/10 dark:border-white/15 space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-1">Protected Content</p>
            {relatedContent.map((content, i) => (
              <ContentAccessItem key={i} content={content} onInsertText={onInsertText} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Enhanced card for lookup search results
function LookupResultCard({ tx, onInsertText }: { tx: Transaction; onInsertText?: (text: string) => void }) {
  const relatedContent = tx.protected_content?.filter(pc => pc.url) ?? [];
  const isPaid = tx.status === 'success' || tx.status === 'completed' || tx.is_paid;

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/15 bg-[var(--wa-hover)] overflow-hidden">
      <div className={`h-[3px] ${isPaid ? 'bg-green-500' : tx.status === 'pending' ? 'bg-amber-500' : 'bg-red-500/60'}`} />
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {tx.order_number && (
              tx.receipt_url ? (
                <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[var(--wa-green)] underline decoration-[var(--wa-green)]/40 hover:decoration-[var(--wa-green)] truncate font-mono" title={tx.order_number}>
                  {tx.order_number}
                </a>
              ) : (
                <p className="text-sm font-bold text-[var(--wa-text-primary)] truncate font-mono" title={tx.order_number}>
                  {tx.order_number}
                </p>
              )
            )}
          </div>
          <span className="text-[15px] font-bold text-[var(--wa-text-primary)] whitespace-nowrap flex-shrink-0 ml-2">
            {formatRM(tx.amount)}
          </span>
        </div>

        {(tx.payer_name || tx.payer_email || tx.payer_telephone_number) && (
          <div className="rounded-lg overflow-hidden border border-black/15 dark:border-white/20">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {tx.payer_name && (
                  <tr>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[70px] whitespace-nowrap border-r border-b border-black/15 dark:border-white/20">Name</td>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-primary)] font-medium truncate border-b border-black/15 dark:border-white/20" title={tx.payer_name}>{getPhoneFlag(tx.payer_telephone_number)} {tx.payer_name}</td>
                  </tr>
                )}
                {tx.payer_email && (
                  <tr>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[70px] whitespace-nowrap border-r border-b border-black/15 dark:border-white/20">Email</td>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-primary)] truncate border-b border-black/15 dark:border-white/20">{tx.payer_email}</td>
                  </tr>
                )}
                {tx.payer_telephone_number && (
                  <tr>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[70px] whitespace-nowrap border-r border-black/15 dark:border-white/20">Phone</td>
                    <td className="px-2.5 py-1.5 text-[var(--wa-text-primary)] truncate">{tx.payer_telephone_number}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${getStatusStyle(tx.status)}`}>
            {getStatusLabel(tx.status)}
          </span>
          {tx.payment_channel && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 whitespace-nowrap">
              {tx.payment_channel}
            </span>
          )}
          <span className="text-[11px] text-[var(--wa-text-secondary)] ml-auto">
            {formatDateTime(tx.created_at)}
          </span>
        </div>

        {relatedContent.length > 0 && (
          <div className="pt-1.5 mt-1 border-t border-black/10 dark:border-white/15 space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-1">Protected Content</p>
            {relatedContent.map((content, i) => (
              <ContentAccessItem key={i} content={content} onInsertText={onInsertText} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MerchantSelector({ merchants, selected, onChange }: { merchants: BclMerchantInfo[]; selected: string; onChange: (id: string) => void }) {
  if (merchants.length <= 1) return null;
  return (
    <div className="px-4 py-2 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)]">
      <div className="flex items-center gap-2">
        <Store className="h-3 w-3 text-[var(--wa-text-secondary)] flex-shrink-0" />
        <div className="flex gap-1 flex-wrap flex-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-1">
          {merchants.map(m => {
            const isActive = m.id === selected;
            return (
              <button
                key={m.id}
                onClick={() => onChange(m.id)}
                className={`text-[11px] font-medium px-3 py-1 rounded-md transition-all flex-1 min-w-0 truncate ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Orders Tab ---

type OrdersSearchResult = {
  configured: boolean;
  success?: boolean;
  data?: Transaction[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
  summary?: { total_count: number; success_count: number; pending_count: number; failed_count: number };
  error?: string;
};

type OrdersTabProps = {
  onInsertText?: (text: string) => void;
  query: string;
  setQuery: (q: string) => void;
  results: OrdersSearchResult | null;
  setResults: (r: OrdersSearchResult | null) => void;
  page: number;
  setPage: (p: number) => void;
  merchantId?: string;
};

function OrdersTab({ onInsertText, query, setQuery, results, setResults, page, setPage, merchantId }: OrdersTabProps) {
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), page: String(p), per_page: '10' });
      if (merchantId) params.set('merchant_id', merchantId);
      const res = await fetch(`/api/transactions/search?${params}`);
      const data = await res.json();
      setResults(data);
      setPage(p);
    } catch {
      setResults({ configured: true, error: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [setResults, setPage, merchantId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query, 1);
  };

  // Re-search when merchant changes
  useEffect(() => {
    if (query.trim() && results) {
      handleSearch(query, 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  return (
    <div className="space-y-3">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order ID, email, phone..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-[var(--wa-border)] bg-[var(--wa-search-bg)] text-[var(--wa-text-primary)] placeholder:text-[var(--wa-text-secondary)] focus:outline-none focus:border-[var(--wa-green)]/50"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)] transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
        </button>
      </form>

      {/* Empty state — before any search */}
      {!results && !loading && (
        <div className="flex flex-col items-center py-12 gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-[var(--wa-hover)] flex items-center justify-center">
            <Search className="h-6 w-6 text-[var(--wa-text-secondary)] opacity-60" />
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--wa-text-primary)]">Find an order</p>
            <p className="text-[11px] text-[var(--wa-text-secondary)] mt-1 leading-relaxed max-w-[200px]">
              Search by order ID, email, or phone number
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {loading && !results && (
        <div className="flex flex-col items-center py-10 gap-2">
          <Loader2 className="h-6 w-6 text-[var(--wa-green)] animate-spin" />
          <p className="text-xs text-[var(--wa-text-secondary)]">Searching…</p>
        </div>
      )}

      {results && !results.configured && (
        <div className="flex flex-col items-center py-10 gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-[var(--wa-text-secondary)] opacity-50" />
          <p className="text-xs text-[var(--wa-text-secondary)]">BCL API key not configured</p>
        </div>
      )}

      {results && results.configured && results.error && (
        <div className="flex flex-col items-center py-10 gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-400 opacity-50" />
          <p className="text-xs text-red-400">{results.error}</p>
        </div>
      )}

      {results && results.configured && !results.error && (
        <>
          {/* Transaction list */}
          {results.data && results.data.length > 0 ? (
            <div className="space-y-2.5">
              {results.data.map((tx, i) => (
                <LookupResultCard key={tx.order_number || tx.id || i} tx={tx} onInsertText={onInsertText} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <Search className="h-8 w-8 text-[var(--wa-text-secondary)] opacity-50" />
              <p className="text-xs text-[var(--wa-text-secondary)]">No transactions found</p>
            </div>
          )}

          {/* Pagination */}
          {results.meta && results.meta.last_page > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => handleSearch(query, page - 1)}
                disabled={loading || page <= 1}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="text-xs text-[var(--wa-text-secondary)]">
                {page} / {results.meta.last_page} <span className="text-[var(--wa-text-secondary)]/60">({results.meta.total})</span>
              </span>
              <button
                onClick={() => handleSearch(query, page + 1)}
                disabled={loading || page >= results.meta!.last_page}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors disabled:opacity-30"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Tab UI ---

type TabId = 'customer' | 'lookup';

function TabBar({ activeTab, onChangeTab }: { activeTab: TabId; onChangeTab: (tab: TabId) => void }) {
  const tabs: { id: TabId; label: string; color: string; bg: string }[] = [
    { id: 'customer', label: 'Customer', color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/[0.06]' },
    { id: 'lookup', label: 'Lookup', color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-500/[0.06]' },
  ];

  return (
    <div className="flex border-b border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-all relative ${
              isActive
                ? `${tab.color} ${tab.bg}`
                : 'text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
            }`}
          >
            {tab.label}
            {isActive && (
              <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${tab.id === 'customer' ? 'bg-blue-500' : 'bg-orange-500'}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Main Sidebar ---

type BclMerchantInfo = {
  id: string;
  name: string;
  apiKey: string;
  isDefault: boolean | null;
};

export function CustomerSidebar({ phoneNumber, open, onClose, inline = false, panelWidth, onInsertText }: Props) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('customer');
  // Lift lookup state so it persists across tab switches
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<OrdersSearchResult | null>(null);
  const [lookupPage, setLookupPage] = useState(1);
  // Multi-merchant
  const [merchants, setMerchants] = useState<BclMerchantInfo[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<string>('');

  useEffect(() => {
    fetch('/api/bcl-merchants')
      .then(r => r.json())
      .then(d => {
        const list = d.merchants || [];
        setMerchants(list);
        if (list.length > 0 && !selectedMerchant) {
          const def = list.find((m: BclMerchantInfo) => m.isDefault) || list[0];
          setSelectedMerchant(def.id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCustomer = useCallback(async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setData(null);
    try {
      const params = new URLSearchParams({ phone: phoneNumber });
      if (selectedMerchant) params.set('merchant_id', selectedMerchant);
      const res = await fetch(`/api/customers?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ configured: true, found: false, error: 'Failed to fetch customer data' });
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, selectedMerchant]);

  useEffect(() => {
    if ((open || inline) && phoneNumber) {
      fetchCustomer();
    }
    if (!open && !inline) {
      setData(null);
      setActiveTab('customer');
      setLookupQuery('');
      setLookupResults(null);
      setLookupPage(1);
    }
  }, [open, inline, phoneNumber, fetchCustomer]);

  // Inline mode
  if (inline) {
    return (
      <div
        className="flex-shrink-0 border-l border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex flex-col h-full"
        style={{ width: panelWidth || 420, maxWidth: '100vw' }}
      >
        <div className="flex items-center h-[60px] px-4 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex-shrink-0">
          <h3 className="text-[13px] font-semibold text-[var(--wa-text-primary)]">
            Customer
          </h3>
        </div>
        <TabBar activeTab={activeTab} onChangeTab={setActiveTab} />
        <MerchantSelector merchants={merchants} selected={selectedMerchant} onChange={setSelectedMerchant} />
        <div className="overflow-y-auto flex-1 p-4">
          <div className={activeTab !== 'customer' ? 'hidden' : ''}>
            <InfoContent data={data} loading={loading} phoneNumber={phoneNumber} onInsertText={onInsertText} />
          </div>
          <div className={activeTab !== 'lookup' ? 'hidden' : ''}>
            <OrdersTab onInsertText={onInsertText} query={lookupQuery} setQuery={setLookupQuery} results={lookupResults} setResults={setLookupResults} page={lookupPage} setPage={setLookupPage} merchantId={selectedMerchant} />
          </div>
        </div>
      </div>
    );
  }

  // Overlay mode
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full z-[70] w-full sm:w-[420px] bg-[var(--wa-panel-bg)] border-l border-[var(--wa-border)] shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-[60px] px-4 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)]">
          <h3 className="text-[15px] font-semibold text-[var(--wa-text-primary)]">
            Customer
          </h3>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <TabBar activeTab={activeTab} onChangeTab={setActiveTab} />
        <MerchantSelector merchants={merchants} selected={selectedMerchant} onChange={setSelectedMerchant} />
        <div className="overflow-y-auto h-[calc(100%-60px-41px)] p-4">
          <div className={activeTab !== 'customer' ? 'hidden' : ''}>
            <InfoContent data={data} loading={loading} phoneNumber={phoneNumber} onInsertText={onInsertText} />
          </div>
          <div className={activeTab !== 'lookup' ? 'hidden' : ''}>
            <OrdersTab onInsertText={onInsertText} query={lookupQuery} setQuery={setLookupQuery} results={lookupResults} setResults={setLookupResults} page={lookupPage} setPage={setLookupPage} merchantId={selectedMerchant} />
          </div>
        </div>
      </div>
    </>
  );
}

function InfoContent({ data, loading, phoneNumber, onInsertText }: { data: CustomerData | null; loading: boolean; phoneNumber: string; onInsertText?: (text: string) => void }) {
  return (
    <>
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 text-[var(--wa-green)] animate-spin" />
          <p className="text-sm text-[var(--wa-text-secondary)]">Looking up customer…</p>
        </div>
      )}

      {!loading && data && !data.configured && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <AlertCircle className="h-10 w-10 text-[var(--wa-text-secondary)] opacity-50" />
          <p className="text-sm text-[var(--wa-text-secondary)]">
            BCL integration not configured
          </p>
          <p className="text-xs text-[var(--wa-text-secondary)] opacity-70">
            Configure the BCL API key in <strong>Settings</strong> (⚙️) to enable customer lookup.
          </p>
        </div>
      )}

      {!loading && data && data.configured && !data.found && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <User className="h-10 w-10 text-[var(--wa-text-secondary)] opacity-50" />
          <p className="text-sm text-[var(--wa-text-secondary)]">
            No customer found for
          </p>
          <p className="text-sm font-medium text-[var(--wa-text-primary)]">{phoneNumber}</p>
        </div>
      )}

      {!loading && data && data.configured && data.found && data.customer && (
        <div className="space-y-5">
          {/* Customer profile */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-[var(--wa-green)] flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[17px] font-semibold text-[var(--wa-text-primary)] truncate leading-tight" title={data.customer.name}>
                  {data.customer.name}
                </h4>
                {data.customer.tin && (
                  <p className="text-xs text-[var(--wa-text-secondary)] mt-0.5">
                    TIN: {data.customer.tin}
                  </p>
                )}
              </div>
            </div>

            {data.customer.email && (
              <div className="flex items-center gap-3 text-sm group">
                <Mail className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0" />
                <span className="text-[var(--wa-text-primary)] truncate flex-1">{data.customer.email}</span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <CopyButton text={data.customer.email} title="Copy email" />
                </div>
              </div>
            )}

            {data.customer.phone && (
              <div className="flex items-center gap-3 text-sm group">
                <Phone className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0" />
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-base leading-none">{getPhoneFlag(data.customer.phone)}</span>
                  <span className="text-[var(--wa-text-primary)]">{data.customer.phone}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <CopyButton text={data.customer.phone} title="Copy phone" />
                </div>
              </div>
            )}

            {formatAddress(data.customer.address) && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0 mt-0.5" />
                <span className="text-[var(--wa-text-primary)] leading-relaxed">
                  {formatAddress(data.customer.address)}
                </span>
              </div>
            )}
          </div>

          {/* Transaction stats */}
          {data.stats && (
            <div className="border-t border-[var(--wa-border)] pt-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-3">
                Transaction Stats
              </h5>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--wa-hover)] rounded-lg p-3">
                  <p className="text-xs text-[var(--wa-text-secondary)]">Total</p>
                  <p className="text-lg font-semibold text-[var(--wa-text-primary)]">
                    {data.stats.transaction_count ?? 0}
                  </p>
                </div>
                <div className="bg-[var(--wa-hover)] rounded-lg p-3">
                  <p className="text-xs text-[var(--wa-text-secondary)]">Paid</p>
                  <p className="text-lg font-semibold text-[var(--wa-green)]">
                    {data.stats.paid_transaction_count ?? 0}
                  </p>
                </div>
                <div className="bg-[var(--wa-hover)] rounded-lg p-3 col-span-2">
                  <p className="text-xs text-[var(--wa-text-secondary)]">Total Paid Amount</p>
                  <p className="text-lg font-semibold text-[var(--wa-text-primary)]">
                    {formatRM(data.stats.paid_amount)}
                  </p>
                </div>
                <div className="bg-[var(--wa-hover)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--wa-text-secondary)]">First Transaction</p>
                  <p className="text-xs font-medium text-[var(--wa-text-primary)] mt-0.5">
                    {formatDateTime(data.stats.first_transaction_at)}
                  </p>
                </div>
                <div className="bg-[var(--wa-hover)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--wa-text-secondary)]">Last Transaction</p>
                  <p className="text-xs font-medium text-[var(--wa-text-primary)] mt-0.5">
                    {formatDateTime(data.stats.last_transaction_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recent transactions */}
          {data.recentTransactions && data.recentTransactions.length > 0 && (
              <div className="border-t border-black/10 dark:border-white/15 pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-2">
                  Recent Transactions
                </h5>
                <div className="space-y-2.5">
                  {data.recentTransactions.map((tx, i) => (
                    <TransactionCard key={tx.id || i} tx={tx} onInsertText={onInsertText} />
                  ))}
                </div>
              </div>
          )}

          {/* Standalone content access */}
          {data.protectedContent && data.protectedContent.length > 0 && (
            (!data.recentTransactions || data.recentTransactions.length === 0) && (
              <div className="border-t border-[var(--wa-border)] pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Content Access
                </h5>
                <div className="space-y-2">
                  {data.protectedContent.map((content, i) => (
                    <ContentAccessItem key={i} content={content} onInsertText={onInsertText} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}
