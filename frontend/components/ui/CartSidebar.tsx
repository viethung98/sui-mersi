'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { cartApi } from '@/lib/api/cart';
import { CheckoutModal } from './CheckoutModal';

type CheckoutTarget = { backendId: string; name: string; price: number };

export function CartSidebar() {
  const { items, isOpen, close } = useCartStore();
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  const subtotal = items.reduce((sum, i) => sum + i.product.price / 100, 0);

  const handleCheckoutDone = () => {
    if (checkoutTarget) {
      // Item was deleted by backend during checkout — remove from local state
      const { items: currentItems, remove } = useCartStore.getState();
      const item = currentItems.find((i) => i.backendId === checkoutTarget.backendId);
      if (item) remove(item.product.id);
    }
    setCheckoutTarget(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="app-panel-solid fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-[var(--landing-outline)]/20 shadow-xl">
        <div className="pointer-events-none absolute inset-0 stitch-grid opacity-10" />
        <div className="relative flex items-center justify-between border-b border-(--border) px-5 py-5">
          <div>
            <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Cart Panel</p>
            <h2 className="stitch-headline mt-2 text-2xl text-(--text-primary)">Your Cart</h2>
          </div>
          <button onClick={close} aria-label="Close cart" className="app-toolbar-button flex h-9 w-9 items-center justify-center text-(--text-secondary)">
            <X size={18} />
          </button>
        </div>

        <div className="relative flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {items.length === 0 ? (
            <div className="mt-10">
              <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">No Items</p>
              <p className="mt-4 text-sm leading-6 text-(--text-muted)">Add products from chat results to stage them for checkout.</p>
            </div>
          ) : (
            items.map(({ product, backendId }) => (
              <div key={product.id} className="app-panel stitch-ghost-border flex items-start gap-3 p-3">
                <div className="relative h-16 w-16 flex-none overflow-hidden bg-(--surface-elevated)">
                  <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="stitch-headline text-lg leading-[0.95] text-(--text-primary)">
                    {product.name}
                  </p>
                  <p className="stitch-label mt-2 text-[8px] text-(--text-muted)">
                    {product.marketplace || 'Marketplace'}
                  </p>
                  <p className="mt-2 text-xs text-(--text-secondary) font-mono">
                    ${(product.price / 100).toFixed(2)}
                  </p>
                  {backendId && (
                    <button
                      onClick={() =>
                        setCheckoutTarget({ backendId, name: product.name, price: product.price })
                      }
                      className="stitch-label mt-3 flex items-center gap-1 text-[9px] text-[var(--landing-primary)] transition-colors hover:text-[var(--landing-tertiary)]"
                    >
                      <ShoppingBag size={10} />
                      Buy
                    </button>
                  )}
                </div>
                <button
                  onClick={() => cartApi.removeItem(product.id)}
                  aria-label="Remove item"
                  className="app-toolbar-button flex h-8 w-8 items-center justify-center text-(--text-muted)"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="relative border-t border-(--border) px-5 py-4">
            <div className="flex justify-between text-sm">
              <span className="stitch-label text-[9px] text-(--text-secondary)">Subtotal</span>
              <span className="font-mono font-semibold text-[var(--landing-primary)]">${subtotal.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {checkoutTarget && (
        <CheckoutModal
          cartItemId={checkoutTarget.backendId}
          itemName={checkoutTarget.name}
          itemPrice={checkoutTarget.price}
          onDone={handleCheckoutDone}
          onBack={() => setCheckoutTarget(null)}
        />
      )}
    </>
  );
}
