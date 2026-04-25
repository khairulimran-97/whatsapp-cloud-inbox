'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, User, Mail, Phone, MapPin, AlertCircle, Loader2, ExternalLink, ShieldCheck, Copy, Check, Search, KeyRound, Send, ChevronLeft, ChevronRight, Store, Ticket, Calendar, CheckCircle2 } from 'lucide-react';

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

type Participant = {
  id: number | string;
  match_sources?: string[];
  participant?: {
    name?: string;
    email?: string;
    phone?: string;
    ticket_name?: string;
    ticket_number?: string;
    seat_number?: string | null;
    status?: string;
    checked_in?: boolean;
    checked_in_at?: string | null;
    ticket_url?: string | null;
    custom_fields?: Record<string, unknown> | unknown[] | null;
  };
  event?: {
    id?: number | string;
    name?: string;
    slug?: string;
    starts_at?: string;
    ends_at?: string;
  };
  order?: {
    transaction_id?: string;
    order_number?: string;
    customer_id?: string;
    status?: string;
    status_code?: string | number;
    is_paid?: boolean;
    amount?: number;
    payer_name?: string;
    payer_email?: string;
    payer_phone?: string;
    created_at?: string;
  };
  created_at?: string;
  updated_at?: string;
};

type CustomerData = {
  configured: boolean;
  found?: boolean;
  customerFound?: boolean;
  customer?: Customer | null;
  stats?: Stats | null;
  recentTransactions?: Transaction[];
  protectedContent?: ProtectedContent[];
  participants?: Participant[];
  participantsSummary?: { total?: number; uniqueOrders?: number };
  error?: string;
};

