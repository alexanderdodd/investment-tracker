"use client";

import { useCallback, useSyncExternalStore } from "react";

// The user's chosen margin of safety, remembered in localStorage and shared
// across the screener and watchlist so it doesn't reset between them.
const MOS_KEY = "rule-one-mos-fraction";
const MOS_EVENT = "mos-fraction-change";
export const DEFAULT_MOS = 0.5;

function subscribe(cb: () => void) {
  window.addEventListener(MOS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MOS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function snapshot(): number {
  const raw = parseFloat(localStorage.getItem(MOS_KEY) ?? "");
  return isFinite(raw) && raw >= 0 && raw <= 0.9 ? raw : DEFAULT_MOS;
}

/** Margin-of-safety fraction (0.5 = buy at 50% of sticker), remembered in
 *  localStorage via useSyncExternalStore — no hydration mismatch. */
export function useRememberedMos(): [number, (v: number) => void] {
  const mos = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_MOS);
  const setMos = useCallback((v: number) => {
    localStorage.setItem(MOS_KEY, String(v));
    window.dispatchEvent(new Event(MOS_EVENT));
  }, []);
  return [mos, setMos];
}

const PRESETS = [0.25, 0.5, 0.6];

/**
 * Slider that sets the margin of safety used to decide which stocks are "on
 * sale" (price at or below the MOS buy price). Shows a live count of how many
 * rows currently qualify.
 */
export function MosControl({
  value,
  onChange,
  onSaleCount,
  pricedCount,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Rows currently green (price ≤ MOS buy price) at this setting */
  onSaleCount?: number;
  /** Rows that have a sticker at all (denominator for the count) */
  pricedCount?: number;
}) {
  const pct = Math.round(value * 100);
  const payPct = Math.round((1 - value) * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-[180px]">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Margin of safety: {pct}%
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Turns green at or below {payPct}% of sticker
        </p>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">0%</span>
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full min-w-[140px] accent-emerald-600"
          aria-label="Margin of safety"
        />
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">80%</span>
      </div>

      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              Math.abs(value - p) < 0.001
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {Math.round(p * 100)}%
          </button>
        ))}
      </div>

      {onSaleCount !== undefined && (
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {onSaleCount} on sale
          {pricedCount !== undefined ? ` of ${pricedCount} priced` : ""}
        </span>
      )}
    </div>
  );
}
