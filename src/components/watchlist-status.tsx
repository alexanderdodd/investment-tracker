"use client";

/** Triage statuses for watchlist items — must match VALID_STATUSES in the API */
export const WATCHLIST_STATUSES = [
  { value: "watching", label: "Watching", dot: "bg-zinc-400", chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300", active: "border-zinc-400 bg-zinc-500/15 text-zinc-700 dark:text-zinc-200" },
  { value: "to-research", label: "Research", dot: "bg-blue-500", chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400", active: "border-blue-500/60 bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "to-buy", label: "Buy", dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", active: "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { value: "own", label: "Own", dot: "bg-purple-500", chip: "bg-purple-500/10 text-purple-600 dark:text-purple-400", active: "border-purple-500/60 bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { value: "pass", label: "Pass", dot: "bg-red-400", chip: "bg-red-500/10 text-red-500 dark:text-red-400", active: "border-red-500/60 bg-red-500/15 text-red-500 dark:text-red-400" },
] as const;

export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number]["value"];

export function statusMeta(value: string) {
  return WATCHLIST_STATUSES.find((s) => s.value === value) ?? WATCHLIST_STATUSES[0];
}

/**
 * Colored status pill that opens a native select on click — compact enough
 * to live inside a table row.
 */
export function StatusPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: WatchlistStatus) => void;
}) {
  const meta = statusMeta(value);
  return (
    <span className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
      <svg viewBox="0 0 8 6" className="h-1.5 w-2 opacity-60" fill="currentColor" aria-hidden>
        <path d="M0 0h8L4 6z" />
      </svg>
      <select
        value={meta.value}
        onChange={(e) => onChange(e.target.value as WatchlistStatus)}
        className="absolute inset-0 cursor-pointer opacity-0"
        title="Change status"
      >
        {WATCHLIST_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </span>
  );
}
