import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import logoImage from '@/app/logo.jpg';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { ProductCarousel } from '@/components/ui/ProductCarousel';
import { DEBUG_CHAT_STREAM } from '@/lib/chat/debug';
import type { ChatMessage, MemwalActivityData } from '@/lib/chat/types';
import type { Product } from '@/lib/types';

// Remove lines that are just a bare URL — redundant when product cards are shown
function removeStandaloneUrls(text: string): string {
  return text
    .replace(/^[ \t]*https?:\/\/\S+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

function parseSuggestions(text: string): { mainText: string; suggestions: string[] } {
  // Primary: **Suggestions:** or similar explicit bold header
  const strictMatch = text.match(/\*{0,2}Suggestions[^a-zA-Z\n]*\n((?:- .+\n?)+)\s*$/);
  if (strictMatch?.index !== undefined) {
    const suggestions = strictMatch[1]
      .split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim()).filter(Boolean);
    return { mainText: text.slice(0, strictMatch.index).trimEnd(), suggestions };
  }

  // Fallback: any "lead-in sentence ending with colon:\n- short bullets" at the end of the text
  const looseMatch = text.match(/\n\n([^\n]+:\n)((?:- .{1,60}\n?){2,})\s*$/);
  if (looseMatch?.index !== undefined) {
    const suggestions = looseMatch[2]
      .split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim()).filter(Boolean);
    if (suggestions.length >= 2) {
      return { mainText: text.slice(0, looseMatch.index).trimEnd(), suggestions };
    }
  }

  return { mainText: text, suggestions: [] };
}

// Tools whose results contain product listings
const PRODUCT_TOOLS = new Set([
  'searchProducts',
  'search_products',
  'showProducts',
  'show_products',
  'getProductDetails',
  'get_product_details',
]);

type RememberMemoryResult = {
  success?: boolean;
  text?: string;
  message?: string;
};

// Normalise varying backend product shapes → our Product type
function normalizeProduct(item: unknown): Product | null {
  if (!item || typeof item !== 'object') return null;
  const p = item as Record<string, unknown>;
  if (!p.id || !p.name) return null;

  const rawPrice = typeof p.price === 'number' ? p.price : 0;
  const currency = p.currency === 'USDC' ? 'USDC' : 'USD';

  return {
    id: String(p.id),
    name: String(p.name),
    price: rawPrice,
    currency,
    imageUrl: String(p.imageUrl ?? p.image ?? ''),
    marketplace: String(p.marketplace ?? p.retailer ?? p.brand ?? ''),
    productUrl: p.product_url ? String(p.product_url) : (p.productUrl ? String(p.productUrl) : undefined),
    asin: p.asin ? String(p.asin) : undefined,
    rating: typeof p.rating === 'number' ? p.rating : undefined,
    reviewCount: p.reviewCount != null ? String(p.reviewCount) : undefined,
  };
}

function extractProducts(result: unknown): Product[] | null {
  if (!result) return null;
  if (Array.isArray(result)) {
    const mapped = result.map(normalizeProduct).filter((p): p is Product => p !== null);
    return mapped.length > 0 ? mapped : null;
  }
  const r = result as Record<string, unknown>;
  for (const key of ['products', 'results', 'items', 'data']) {
    if (Array.isArray(r[key])) {
      const mapped = (r[key] as unknown[]).map(normalizeProduct).filter((p): p is Product => p !== null);
      if (mapped.length > 0) return mapped;
    }
  }
  // Single product result
  const single = normalizeProduct(result);
  return single ? [single] : null;
}

function parseRememberMemoryResult(result: unknown): RememberMemoryResult | null {
  if (!result || typeof result !== 'object') return null;
  const value = result as Record<string, unknown>;
  if (
    typeof value.message !== 'string' &&
    typeof value.text !== 'string' &&
    typeof value.success !== 'boolean'
  ) {
    return null;
  }

  return {
    success: typeof value.success === 'boolean' ? value.success : undefined,
    text: typeof value.text === 'string' ? value.text : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
  };
}

