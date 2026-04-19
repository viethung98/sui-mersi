'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ExternalLink, Star, ShoppingCart, Check } from 'lucide-react';
import type { Product } from '@/lib/types';

type Props = {
  product: Product;
  isInCart: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onViewCart: () => void;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          style={{
            fill: i <= Math.round(rating) ? 'var(--warning)' : 'var(--border)',
            color: i <= Math.round(rating) ? 'var(--warning)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}

export function ProductDetailSheet({ product, isInCart, onClose, onAddToCart, onViewCart }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="modal-enter app-panel-solid stitch-ghost-border relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden sm:max-h-[88dvh] sm:max-w-[460px]"
        style={{
          boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,255,0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="app-toolbar-button absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center text-(--text-muted) transition-colors hover:text-(--text-primary)"
        >
          <X size={14} />
        </button>

        {/* Hero image */}
        <div className="relative w-full aspect-[4/3] flex-none bg-(--surface-elevated) overflow-hidden">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            sizes="420px"
            priority
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
            style={{ background: 'linear-gradient(to top, var(--surface), transparent)' }}
          />
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <span
              className="stitch-label border border-[var(--landing-tertiary)]/35 bg-[var(--surface-elevated)] px-3 py-2 text-[8px] text-[var(--landing-tertiary)]"
            >
              {product.marketplace || 'Marketplace'}
            </span>
            {(product.productUrl ?? product.asin) && (
              <a
                href={product.productUrl ?? `https://www.amazon.com/dp/${product.asin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="stitch-label flex items-center gap-1 text-[8px] text-[var(--landing-primary)] hover:underline"
              >
                View on {product.marketplace || 'Amazon'} <ExternalLink size={10} />
              </a>
            )}
          </div>

          <h2 className="stitch-headline text-3xl leading-[0.95] text-(--text-primary)">
            {product.name}
          </h2>

          {product.rating != null && (
            <div className="flex items-center gap-2">
              <StarRating rating={product.rating} />
              <span className="text-[12px] font-bold text-(--text-primary)">{product.rating.toFixed(1)}</span>
              {product.reviewCount && (
                <span className="text-[11px] text-(--text-muted)">({product.reviewCount.toLocaleString()} reviews)</span>
              )}
            </div>
          )}

          <div
            className="flex items-center gap-3 border border-[var(--landing-outline)]/20 bg-[var(--surface-elevated)] px-4 py-4"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
          >
            <div
              className="flex h-7 w-7 flex-none items-center justify-center bg-(--primary) text-[10px] font-black text-white"
              style={{ background: 'var(--primary)' }}
            >
              $
            </div>
            <span className="text-xl font-black font-mono tracking-tight text-(--text-primary)">
              {(product.price / 100).toFixed(2)}
            </span>
            <span className="text-[11px] font-medium text-(--text-muted)">{product.currency}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-(--border) px-5 py-4">
          {isInCart ? (
            <button
              onClick={onViewCart}
              className="stitch-primary-button stitch-label flex w-full items-center justify-center gap-2 py-4 text-[10px]"
            >
              <Check size={13} />
              View Cart
            </button>
          ) : (
            <button
              onClick={() => onAddToCart(product)}
              className="stitch-secondary-button stitch-label flex w-full items-center justify-center gap-2 py-4 text-[10px]"
            >
              <ShoppingCart size={13} />
              Add to Cart
            </button>
          )}
          <button
            disabled
            className="stitch-label w-full border border-[var(--landing-outline)]/18 bg-(--surface-elevated) py-3 text-[9px] text-(--text-muted) cursor-not-allowed"
          >
            Buy with USDC — Coming Soon
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