type Props = {
  phoneNumber: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  panelWidth?: number;
  onInsertText?: (text: string) => void;
  allowedMerchantIds?: string[];
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

function CopyButton({ text, title = 'Copy', className, label }: { text: string; title?: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const defaultClass = 'h-6 w-6 flex items-center justify-center rounded-md text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors flex-shrink-0';

  return (
    <button
      onClick={handleCopy}
      className={className || defaultClass}
      title={title}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{copied ? 'Copied' : label}</span>}
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

function HoverDetails({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
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
        <span className="pointer-events-none absolute left-0 top-full mt-1 z-[100] min-w-[220px] max-w-[320px] px-2.5 py-2 text-[11px] text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-md shadow-lg break-words leading-snug">
          {content}
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

function matchSourceLabel(source: string): { label: string; className: string } {
  switch (source) {
    case 'attendee_phone':
      return { label: 'Attendee phone', className: 'bg-blue-500/10 text-blue-500 dark:text-blue-300' };
    case 'attendee_email':
      return { label: 'Attendee email', className: 'bg-blue-500/10 text-blue-500 dark:text-blue-300' };
    case 'buyer_phone':
      return { label: 'Buyer phone', className: 'bg-green-500/10 text-green-500 dark:text-green-300' };
    case 'buyer_email':
      return { label: 'Buyer email', className: 'bg-green-500/10 text-green-500 dark:text-green-300' };
    default:
      return { label: source, className: 'bg-gray-500/10 text-gray-500 dark:text-gray-300' };
  }
}

function ParticipantCard({ participant }: { participant: Participant }) {
  const p = participant.participant ?? {};
  const event = participant.event ?? {};
  const order = participant.order ?? {};
  const matches = participant.match_sources ?? [];
  const ticketUrl = p.ticket_url ?? undefined;
  const attendeePhoneMatch = matches.includes('attendee_phone');

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-[var(--wa-hover)] p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <HoverDetails
            content={
              <div className="space-y-0.5">
                <div className="font-semibold">{event.name || 'Event'}</div>
                {event.starts_at && <div>Starts: {formatDateTime(event.starts_at)}</div>}
                {event.ends_at && <div>Ends: {formatDateTime(event.ends_at)}</div>}
                {event.slug && <div className="opacity-70">Slug: {event.slug}</div>}
                {(p.ticket_name || p.ticket_number) && (
                  <div className="pt-1 border-t border-white/20 dark:border-black/20 mt-1">
                    <div>Ticket: {p.ticket_name || '—'}</div>
                    {p.ticket_number && <div>Number: {p.ticket_number}</div>}
                    {p.seat_number && <div>Seat: {p.seat_number}</div>}
                  </div>
                )}
              </div>
            }
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--wa-text-primary)] truncate max-w-full">
              <Calendar className="h-3.5 w-3.5 text-[var(--wa-text-secondary)] flex-shrink-0" />
              <span className="truncate">{event.name || 'Event'}</span>
            </span>
          </HoverDetails>
          {event.starts_at && (
            <p className="text-[11px] text-[var(--wa-text-secondary)] mt-0.5 pl-5">
              {formatDateTime(event.starts_at)}
            </p>
          )}
        </div>
        {p.checked_in && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 dark:text-green-300 whitespace-nowrap flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Checked in
          </span>
        )}
      </div>

      <div className="flex items-center flex-wrap gap-1">
        {matches.map((s) => {
          const m = matchSourceLabel(s);
          return (
            <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.className}`}>
              {m.label}
            </span>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-md border border-black/10 dark:border-white/15 bg-[var(--wa-panel-bg)]">
        <table className="w-full text-[12px] table-fixed">
          <tbody>
            <tr>
              <td className="px-2 py-1 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[72px] whitespace-nowrap border-r border-b border-black/15 dark:border-white/20">Ticket</td>
              <td className="px-2 py-1 text-[var(--wa-text-primary)] truncate border-b border-black/15 dark:border-white/20" title={p.ticket_name}>
                {p.ticket_name || '—'}{p.ticket_number ? ` · ${p.ticket_number}` : ''}{p.seat_number ? ` · Seat ${p.seat_number}` : ''}
              </td>
            </tr>
            <tr>
              <td className={`px-2 py-1 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[72px] whitespace-nowrap border-r border-b border-black/15 dark:border-white/20`}>Attendee</td>
              <td className="px-2 py-1 text-[var(--wa-text-primary)] truncate border-b border-black/15 dark:border-white/20">
                <span className={attendeePhoneMatch ? 'font-semibold' : ''}>{p.name || '—'}</span>
                {p.phone && (
                  <span className="text-[var(--wa-text-secondary)]"> · {p.phone}</span>
                )}
              </td>
            </tr>
            {(order.payer_phone || order.payer_email) && (
              <tr>
                <td className="px-2 py-1 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[72px] whitespace-nowrap border-r border-b border-black/15 dark:border-white/20">Buyer</td>
                <td className="px-2 py-1 text-[var(--wa-text-primary)] truncate border-b border-black/15 dark:border-white/20">
                  <HoverDetails
                    content={
                      <div className="space-y-0.5">
                        <div className="font-semibold">{order.payer_name || 'Buyer'}</div>
                        {order.payer_phone && <div>📱 {order.payer_phone}</div>}
                        {order.payer_email && <div>✉️ {order.payer_email}</div>}
                        {order.order_number && <div className="pt-1 border-t border-white/20 dark:border-black/20 mt-1">Order: {order.order_number}</div>}
                        {order.amount != null && <div>Amount: {formatRM(order.amount)}</div>}
                        {order.status && <div>Status: {order.status}</div>}
                        {order.created_at && <div className="opacity-70">Created: {formatDateTime(order.created_at)}</div>}
                      </div>
                    }
                  >
                    <span className="truncate">
                      {order.payer_phone || '—'}
                      {order.payer_phone && order.payer_email && <span className="text-[var(--wa-text-secondary)]"> · </span>}
                      {order.payer_email && <span className="text-[var(--wa-text-secondary)]">{order.payer_email}</span>}
                    </span>
                  </HoverDetails>
                </td>
              </tr>
            )}
            {order.order_number && (
              <tr>
                <td className="px-2 py-1 text-[var(--wa-text-secondary)] bg-black/5 dark:bg-white/5 w-[72px] whitespace-nowrap border-r border-black/15 dark:border-white/20">Order</td>
                <td className="px-2 py-1 text-[var(--wa-text-primary)] truncate">
                  {order.order_number}
                  {order.amount != null && (
                    <span className="text-[var(--wa-text-secondary)]"> · {formatRM(order.amount)}</span>
                  )}
                  {order.status && (
                    <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${order.is_paid ? 'bg-green-500/10 text-green-500 dark:text-green-300' : 'bg-yellow-500/10 text-yellow-500 dark:text-yellow-300'}`}>
                      {order.status}
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ticketUrl && (
        <div className="flex items-center gap-1.5">
          <a
            href={ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-[2] flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md bg-[var(--wa-green)]/10 text-[var(--wa-green)] hover:bg-[var(--wa-green)]/20 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open ticket
          </a>
          <CopyButton
            text={ticketUrl}
            title="Copy ticket URL"
            label="Copy"
            className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md bg-[var(--wa-hover)] text-[var(--wa-text-primary)] hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/15 transition-colors"
          />
        </div>
      )}
    </div>
  );
}

function MerchantSelector({ merchants, selected, onChange }: { merchants: BclMerchantInfo[]; selected: string; onChange: (id: string) => void }) {
  if (merchants.length === 0) return null;
  return (
    <div className="px-4 py-2 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex-shrink-0">
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
                    ? 'bg-violet-500 text-white shadow-sm'
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
  participants?: Participant[];
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
  const [resultsTab, setResultsTab] = useState<'tickets' | 'receipts'>('tickets');

  const ticketsCount = results?.participants?.length ?? 0;
  const receiptsCount = results?.data?.length ?? 0;
  const hasBoth = ticketsCount > 0 && receiptsCount > 0;

  // Default to whichever section has results when only one is populated
  useEffect(() => {
    if (!results) return;
    if (ticketsCount > 0 && receiptsCount === 0) setResultsTab('tickets');
    else if (receiptsCount > 0 && ticketsCount === 0) setResultsTab('receipts');
  }, [results, ticketsCount, receiptsCount]);

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
            placeholder="Order, ticket, email, phone..."
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
            <p className="text-xs font-medium text-[var(--wa-text-primary)]">Find an order or ticket</p>
            <p className="text-[11px] text-[var(--wa-text-secondary)] mt-1 leading-relaxed max-w-[220px]">
              Search by order ID, ticket number, email, or phone number
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
          {hasBoth && (
            <div className="flex gap-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg p-1">
              <button
                onClick={() => setResultsTab('tickets')}
                className={`flex-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
                  resultsTab === 'tickets'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]'
                }`}
              >
                Tickets <span className="opacity-70">({ticketsCount})</span>
              </button>
              <button
                onClick={() => setResultsTab('receipts')}
                className={`flex-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all ${
                  resultsTab === 'receipts'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)]'
                }`}
              >
                Receipts <span className="opacity-70">({results.meta?.total ?? receiptsCount})</span>
              </button>
            </div>
          )}

          {ticketsCount > 0 && (resultsTab === 'tickets' || !hasBoth) && (
            <div className="space-y-2">
              {!hasBoth && (
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wa-text-secondary)]">
                    Tickets
                  </h4>
                  <span className="text-[10px] text-[var(--wa-text-secondary)]">{ticketsCount}</span>
                </div>
              )}
              <div className="space-y-2.5">
                {results.participants!.map((p, i) => (
                  <ParticipantCard key={p.id ?? i} participant={p} />
                ))}
              </div>
            </div>
          )}

          {receiptsCount > 0 && (resultsTab === 'receipts' || !hasBoth) && (
            <div className="space-y-2">
              {!hasBoth && (
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wa-text-secondary)]">
                    Receipts
                  </h4>
                  {results.meta && (
                    <span className="text-[10px] text-[var(--wa-text-secondary)]">{results.meta.total}</span>
                  )}
                </div>
              )}
              <div className="space-y-2.5">
                {results.data!.map((tx, i) => (
                  <LookupResultCard key={tx.order_number || tx.id || i} tx={tx} onInsertText={onInsertText} />
                ))}
              </div>
            </div>
          )}

          {ticketsCount === 0 && receiptsCount === 0 && (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <Search className="h-8 w-8 text-[var(--wa-text-secondary)] opacity-50" />
              <p className="text-xs text-[var(--wa-text-secondary)]">No matches found</p>
            </div>
          )}

          {/* Pagination — receipts only */}
          {results.meta && results.meta.last_page > 1 && (resultsTab === 'receipts' || !hasBoth) && receiptsCount > 0 && (
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
    <div className="flex border-b border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] flex-shrink-0">
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

export function CustomerSidebar({ phoneNumber, open, onClose, inline = false, panelWidth, onInsertText, allowedMerchantIds }: Props) {
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
  const [merchantsReady, setMerchantsReady] = useState(false);

  useEffect(() => {
    fetch('/api/bcl-merchants')
      .then(r => r.json())
      .then(d => {
        const all: BclMerchantInfo[] = d.merchants || [];
        // Filter by allowed merchant IDs from WA profile (empty = show all)
        const list = allowedMerchantIds && allowedMerchantIds.length > 0
          ? all.filter(m => allowedMerchantIds.includes(m.id))
          : all;
        setMerchants(list);
        if (list.length > 0 && !selectedMerchant) {
          const def = list.find((m: BclMerchantInfo) => m.isDefault) || list[0];
          setSelectedMerchant(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setMerchantsReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedMerchantIds]);

  const fetchCustomer = useCallback(async () => {
    if (!phoneNumber || !merchantsReady) return;
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
  }, [phoneNumber, selectedMerchant, merchantsReady]);

  useEffect(() => {
    if ((open || inline) && phoneNumber && merchantsReady) {
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
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          <div className={activeTab !== 'customer' ? 'hidden' : ''}>
            <InfoContent data={data} loading={loading} phoneNumber={phoneNumber} onInsertText={onInsertText} />
          </div>
          <div className={activeTab !== 'lookup' ? 'hidden' : 'pt-4'}>
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
        className={`fixed top-0 right-0 h-full z-[70] w-full sm:w-[420px] bg-[var(--wa-panel-bg)] border-l border-[var(--wa-border)] shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between h-[60px] px-4 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex-shrink-0">
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
        <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-4">
          <div className={activeTab !== 'customer' ? 'hidden' : ''}>
            <InfoContent data={data} loading={loading} phoneNumber={phoneNumber} onInsertText={onInsertText} />
          </div>
          <div className={activeTab !== 'lookup' ? 'hidden' : 'pt-4'}>
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
            No customer or participant found for
          </p>
          <p className="text-sm font-medium text-[var(--wa-text-primary)]">{phoneNumber}</p>
        </div>
      )}

      {!loading && data && data.configured && data.found && (
        <div className="space-y-5">
          {data.customer ? (
            <>
              <div className="sticky top-0 -mx-4 px-4 pt-4 pb-3 bg-[var(--wa-panel-bg)] z-10 border-b border-[var(--wa-border)] space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[var(--wa-green)] flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-[var(--wa-text-primary)] truncate leading-tight" title={data.customer.name}>
                      {data.customer.name}
                    </h4>
                    {data.customer.tin && (
                      <p className="text-[11px] text-[var(--wa-text-secondary)] mt-0.5">
                        TIN: {data.customer.tin}
                      </p>
                    )}
                  </div>
                </div>

                {(data.customer.email || data.customer.phone) && (
                  <div className="flex items-center gap-3 text-[12px] flex-wrap">
                    {data.customer.email && (
                      <div className="flex items-center gap-1.5 group min-w-0">
                        <Mail className="h-3.5 w-3.5 text-[var(--wa-text-secondary)] flex-shrink-0" />
                        <span className="text-[var(--wa-text-primary)] truncate" title={data.customer.email}>{data.customer.email}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <CopyButton text={data.customer.email} title="Copy email" />
                        </div>
                      </div>
                    )}

                    {data.customer.phone && (
                      <div className="flex items-center gap-1.5 group min-w-0">
                        <Phone className="h-3.5 w-3.5 text-[var(--wa-text-secondary)] flex-shrink-0" />
                        <span className="text-sm leading-none">{getPhoneFlag(data.customer.phone)}</span>
                        <span className="text-[var(--wa-text-primary)] truncate">{data.customer.phone}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <CopyButton text={data.customer.phone} title="Copy phone" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {formatAddress(data.customer.address) && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0 mt-0.5" />
                  <span className="text-[var(--wa-text-primary)] leading-relaxed">
                    {formatAddress(data.customer.address)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <Ticket className="h-4 w-4 text-amber-500 dark:text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--wa-text-primary)]">
                  No customer record for {phoneNumber}
                </p>
                <p className="text-xs text-[var(--wa-text-secondary)] mt-0.5">
                  This phone appears as a participant on {data.participantsSummary?.total ?? data.participants?.length ?? 0} ticket(s) below.
                </p>
              </div>
            </div>
          )}

          {/* Transaction stats */}
          {data.customer && data.stats && (
            <div className="pt-3">
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
          {data.customer && data.recentTransactions && data.recentTransactions.length > 0 && (
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

          {/* Participants / Event Tickets */}
          {data.participants && data.participants.length > 0 && (
            <div className="border-t border-black/10 dark:border-white/15 pt-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-2 flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" />
                Event Tickets
                <span className="text-[10px] font-medium text-[var(--wa-text-secondary)]/80 normal-case tracking-normal">
                  · {data.participantsSummary?.total ?? data.participants.length} ticket(s)
                  {data.participantsSummary?.uniqueOrders ? ` · ${data.participantsSummary.uniqueOrders} order(s)` : ''}
                </span>
              </h5>
              <div className="space-y-2.5">
                {data.participants.map((p, i) => (
                  <ParticipantCard key={p.id ?? i} participant={p} />
                ))}
              </div>
            </div>
          )}

          {/* Standalone content access */}
          {data.customer && data.protectedContent && data.protectedContent.length > 0 && (
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
