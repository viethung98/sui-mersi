export function LoadingCard({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-6 overflow-hidden py-2">
      {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
        <div
          key={i}
          className="app-panel-solid stitch-ghost-border flex-none w-[300px] overflow-hidden animate-pulse"
        >
          <div className="h-[280px] bg-[var(--landing-surface-high)]" />
          <div className="space-y-4 p-5">
            <div className="h-3 w-20 bg-[var(--landing-outline)]/30" />
            <div className="h-8 w-3/4 bg-[var(--landing-outline)]/20" />
            <div className="h-3 w-1/2 bg-[var(--landing-outline)]/20" />
            <div className="mt-6 flex gap-3">
              <div className="h-10 flex-1 bg-[var(--landing-primary)]/18" />
              <div className="h-10 w-12 bg-[var(--landing-outline)]/20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
