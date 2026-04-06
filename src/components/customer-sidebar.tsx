'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, User, Mail, Phone, MapPin, CreditCard, AlertCircle, Loader2 } from 'lucide-react';

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
  [key: string]: unknown;
};

type ProtectedContent = {
  title: string;
  granted_at?: string;
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
};

function formatRM(amount: number | string | undefined): string {
  if (amount == null) return 'RM 0.00';
  const cleaned = typeof amount === 'string' ? amount.replace(/[^0-9.\-]/g, '') : String(amount);
  const num = parseFloat(cleaned);
  return `RM ${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
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

export function CustomerSidebar({ phoneNumber, open, onClose }: Props) {
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
    if (open && phoneNumber) {
      fetchCustomer();
    }
    if (!open) {
      setData(null);
    }
  }, [open, phoneNumber, fetchCustomer]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`fixed top-0 right-0 h-full z-[70] w-full sm:w-[360px] bg-[var(--wa-panel-bg)] border-l border-[var(--wa-border)] shadow-2xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
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

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-60px)] p-4">
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
                Set the <code className="bg-[var(--wa-hover)] px-1.5 py-0.5 rounded text-xs">BCL_API_KEY</code> environment variable to enable customer lookup.
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
                      <p className="text-xs text-[var(--wa-text-secondary)]">First Transaction</p>
                      <p className="text-sm font-medium text-[var(--wa-text-primary)]">
                        {formatDateTime(data.stats.first_transaction_at)}
                      </p>
                    </div>
                    <div className="bg-[var(--wa-hover)] rounded-lg p-3">
                      <p className="text-xs text-[var(--wa-text-secondary)]">Last Transaction</p>
                      <p className="text-sm font-medium text-[var(--wa-text-primary)]">
                        {formatDateTime(data.stats.last_transaction_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent transactions — success only */}
              {data.recentTransactions && data.recentTransactions.length > 0 && (
                <div className="border-t border-[var(--wa-border)] pt-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-3">
                    Recent Transactions
                  </h5>
                  <div className="space-y-2">
                    {data.recentTransactions
                      .filter(tx => tx.status === 'success' || tx.is_paid)
                      .slice(0, 10)
                      .map((tx, i) => (
                      <div
                        key={tx.id || i}
                        className="p-3 bg-[var(--wa-hover)] rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-[var(--wa-text-primary)]">
                            {formatRM(tx.amount)}
                          </p>
                          {tx.payment_channel && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                              {tx.payment_channel}
                            </span>
                          )}
                        </div>
                        {tx.order_number && (
                          <p className="text-xs text-[var(--wa-text-secondary)]">
                            {tx.order_number}
                          </p>
                        )}
                        <p className="text-xs text-[var(--wa-text-secondary)] mt-0.5">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>
                    ))}
                    {data.recentTransactions.filter(tx => tx.status === 'success' || tx.is_paid).length === 0 && (
                      <p className="text-xs text-[var(--wa-text-secondary)] italic py-2">No successful transactions</p>
                    )}
                  </div>
                </div>
              )}

              {/* Protected content access */}
              {data.protectedContent && data.protectedContent.length > 0 && (
                <div className="border-t border-[var(--wa-border)] pt-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-[var(--wa-text-secondary)] mb-3">
                    Content Access
                  </h5>
                  <div className="space-y-2">
                    {data.protectedContent.map((content, i) => (
                      <div
                        key={i}
                        className="p-3 bg-[var(--wa-hover)] rounded-lg"
                      >
                        <p className="text-sm font-medium text-[var(--wa-text-primary)] leading-snug">
                          {content.title}
                        </p>
                        {content.granted_at && (
                          <p className="text-xs text-[var(--wa-text-secondary)] mt-1">
                            Granted: {formatDateTime(content.granted_at)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
