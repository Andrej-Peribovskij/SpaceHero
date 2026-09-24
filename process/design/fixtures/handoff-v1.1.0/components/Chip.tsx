/** A small pill. Included so this export renders on its own. */
export function Chip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--radius-full)] border
        border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-xs
        text-[var(--muted-foreground)]"
    >
      {label}
    </span>
  );
}
