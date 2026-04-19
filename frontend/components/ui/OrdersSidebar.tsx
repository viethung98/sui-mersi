'use client';

import { useEffect, useState } from 'react';
import { X, Package, ChevronDown, ExternalLink } from 'lucide-react';
import { useOrdersStore } from '@/lib/orders-store';
import { listOrders, type OrderSummary } from '@/lib/api/checkout';
type LineItem = { metadata?: { name?: string; imageUrl?: string }; title?: string };

type Filters = { type: string; phase: string; status: string };

function phaseTag(phase: string) {
  switch (phase) {
    case 'completed':
    case 'delivered':
      return 'bg-(--success)/15 text-(--success) border-(--success)/30';
    case 'payment_confirmed':
      return 'bg-(--primary)/15 text-(--primary-light) border-(--primary)/30';
    case 'delivery':
      return 'bg-(--warning)/15 text-(--warning) border-(--warning)/30';
    case 'failed':
      return 'bg-(--error)/15 text-(--error) border-(--error)/30';
    default:
      return 'bg-(--surface) text-(--text-muted) border-(--border)';
  }
}

function statusTag(status: string) {
  switch (status) {
    case 'delivered':
      return 'bg-(--success)/15 text-(--success) border-(--success)/30';
    case 'payment_confirmed':
      return 'bg-(--primary)/15 text-(--primary-light) border-(--primary)/30';
    case 'in_progress':
      return 'bg-(--warning)/15 text-(--warning) border-(--warning)/30';
    case 'cancelled':
      return 'bg-(--error)/15 text-(--error) border-(--error)/30';
    default:
      return 'bg-(--surface) text-(--text-muted) border-(--border)';
  }
}

function SkeletonCard() {
  return (
    <div className="app-panel stitch-ghost-border p-3.5 animate-pulse">
      <div className="flex justify-between items-start mb-2.5">
        <div className="h-3 w-2/3 bg-(--border)" />
        <div className="h-3 w-12 bg-(--border)" />
      </div>
      <div className="flex gap-1.5 mt-2">
        <div className="h-4 w-14 bg-(--border)" />
        <div className="h-4 w-16 bg-(--border)" />
        <div className="h-4 w-14 bg-(--border)" />
      </div>
      <div className="mt-2 h-2.5 w-20 bg-(--border)" />
    </div>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const lineItems = order.lineItems as LineItem[] | undefined;
  const first = lineItems?.[0];
  const name = order.item?.productName ?? first?.metadata?.name ?? first?.title ?? (order.type === 'deposit' ? 'Deposit' : 'Order');
  const price = order.quote?.totalPrice?.amount
    ? `$${parseFloat(order.quote.totalPrice.amount).toFixed(2)}`
    : order.item
      ? `$${(order.item.price / 100).toFixed(2)}`
      : null;
  const txUrl = order.tx_hash ? `https://testnet.suivision.xyz/txblock/${order.tx_hash}` : null;
  const date = new Date(order.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="stitch-hover-surface app-panel stitch-ghost-border group p-3.5 transition-all duration-200">
      <div className="flex justify-between items-start gap-2">
        <p className="text-xs font-semibold leading-snug text-(--text-primary) line-clamp-2 flex-1 tracking-tight">
          {name}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {price && (
            <span className="font-mono text-sm font-semibold text-(--success) tabular-nums">
              {price}
            </span>
          )}
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View transaction ${order.tx_hash} on Suivision`}
              className="flex h-7 w-7 items-center justify-center border border-(--border) bg-(--surface-elevated) text-(--text-secondary) transition-colors hover:border-(--primary)/40 hover:text-(--primary-light)"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <span className="stitch-label border bg-(--primary)/15 px-2 py-1 text-[8px] text-(--primary-light) border-(--primary)/30">
          {order.type}
        </span>
        <span className={`stitch-label border px-2 py-1 text-[8px] ${phaseTag(order.phase)}`}>
          {order.phase}
        </span>
        <span className={`stitch-label border px-2 py-1 text-[8px] ${statusTag(order.status)}`}>
          {order.status}
        </span>
      </div>

      <p className="text-[10px] text-(--text-muted) mt-2 tabular-nums">{date}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="stitch-label w-full appearance-none border border-(--border) bg-(--surface-elevated) px-2.5 py-2 pr-6 text-[9px] text-(--text-secondary) cursor-pointer transition-colors focus:outline-none focus:border-(--primary)/50"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-muted) pointer-events-none" />
    </div>
  );
}

export function OrdersSidebar() {
  const { isOpen, close } = useOrdersStore();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ type: '', phase: '', status: '' });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadOrders = async () => {
      await Promise.resolve();
      if (cancelled) return;

      setLoading(true);
      setError(null);

      try {
        const data = await listOrders({ limit: 50 });
        if (!cancelled) setOrders(data.orders);
      } catch {
        if (!cancelled) setError('Failed to load orders.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const filtered = orders.filter((o) => {
    if (filters.type && o.type !== filters.type) return false;
    if (filters.phase && o.phase !== filters.phase) return false;
    if (filters.status && o.status !== filters.status) return false;
    return true;
  });

  // Derive unique values for filter options
  const types = [...new Set(orders.map((o) => o.type))];
  const phases = [...new Set(orders.map((o) => o.phase))];
  const statuses = [...new Set(orders.map((o) => o.status))];

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={close} aria-hidden="true" />

      <div className="app-panel-solid fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-[var(--landing-outline)]/20 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 stitch-grid opacity-10" />
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-(--border) px-5 py-5">
          <div className="flex items-center gap-2.5">
            <Package size={14} className="text-(--primary-light)" />
            <div>
              <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Orders Panel</p>
              <h2 className="stitch-headline mt-2 text-2xl text-(--text-primary)">Orders</h2>
            </div>
            {!loading && orders.length > 0 && (
              <span className="stitch-label border bg-(--primary)/15 px-2 py-1 text-[8px] text-(--primary-light) border-(--primary)/30 tabular-nums">
                {filtered.length}
              </span>
            )}
          </div>
          <button
            onClick={close}
            aria-label="Close orders"
            className="app-toolbar-button flex h-9 w-9 items-center justify-center text-(--text-secondary) transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="relative flex gap-2 border-b border-(--border) px-4 py-3">
          <FilterSelect
            label="All Types"
            value={filters.type}
            options={types}
            onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
          />
          <FilterSelect
            label="All Phases"
            value={filters.phase}
            options={phases}
            onChange={(v) => setFilters((f) => ({ ...f, phase: v }))}
          />
          <FilterSelect
            label="All Status"
            value={filters.status}
            options={statuses}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          />
        </div>

        {/* Body */}
        <div className="relative flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : error ? (
            <p className="text-xs text-(--error) text-center mt-10">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="mt-16 flex flex-col items-center justify-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-(--border) bg-(--surface-elevated)">
                <Package size={18} className="text-(--text-muted)" />
              </div>
              <p className="text-sm text-(--text-muted)">No orders yet.</p>
            </div>
          ) : (
            filtered.map((order) => <OrderCard key={order.orderId} order={order} />)
          )}
        </div>
      </div>
    </>
  );
}
