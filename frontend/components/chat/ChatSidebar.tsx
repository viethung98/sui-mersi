'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SquarePen, MessageSquare, Trash2 } from 'lucide-react';
import { useListSessions, deleteChatSession, SESSIONS_KEY } from '@/lib/api/sessions';
import type { components } from '@/src/types/api.d';

type SessionItem = components['schemas']['ChatSession'];
type Group = { label: string; items: SessionItem[] };

type Props = {
  activeSessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onActiveSessionDeleted?: () => void;
};

function groupByTime(sessions: SessionItem[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7Days = new Date(startOfToday.getTime() - 6 * 86400000);
  const startOf30Days = new Date(startOfToday.getTime() - 29 * 86400000);

  const groups: Group[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Last 30 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const s of sessions) {
    const d = new Date(s.updatedAt);
    if (d >= startOfToday) groups[0].items.push(s);
    else if (d >= startOfYesterday) groups[1].items.push(s);
    else if (d >= startOf7Days) groups[2].items.push(s);
    else if (d >= startOf30Days) groups[3].items.push(s);
    else groups[4].items.push(s);
  }

  return groups.filter((g) => g.items.length > 0);
}

function formatTerminalTitle(value?: string | null) {
  if (!value) return 'MERSI_CHANNEL_00';
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase()
    .slice(0, 28) || 'MERSI_CHANNEL_00';
}

function formatSessionLabel(value?: string | null) {
  if (!value) return 'Untitled Session';
  return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDeleted,
}: {
  session: SessionItem;
  isActive: boolean;
  onSelect: () => void;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const handler = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [confirming]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await deleteChatSession(session.id);
      setTimeout(() => onDeleted(session.id), 300);
    } catch {
      setRemoving(false);
      setConfirming(false);
    }
  };

  const handleTrashClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(true);
  };

  const rowBg = confirming
    ? 'bg-red-500/[0.06] border-red-500/20'
    : isActive
      ? 'bg-[var(--landing-primary)]/8 border-[var(--landing-primary)]/22'
      : 'hover:bg-[var(--landing-surface)]/70 hover:border-[var(--landing-outline)]/24 border-transparent';

  const labelColor = isActive ? 'text-[var(--landing-primary)]' : hovered ? 'text-(--text-primary)' : 'text-(--text-secondary)';

  const trashVisible = (hovered || isActive) && !confirming;

  return (
    <li
      ref={rowRef}
      className={`relative overflow-hidden ${removing ? 'session-exit' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`flex items-center gap-2 border px-3 py-3 transition-colors ${rowBg}`}>
        <button
          onClick={onSelect}
          title={session.title ?? 'New chat'}
          className={`flex-1 min-w-0 bg-transparent border-0 text-left transition-colors ${labelColor}`}
        >
          <div className="flex min-w-0 items-start gap-2">
            <MessageSquare size={12} className={`mt-0.5 shrink-0 ${isActive ? 'text-[var(--landing-tertiary)]' : 'opacity-45'}`} />
            <div className="min-w-0">
              <p className="stitch-label text-[8px] text-[var(--landing-outline-bright)]">
                {isActive ? 'Active_Thread' : 'Thread'}
              </p>
              <span className="mt-1 block truncate text-[12px] leading-snug">
                {formatSessionLabel(session.title)}
              </span>
            </div>
          </div>
        </button>

        {!confirming && (
          <button
            onClick={handleTrashClick}
            title="Delete chat"
            aria-label="Delete chat"
            className={[
              'shrink-0 flex items-center justify-center h-7 w-7',
              'border border-transparent bg-transparent text-(--text-muted) transition-all duration-150',
              'hover:border-red-500/25 hover:bg-red-500/12 hover:text-red-400',
              trashVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90',
            ].join(' ')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {confirming && (
        <div className="confirm-slide-in flex items-center gap-2 border-x border-b border-red-500/20 px-3 py-2">
          <span className="stitch-label flex-1 text-[9px] text-(--text-muted)">
            Delete?
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            className="stitch-label border border-[var(--landing-outline)]/20 px-2 py-1 text-[8px] text-(--text-secondary) transition-colors hover:bg-white/10 hover:text-(--text-primary)"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={removing}
            className="stitch-label border border-red-500/20 bg-red-500/12 px-2 py-1 text-[8px] text-red-300 transition-colors hover:bg-red-500/24 hover:text-red-200 disabled:opacity-50 disabled:cursor-default"
          >
            {removing ? '…' : 'Delete'}
          </button>
        </div>
      )}
    </li>
  );
}

export function ChatSidebar({ activeSessionId, isOpen, onClose, onSelectSession, onNewChat, onActiveSessionDeleted }: Props) {
  const { data, isLoading: loading } = useListSessions();
  const sessions = data?.sessions ?? [];
  const qc = useQueryClient();

  const handleDeleted = useCallback((id: string) => {
    qc.setQueryData(SESSIONS_KEY, (old: { sessions: SessionItem[] } | undefined) =>
      old ? { ...old, sessions: old.sessions.filter((s) => s.id !== id) } : old,
    );
    if (id === activeSessionId) onActiveSessionDeleted?.();
  }, [qc, activeSessionId, onActiveSessionDeleted]);

  const groups = groupByTime(sessions);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'flex-none overflow-hidden',
          'app-panel-solid border-r border-[var(--landing-outline)]/20',
          'transition-all duration-300 ease-in-out',
          'fixed md:relative top-0 left-0 h-full z-40 md:z-auto',
          isOpen
            ? 'w-[320px] translate-x-0'
            : 'w-[320px] md:w-0 -translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-0 stitch-grid opacity-10" />
        <div className="relative flex h-full w-[320px] flex-col">

          <div className="border-b border-[var(--landing-outline)]/20 px-6 py-8 flex-none">
            <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Active_Channels</p>
            <h2 className="stitch-headline mt-4 text-3xl leading-[0.95] text-white">
              {formatTerminalTitle(activeSession?.title)}
            </h2>
            <div className="mt-6 flex items-center gap-3">
              <span className="stitch-status-dot" />
              <span className="stitch-label text-[10px] text-[var(--landing-tertiary)]">Agent Active / Shopping</span>
            </div>

            <button
              onClick={onNewChat}
              className="stitch-primary-button stitch-label mt-8 flex w-full items-center justify-between gap-2.5 px-4 py-4 text-[10px]"
            >
              <span>New Thread</span>
              <SquarePen size={14} className="flex-none" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
            {loading ? (
              <div className="mt-2 flex flex-col gap-3 px-1">
                {[72, 56, 80, 64].map((w, i) => (
                  <div
                    key={i}
                    className="h-14 bg-white/[0.04] animate-pulse"
                    style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="mt-8 px-4">
                <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">No Active Threads</p>
                <p className="mt-4 text-sm leading-6 text-(--text-muted)">Start a conversation and Mersi will keep the session list here.</p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p className="stitch-label mb-3 px-1 text-[9px] text-(--text-muted)">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.items.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        isActive={s.id === activeSessionId}
                        onSelect={() => onSelectSession(s.id)}
                        onDeleted={handleDeleted}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </nav>

        </div>
      </aside>
    </>
  );
}
