'use client';

import { useEffect, useMemo, useState } from 'react';

type DiscoveryLogEntry = {
  time: string;
  label: string;
  tone: string;
  message: string;
};

const TYPE_INTERVAL_MS = 22;
const LINE_PAUSE_MS = 360;
const CYCLE_PAUSE_MS = 1400;

export function DiscoveryProcessLog({ entries }: { entries: DiscoveryLogEntry[] }) {
  const [activeLine, setActiveLine] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const currentEntry = entries[activeLine];

  useEffect(() => {
    if (!currentEntry) return;

    const isLineComplete = charCount >= currentEntry.message.length;
    const isLastLine = activeLine === entries.length - 1;

    const timer = window.setTimeout(() => {
      if (!isLineComplete) {
        setCharCount((value) => value + 1);
        return;
      }

      if (!isLastLine) {
        setActiveLine((value) => value + 1);
        setCharCount(0);
        return;
      }

      setActiveLine(0);
      setCharCount(0);
    }, !isLineComplete ? TYPE_INTERVAL_MS : isLastLine ? CYCLE_PAUSE_MS : LINE_PAUSE_MS);

    return () => window.clearTimeout(timer);
  }, [activeLine, charCount, currentEntry, entries.length]);

  const confidenceWidth = useMemo(() => {
    if (!entries.length || !currentEntry) return '0%';
    const perLine = 88 / entries.length;
    const completion = charCount / Math.max(currentEntry.message.length, 1);
    const progress = Math.min(88, activeLine * perLine + completion * perLine);
    return `${Math.max(progress, 8)}%`;
  }, [activeLine, charCount, currentEntry, entries.length]);

  return (
    <>
      <div className="relative z-10 mt-6 space-y-3 font-mono text-[11px] leading-6">
        {entries.map((entry, index) => {
          const isPast = index < activeLine;
          const isCurrent = index === activeLine;
          const isVisible = isPast || isCurrent;
          const message = isPast ? entry.message : isCurrent ? entry.message.slice(0, charCount) : '';

          return (
            <div
              key={`${entry.time}-${entry.label}`}
              className={`grid grid-cols-[64px_140px_minmax(0,1fr)] gap-3 transition-opacity duration-300 ${
                isVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className="text-zinc-600">{entry.time}</span>
              <span className={`tracking-tight ${entry.tone}`}>{entry.label}</span>
              <span className="min-w-0 text-[var(--landing-outline-bright)]">
                <span className="mr-3 text-[var(--landing-tertiary)]">&gt;</span>
                {message}
                {isCurrent ? <span className="stitch-cli-cursor" /> : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-8 flex justify-end border-t border-white/6 pt-6">
        <div className="text-right">
          <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Match Confidence</p>
          <div className="mt-2 h-1 w-36 bg-[var(--landing-surface-high)]">
            <div className="h-full bg-[var(--landing-primary)] transition-[width] duration-200" style={{ width: confidenceWidth }} />
          </div>
        </div>
      </div>
    </>
  );
}
