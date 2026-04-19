'use client';

import { useUsdxmBalance } from '@/lib/api/balance';

export function WalletBalance() {
  const { data: balance, isLoading, isError } = useUsdxmBalance();

  if (isLoading) {
    return (
      <div
        className="balance-shimmer h-6 w-28 rounded-full"
        aria-label="Loading balance"
      />
    );
  }

  const amount =
    !isError && balance != null
      ? parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';

  return (
    <div
      className="app-panel stitch-ghost-border flex h-11 select-none items-center gap-3 px-3"
      title={`USDXM balance on Base Sepolia: ${amount}`}
    >
      <span
        className="stitch-status-dot h-2 w-2 shrink-0"
        style={{ animation: 'orbBreathe 2.8s ease-in-out infinite' }}
      />
      <span className="font-mono text-[11px] text-(--text-primary) tracking-tight tabular-nums leading-none">
        {amount}
      </span>
      <span className="stitch-label text-[8px] text-(--text-muted) leading-none">
        USDXM
      </span>
    </div>
  );
}