function parseMemwalActivityData(data: unknown): MemwalActivityData | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;

  if (
    value.source !== 'memwal' ||
    typeof value.status !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.namespace !== 'string' ||
    typeof value.query !== 'string' ||
    !Array.isArray(value.memories) ||
    typeof value.injectedIntoPrompt !== 'boolean'
  ) {
    return null;
  }

  return {
    source: 'memwal',
    status: value.status as MemwalActivityData['status'],
    message: value.message,
    namespace: value.namespace,
    query: value.query,
    injectedIntoPrompt: value.injectedIntoPrompt,
    memories: value.memories.flatMap((memory): MemwalActivityData['memories'] => {
      if (!memory || typeof memory !== 'object') return [];
      const entry = memory as Record<string, unknown>;
      if (typeof entry.text !== 'string' || typeof entry.blobId !== 'string') return [];
      return [{
        text: entry.text,
        blobId: entry.blobId,
        distance: typeof entry.distance === 'number' ? entry.distance : null,
      }];
    }),
  };
}

function shortenProofId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatDistance(distance: number | null): string {
  if (distance == null || Number.isNaN(distance)) return 'n/a';
  return distance.toFixed(3);
}

// Animated dots shown while the assistant hasn't produced any content yet
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--primary-light)',
            opacity: 0.5,
            animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function MessageBubble({ message, onSuggestion }: { message: ChatMessage; onSuggestion?: (text: string) => void }) {
  const isUser = message.role === 'user';
  const isEmpty = message.parts.length === 0;

  const renderedParts = message.parts.map((part, i) => {
    if (part.type === 'text') {
      if (isUser) {
        return (
          <div
            key={i}
            className="ml-auto max-w-[78%] border border-[var(--landing-outline)]/22 border-r-[4px] border-r-[var(--landing-primary)] bg-[rgba(42,42,42,0.72)] p-5 md:p-6"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">User_Query</span>
              <span className="stitch-label text-[9px] text-[var(--landing-primary)]">Live</span>
            </div>
            <p className="text-base leading-8 text-(--text-primary) md:text-lg">{part.text}</p>
          </div>
        );
      }

      const { mainText, suggestions: fullSuggestions } = parseSuggestions(removeStandaloneUrls(part.text));

      return (
        <div key={i}>
          <div className="prose-chat max-w-none">
            <ReactMarkdown>{mainText}</ReactMarkdown>
          </div>
          {fullSuggestions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {fullSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onSuggestion?.(s)}
                  className="app-command-pill stitch-hover-surface flex items-center gap-2 px-3 py-2 text-[11px] text-(--text-primary) transition-all duration-150"
                >
                  <span className="stitch-label text-[8px] text-[var(--landing-tertiary)]">&gt;</span>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (part.type === 'tool-loading') {
      if (DEBUG_CHAT_STREAM) {
        console.debug('[chat-ui] tool-loading:render', {
          messageId: message.id,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
        });
      }

      return (
        <div key={i} className="mt-8">
          <LoadingCard count={3} />
        </div>
      );
    }

    if (part.type === 'tool-result' && PRODUCT_TOOLS.has(part.toolName)) {
      const products = extractProducts(part.result);

      if (DEBUG_CHAT_STREAM) {
        console.info('[chat-ui] tool-result:render-attempt', {
          messageId: message.id,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          productCount: products?.length ?? 0,
          rawResult: part.result,
          normalizedProducts: products,
        });
      }

      if (products && products.length > 0) {
        return (
          <div key={i} className="mt-8">
            <ProductCarousel products={products} />
          </div>
        );
      }

      if (DEBUG_CHAT_STREAM) {
        console.warn('[chat-ui] tool-result:no-products-rendered', {
          messageId: message.id,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          rawResult: part.result,
        });
      }
    }

    if (part.type === 'tool-result' && part.toolName === 'rememberMemory') {
      const memoryResult = parseRememberMemoryResult(part.result);

      if (!memoryResult) return null;

      const success = memoryResult.success !== false;

      return (
        <div
          key={i}
          className={`mt-6 border px-4 py-4 md:px-5 ${
            success
              ? 'border-[var(--landing-tertiary)]/30 bg-[rgba(157,255,32,0.08)]'
              : 'border-[var(--error)]/30 bg-[rgba(255,133,120,0.08)]'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p
              className={`stitch-label text-[9px] ${
                success ? 'text-[var(--landing-tertiary)]' : 'text-[var(--error)]'
              }`}
            >
              {success ? 'Memory Stored' : 'Memory Save Failed'}
            </p>
            <p className="stitch-label text-[8px] text-[var(--landing-outline-bright)]">MemWal</p>
          </div>
          {memoryResult.text ? (
            <p className="mt-3 text-sm leading-7 text-(--text-primary)">{memoryResult.text}</p>
          ) : null}
          {memoryResult.message ? (
            <p className="mt-2 text-xs leading-6 text-(--text-secondary)">{memoryResult.message}</p>
          ) : null}
        </div>
      );
    }

    if (part.type === 'data-memwal-activity') {
      const activity = parseMemwalActivityData(part.data);

      if (!activity) return null;

      const statusTone =
        activity.status === 'success'
          ? 'border-[var(--landing-tertiary)]/30 bg-[rgba(157,255,32,0.08)]'
          : activity.status === 'loading'
            ? 'border-[var(--landing-primary)]/30 bg-[rgba(255,255,255,0.04)]'
            : activity.status === 'error'
              ? 'border-[var(--error)]/30 bg-[rgba(255,133,120,0.08)]'
              : 'border-[var(--landing-outline)]/24 bg-[rgba(255,255,255,0.03)]';

      const statusLabel =
        activity.status === 'loading'
          ? 'Memory Recall Running'
          : activity.status === 'success'
            ? 'Memory Recall Applied'
            : activity.status === 'empty'
              ? 'No Matching Memory'
              : activity.status === 'disabled'
                ? 'Memory Recall Disabled'
                : 'Memory Recall Failed';

      return (
        <div key={i} className={`mt-6 border px-4 py-4 md:px-5 ${statusTone}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  activity.status === 'loading' ? 'animate-pulse bg-[var(--landing-primary)]' : 'bg-[var(--landing-tertiary)]'
                }`}
              />
              <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">{statusLabel}</p>
            </div>
            <p className="stitch-label text-[8px] text-[var(--landing-tertiary)]">MemWal</p>
          </div>

          <p className="mt-3 text-sm leading-7 text-(--text-primary)">{activity.message}</p>

          {activity.memories.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm leading-7 text-(--text-primary)">
              {activity.memories.map((memory) => (
                <li key={memory.blobId} className="flex gap-3">
                  <span className="mt-[0.45rem] h-1.5 w-1.5 flex-none rounded-full bg-[var(--landing-tertiary)]" />
                  <span>{memory.text}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="stitch-label border border-[var(--landing-outline)]/20 px-2 py-1 text-[8px] text-[var(--landing-outline-bright)]">
              {activity.injectedIntoPrompt ? 'Injected Into Prompt' : 'Not Injected'}
            </span>
            <span className="stitch-label border border-[var(--landing-outline)]/20 px-2 py-1 text-[8px] text-[var(--landing-outline-bright)]">
              {activity.memories.length} {activity.memories.length === 1 ? 'Memory' : 'Memories'}
            </span>
          </div>

          {DEBUG_CHAT_STREAM ? (
            <div className="mt-4 border-t border-[var(--landing-outline)]/20 pt-4">
              <p className="stitch-label text-[8px] text-[var(--landing-outline-bright)]">Proof</p>
              <p className="mt-2 break-all font-mono text-[11px] leading-6 text-(--text-secondary)">
                namespace: {activity.namespace}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] leading-6 text-(--text-secondary)">
                query: {activity.query}
              </p>
              {activity.memories.map((memory) => (
                <p key={`${memory.blobId}-proof`} className="mt-1 font-mono text-[11px] leading-6 text-(--text-secondary)">
                  blob: {shortenProofId(memory.blobId)} | distance: {formatDistance(memory.distance)}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    return null;
  });

  return (
    <div className={`msg-enter ${isUser ? 'w-full py-4' : 'w-full py-8'}`}>
      {isUser ? (
        renderedParts
      ) : (
        <div className="flex items-start gap-4 md:gap-6">
          <div className="mt-1 flex h-11 w-11 flex-none items-center justify-center border border-[var(--landing-primary)]/40 bg-[var(--landing-primary)] text-white">
            <Image src={logoImage} alt="Mersi" width={20} height={20} className="h-5 w-5 object-cover" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-6">
              <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">Agent Active / Curating</p>
              <h3 className="stitch-headline mt-3 text-3xl leading-[0.92] text-white md:text-4xl">
                Mersi // Results Ready
              </h3>
            </div>

            {isEmpty ? <ThinkingDots /> : renderedParts}
          </div>
        </div>
      )}
    </div>
  );
}
