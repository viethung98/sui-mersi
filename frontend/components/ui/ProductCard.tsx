'use client';

import Image from 'next/image';
import { ShoppingCart, Eye, Check } from 'lucide-react';
import type { Product } from '@/lib/types';

type Props = {
  product: Product;
  variant?: 'carousel' | 'grid';
  isInCart?: boolean;
  onAddToCart: (product: Product) => void;
  onViewCart?: (product: Product) => void;
  onDetails: (product: Product) => void;
};

export function ProductCard({ product, variant = 'carousel', isInCart = false, onAddToCart, onViewCart, onDetails }: Props) {
  const isGrid = variant === 'grid';

  return (
    <div
      className={`product-card app-panel-solid stitch-ghost-border group/card ${
        isGrid ? 'w-full min-h-[640px]' : 'flex-none w-[300px] h-[680px]'
      } flex flex-col overflow-hidden`}
    >
      <div className={`relative ${isGrid ? 'h-[240px]' : 'h-[300px]'} overflow-hidden bg-(--surface-elevated)`}>
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-500 group-hover/card:scale-[1.04]"
          sizes={isGrid ? '(max-width: 768px) 50vw, 25vw' : '300px'}
          priority
        />
        <div
          className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--surface) 20%, transparent)' }}
        />
        <span
          className="stitch-label absolute left-4 top-4 border border-[var(--landing-tertiary)]/35 bg-[rgba(19,19,19,0.82)] px-3 py-2 text-[8px] text-[var(--landing-tertiary)]"
        >
          {product.marketplace || 'Marketplace'}
        </span>
        <div className="absolute inset-x-0 top-0 h-px bg-[var(--landing-primary)]/80" />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="stitch-headline h-[9.25rem] overflow-hidden text-2xl leading-[0.95] text-(--text-primary) line-clamp-5">
          {product.name}
        </p>

        <p className="stitch-label mt-3 text-[8px] text-(--text-muted)">
          {product.currency} / {product.marketplace || 'verified retailer'}
        </p>

        <div className="mt-6 flex min-h-[2.25rem] items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-black font-mono tracking-tight text-[var(--landing-primary)]">
              {(product.price / 100).toFixed(2)}
            </span>
            <span className="stitch-label text-[8px] text-(--text-muted)">{product.currency}</span>
          </div>
          {product.rating && (
            <div className="flex items-center gap-0.5">
              <span className="text-[10px]" style={{ color: 'var(--tertiary)' }}>★</span>
              <span className="text-[11px] font-medium text-(--text-secondary)">{product.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex gap-2 pt-5">
          {isInCart ? (
            <button
              onClick={() => onViewCart?.(product)}
              className="stitch-primary-button stitch-label flex h-12 flex-1 items-center justify-center gap-2 px-4 text-[9px]"
            >
              <Check size={11} />
              View Cart
            </button>
          ) : (
            <button
              onClick={() => onAddToCart(product)}
              className="stitch-secondary-button stitch-label flex h-12 flex-1 items-center justify-center gap-2 px-4 text-[9px]"
            >
              <ShoppingCart size={11} />
              Add to Cart
            </button>
          )}
          <button
            onClick={() => onDetails(product)}
            className="app-toolbar-button flex h-12 w-12 flex-none items-center justify-center"
            aria-label="View details"
          >
            <Eye size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
