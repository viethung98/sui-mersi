'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/lib/chat/types';

const SUGGESTIONS = [
  'Summer dresses',
  'Running shoes',
  'Minimalist watch',
  'Linen trousers',
  '/remember I prefer neutral sneakers',
  '/remember keep me under $150',
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
});

type Props = {
  messages: ChatMessage[];
  isStreaming?: boolean;
  onSuggestion?: (text: string) => void;
};

export function ChatWindow({ messages, onSuggestion }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      prevLengthRef.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="relative flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col px-4 pb-6 pt-16 md:px-8 md:pt-20">
        <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col justify-center py-10 select-none">
              <motion.div className="max-w-4xl" {...fadeUp(0.1)}>
                <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">[AGENT_READY]</p>
                <h2 className="stitch-headline mt-5 text-5xl leading-[0.88] text-white md:text-7xl">
                  {getGreeting()}
                  <br />
                  Start Search.
                </h2>
                <p className="mt-6 max-w-3xl text-base leading-8 text-(--text-secondary) md:text-lg">
                  Describe a product, price range, or style. Mersi will search marketplaces, rank the best matches,
                  and let you move directly into product detail, cart review, and checkout.
                </p>
              </motion.div>

              <div className="mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s}
                    onClick={() => onSuggestion?.(s)}
                    className="app-command-pill stitch-hover-surface flex items-center justify-between gap-4 px-4 py-4 text-left transition-all duration-200"
                    {...fadeUp(0.35 + i * 0.05)}
                  >
                    <span>
                      <span className="stitch-label block text-[8px] text-[var(--landing-outline-bright)]">
                        {s.startsWith('/remember') ? 'Memory Command' : 'Quick Query'}
                      </span>
                      <span className="mt-2 block text-sm text-(--text-primary)">{s}</span>
                    </span>
                    <span className="stitch-label text-[10px] text-[var(--landing-tertiary)]">&gt;</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onSuggestion={onSuggestion} />
              ))}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="sticky bottom-0 left-0 right-0 h-10 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--bg))' }}
      />
    </div>
  );
}
