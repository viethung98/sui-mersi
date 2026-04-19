'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ShoppingCart, ClipboardList } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { useOrdersStore } from '@/lib/orders-store';
import logoImage from '@/app/logo.jpg';
import { UserMenu } from './UserMenu';
import { WalletBalance } from '@/components/ui/WalletBalance';
import { DepositModal } from '@/components/ui/DepositModal';

export function AppHeader() {
  const { items, open } = useCartStore();
  const openOrders = useOrdersStore((s) => s.open);
  const cartCount = items.length;
  const [depositOpen, setDepositOpen] = useState(false);

  return (
    <header className="stitch-nav-backdrop relative z-20 flex h-[72px] flex-none items-center gap-4 border-b border-[var(--landing-outline)]/20 px-4 sm:px-6">
      <div className="pointer-events-none absolute inset-0 stitch-grid opacity-10" />

      <Link href="/app" className="relative z-10 flex shrink-0 items-center gap-3">
        <Image src={logoImage} alt="Mersi" width={36} height={36} className="h-9 w-9 rounded-none object-cover" />
        <div className="flex flex-col">
          <span className="stitch-headline text-2xl font-bold leading-none text-[var(--landing-primary)]">Mersi</span>
          <span className="stitch-label mt-1 text-[9px] text-[var(--landing-outline-bright)]">Shopping Terminal</span>
        </div>
      </Link>

      <div className="relative z-10 flex-1" />

      <div className="relative z-10 flex items-center gap-2 sm:gap-3">
        <WalletBalance />

        <button
          onClick={openOrders}
          aria-label="Orders"
          className="app-toolbar-button stitch-label hidden h-11 items-center gap-2 px-4 text-[10px] sm:inline-flex"
        >
          <ClipboardList size={14} />
          Orders
        </button>

        <button
          onClick={open}
          aria-label="Cart"
          className="app-toolbar-button relative inline-flex h-11 items-center gap-2 px-4"
        >
          <ShoppingCart size={15} />
          <span className="stitch-label hidden text-[10px] sm:inline">Cart</span>
          {cartCount > 0 && (
            <span className="stitch-label absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-[var(--landing-tertiary)] px-1 text-[8px] text-black">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>

        <UserMenu onDepositClick={() => setDepositOpen(true)} />
      </div>

      {depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}
    </header>
  );
}
