'use client';

import { PanelLeftOpen, PanelLeftClose, SquarePen } from 'lucide-react';

type Props = {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onNewChat: () => void;
};

// Absolutely positioned — takes no layout space, floats over the chat content
export function Header({ onToggleSidebar, sidebarOpen, onNewChat }: Props) {
  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex h-20 items-center justify-between px-4 md:px-8">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        className="app-toolbar-button pointer-events-auto flex h-10 w-10 items-center justify-center cursor-pointer transition-colors"
      >
        {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
      </button>

      <button
        onClick={onNewChat}
        aria-label="New chat"
        className="app-toolbar-button stitch-label pointer-events-auto flex h-10 items-center gap-2 px-4 text-[10px]"
      >
        <SquarePen size={16} />
        New Chat
      </button>
    </div>
  );
}
