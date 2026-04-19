'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductDetailSheet } from './ProductDetailSheet';
import { DEBUG_CHAT_STREAM } from '@/lib/chat/debug';
import { useCartStore } from '@/lib/cart-store';
import { cartApi } from '@/lib/api/cart';
import type { Product } from '@/lib/types';

type Props = {
  products: Product[];
  intro?: string;
};

export function ProductCarousel({ products, intro }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { items: cartItems, open } = useCartStore();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const items = products.slice(0, 8);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    // Small delay to let layout settle before measuring
    const t = setTimeout(updateScrollState, 50);
    return () => clearTimeout(t);
  }, [products, updateScrollState]);

  useEffect(() => {
    if (!DEBUG_CHAT_STREAM) return;

    console.info('[chat-ui] product-carousel:render', {
      receivedCount: products.length,
      renderedCount: items.length,
      renderedProductIds: items.map((product) => product.id),
    });
  }, [products, items]);

  function scroll(dir: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  }

  function handleAddToCart(product: Product) {
    cartApi.addItem(product);
    open();
  }

  return (
    <div className="my-4 w-full">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">
            {intro ? intro : 'Matched_Inventory'}
          </p>
          <p className="mt-2 text-sm text-(--text-secondary)">Marketplace results ranked for your current request.</p>
        </div>
      </div>

      <div className="relative group/carousel">
        {/* Left edge */}
        <div
          className={`absolute bottom-2 left-0 top-0 z-10 flex w-16 items-center transition-opacity duration-200 ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'linear-gradient(to right, var(--bg) 20%, transparent)' }}
        >
          <button
            onClick={() => scroll('left')}
            className="app-toolbar-button pointer-events-auto ml-1 flex h-10 w-10 items-center justify-center"
            aria-label="Scroll left"
          >
            <ChevronLeft size={14} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex items-stretch gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-3"
          style={{ scrollbarWidth: 'none' }}
          onScroll={updateScrollState}
        >
          {items.map((product) => (
            <div key={product.id} className="snap-start self-stretch">
              <ProductCard
                product={product}
                isInCart={cartItems.some((i) => i.product.id === product.id)}
                onAddToCart={handleAddToCart}
                onViewCart={() => open()}
                onDetails={() => setSelectedProduct(product)}
              />
            </div>
          ))}
        </div>

        {/* Right edge */}
        <div
          className={`absolute bottom-2 right-0 top-0 z-10 flex w-16 items-center justify-end transition-opacity duration-200 ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ background: 'linear-gradient(to left, var(--bg) 20%, transparent)' }}
        >
          <button
            onClick={() => scroll('right')}
            className="app-toolbar-button pointer-events-auto mr-1 flex h-10 w-10 items-center justify-center"
            aria-label="Scroll right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          isInCart={cartItems.some((i) => i.product.id === selectedProduct.id)}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(p) => { handleAddToCart(p); setSelectedProduct(null); }}
          onViewCart={() => { setSelectedProduct(null); open(); }}
        />
      )}
    </div>
  );
}
