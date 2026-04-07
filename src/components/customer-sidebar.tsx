'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, User, Mail, Phone, MapPin, AlertCircle, Loader2, ExternalLink, ShieldCheck, Copy, Check } from 'lucide-react';

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
  protected_content?: ProtectedContent[];
  [key: string]: unknown;
};

type ProtectedContent = {
  title: string;
  granted_at?: string;
  url?: string;
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

function CopyButton({ text }: { text: string }) {
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
      title="Copy link"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ContentAccessItem({ content }: { content: ProtectedContent }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <ShieldCheck className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--wa-text-primary)] leading-snug truncate">
          {content.title}
        </p>
        {content.granted_at && (
          <p className="text-[10px] text-[var(--wa-text-secondary)]">
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
          <CopyButton text={content.url} />
        </div>
      )}
    </div>
  );
}

function TransactionCard({ tx }: { tx: Transaction }) {
  const relatedContent = tx.protected_content?.filter(pc => pc.url) ?? [];

  return (
    <div className="p-3 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-hover)]">
      {/* Row 1: order number + amount + status */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {tx.order_number && (
            <p className="text-sm font-semibold text-[var(--wa-text-primary)] truncate">
              {tx.order_number}
            </p>
          )}
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--wa-panel-bg)] text-[var(--wa-text-secondary)] whitespace-nowrap">
            {formatRM(tx.amount)}
          </span>
        </div>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 whitespace-nowrap flex-shrink-0 ml-2">
          Successful
        </span>
      </div>

      {/* Row 2: channel + date + receipt actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {tx.payment_channel && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 whitespace-nowrap">
              {tx.payment_channel}
            </span>
          )}
          <p className="text-[11px] text-[var(--wa-text-secondary)]">
            {formatDateTime(tx.created_at)}
          </p>
        </div>
        {tx.receipt_url && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <a
              href={tx.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-6 w-6 flex items-center justify-center rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 transition-colors"
              title="Download receipt PDF"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <CopyButton text={tx.receipt_url} />
          </div>
        )}
      </div>

      {/* Content access */}
      {relatedContent.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-black/15 dark:border-white/15 space-y-0.5">
          {relatedContent.map((content, i) => (
            <ContentAccessItem key={i} content={content} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerSidebar({ phoneNumber, open, onClose, inline = false }: Props) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCustomer = useCallback(async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/customers?phone=${encodeURIComponent(phoneNumber)}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ configured: true, found: false, error: 'Failed to fetch customer data' });
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  useEffect(() => {
    if ((open || inline) && phoneNumber) {
      fetchCustomer();
    }
    if (!open && !inline) {
      setData(null);
    }
  }, [open, inline, phoneNumber, fetchCustomer]);

  // Inline mode: render as a static panel
  if (inline) {
    return (
      <div className="w-[420px] flex-shrink-0 border-l border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex flex-col h-full">
        <div className="flex items-center h-[60px] px-4 border-b border-[var(--wa-border)] bg-[var(--wa-panel-bg)] flex-shrink-0">
          <h3 className="text-[13px] font-semibold text-[var(--wa-text-primary)]">
            Customer Info
          </h3>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <SidebarContent data={data} loading={loading} phoneNumber={phoneNumber} />
        </div>
      </div>
    );
  }

  // Overlay mode: slideover for smaller screens
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
            Customer Info
          </h3>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-[var(--wa-text-secondary)] hover:text-[var(--wa-text-primary)] hover:bg-[var(--wa-hover)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-60px)] p-4">
          <SidebarContent data={data} loading={loading} phoneNumber={phoneNumber} />
        </div>
      </div>
    </>
  );
}

function SidebarContent({ data, loading, phoneNumber }: { data: CustomerData | null; loading: boolean; phoneNumber: string }) {
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
                <h4 className="text-[17px] font-semibold text-[var(--wa-text-primary)] truncate leading-tight">
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
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0" />
                <span className="text-[var(--wa-text-primary)] truncate">{data.customer.email}</span>
              </div>
            )}

            {data.customer.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-[var(--wa-text-secondary)] flex-shrink-0" />
                <span className="text-[var(--wa-text-primary)]">{data.customer.phone}</span>
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
          {data.recentTransactions && data.recentTransactions.length > 0 && (() => {
            const successTxns = data.recentTransactions
              .filter(tx => tx.status === 'success' || tx.is_paid)
              .slice(0, 5);
            if (successTxns.length === 0) return null;
            return (
              <div className="border-t border-[var(--wa-border)] pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-1">
                  Recent Transactions
                </h5>
                <div className="space-y-2.5">
                  {successTxns.map((tx, i) => (
                    <TransactionCard key={tx.id || i} tx={tx} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Standalone content access */}
          {data.protectedContent && data.protectedContent.length > 0 && (
            (!data.recentTransactions || data.recentTransactions.filter(tx => tx.status === 'success' || tx.is_paid).length === 0) && (
              <div className="border-t border-[var(--wa-border)] pt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Content Access
                </h5>
                <div className="space-y-2">
                  {data.protectedContent.map((content, i) => (
                    <ContentAccessItem key={i} content={content} />
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
