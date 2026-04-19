'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { User, LogOut, Wallet, Mail, Circle, ArrowDownToLine } from 'lucide-react';
import { useAuth } from '@crossmint/client-sdk-react-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/lib/api/profile';
import { useCartStore } from '@/lib/cart-store';
import { useOrdersStore } from '@/lib/orders-store';
import { useProductDetailStore } from '@/lib/product-detail-store';
import { useSessionStore } from '@/lib/session-store';

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function walletStatusColor(status: string) {
  if (status === 'active') return 'text-(--success)';
  if (status === 'pending') return 'text-(--warning)';
  return 'text-(--text-muted)';
}

interface UserMenuProps {
  onDepositClick: () => void;
}

export function UserMenu({ onDepositClick }: UserMenuProps) {
  const { logout } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();

  async function handleLogout() {
    useSessionStore.getState().clearSession();
    useCartStore.getState().reset();
    useOrdersStore.getState().reset();
    useProductDetailStore.getState().close();
    queryClient.clear();
    await logout();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Account"
          className="app-toolbar-button stitch-label relative inline-flex h-11 items-center gap-2 px-4 text-[10px] outline-none data-[state=open]:text-(--text-primary)"
        >
          <User size={14} />
          Auth
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="app-panel-solid stitch-ghost-border z-50 min-w-[248px] p-2"
          style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)', animation: 'slideDown 0.15s cubic-bezier(0.16,1,0.3,1)' }}
        >
          {/* User info section */}
          <div className="px-3 py-3 mb-1">
            <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Auth Session</p>
            <div className="mt-3 flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center bg-(--primary) shrink-0 text-white">
                <User size={13} className="text-white" />
              </div>
              <span className="stitch-headline text-sm font-bold text-(--text-primary) truncate">
                {isLoading ? 'Loading…' : profile?.email ?? '—'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail size={11} className="text-(--text-muted) shrink-0" />
                <span className="text-[11px] text-(--text-secondary) truncate">
                  {profile?.email ?? '—'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Wallet size={11} className="text-(--text-muted) shrink-0" />
                <span className="text-[11px] font-mono text-(--text-secondary) truncate flex-1">
                  {profile?.walletAddress ? truncateAddress(profile.walletAddress) : 'No wallet'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Circle size={7} className={`shrink-0 fill-current ${walletStatusColor(profile?.walletStatus ?? '')}`} />
                <span className={`text-[11px] capitalize ${walletStatusColor(profile?.walletStatus ?? '')}`}>
                  {profile?.walletStatus ?? '—'}
                </span>
              </div>
            </div>
          </div>

          <DropdownMenu.Separator className="h-px bg-[var(--landing-outline)]/20 mx-1 mb-1" />

          <DropdownMenu.Item
            onSelect={onDepositClick}
            className="stitch-hover-surface flex items-center gap-2.5 px-3 py-3 text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors cursor-pointer outline-none"
          >
            <ArrowDownToLine size={13} />
            <span className="stitch-label text-[10px]">Deposit Funds</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={handleLogout}
            className="stitch-hover-surface flex items-center gap-2.5 px-3 py-3 text-sm text-(--text-secondary) hover:text-(--error) transition-colors cursor-pointer outline-none"
          >
            <LogOut size={13} />
            <span className="stitch-label text-[10px]">Sign Out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
