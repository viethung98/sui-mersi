'use client';

import { useRef } from 'react';
import { ArrowUp } from 'lucide-react';

type Props = {
  input: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onPrefill?: (value: string) => void;
  disabled?: boolean;
};

const MEMORY_COMMANDS = [
  {
    label: 'Remember brand',
    value: '/remember I prefer Nike running shoes',
  },
  {
    label: 'Remember budget',
    value: '/remember keep me under $150',
  },
];

export function InputBar({ input, onChange, onSubmit, onPrefill, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRememberCommand = input.trimStart().startsWith('/remember');

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && input.trim()) {
        e.currentTarget.form?.requestSubmit();
      }
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }

  const hasInput = input.trim().length > 0;

  return (
    <div className="px-4 pb-6 pt-2 md:px-8">
      <form onSubmit={onSubmit} className="mx-auto max-w-[1180px]">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <span className="stitch-label text-[8px] text-[var(--landing-outline-bright)]">Shortcuts</span>
          {MEMORY_COMMANDS.map((command) => (
            <button
              key={command.label}
              type="button"
              onClick={() => onPrefill?.(command.value)}
              disabled={disabled}
              className="app-command-pill stitch-hover-surface px-3 py-2 text-left text-[11px] text-(--text-primary) disabled:cursor-default disabled:opacity-40"
            >
              <span className="stitch-label text-[8px] text-[var(--landing-tertiary)]">{command.label}</span>
            </button>
          ))}
        </div>
        <div className="app-command-input relative flex items-end gap-4 px-4 py-4 md:px-6">
          <span className="stitch-label mb-2 text-[10px] text-[var(--landing-tertiary)]">&gt;</span>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Command Input</p>
              <p className="stitch-label text-[8px] text-[var(--landing-tertiary)]">
                {isRememberCommand ? 'Memory Save Mode' : 'Tip: /remember <preference>'}
              </p>
            </div>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={onChange}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Describe products to find, or use /remember to save a preference..."
              disabled={disabled}
              className="max-h-36 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none disabled:opacity-50 overflow-y-auto"
              style={{
                color: 'var(--text-primary)',
                caretColor: 'var(--primary)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={disabled || !hasInput}
            aria-label="Send message"
            className={`stitch-primary-button flex h-12 w-12 flex-none items-center justify-center transition-all duration-200 ${
              disabled || !hasInput ? 'opacity-30' : ''
            }`}
          >
            <ArrowUp size={15} color="white" />
          </button>
        </div>
      </form>
    </div>
  );
}
