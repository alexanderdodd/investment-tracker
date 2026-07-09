"use client";

import type { MetricRating } from "@/lib/stock-metrics";
import { rateBigFive } from "@/lib/rule-one";

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function Value({ v, negative }: { v: number | null; negative: boolean }) {
  if (v === null) {
    return (
      <span className={negative ? RATING_COLORS.bad : "text-zinc-400 dark:text-zinc-500"}>
        {negative ? "<0" : "—"}
      </span>
    );
  }
  return (
    <span className={RATING_COLORS[rateBigFive(v)]}>{(v * 100).toFixed(1)}</span>
  );
}

/**
 * Compact 10y | 5y | 1y display for one Big Five metric — used everywhere
 * the Big Five appear in tables. Values are percentages without the % sign
 * (the column header carries "10y · 5y · 1y %"); Rule #1 coloring per value.
 */
export function TriHorizonValues({
  y10,
  y5,
  y1,
  hasNegative = false,
}: {
  y10: number | null;
  y5: number | null;
  y1: number | null;
  hasNegative?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap text-xs font-medium tabular-nums">
      <Value v={y10} negative={hasNegative} />
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <Value v={y5} negative={hasNegative} />
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <Value v={y1} negative={hasNegative} />
    </span>
  );
}

/** Column header sub-label matching TriHorizonValues */
export function TriHorizonHeader({ label }: { label: string }) {
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{label}</span>
      <span className="text-[9px] font-normal text-zinc-400 dark:text-zinc-500">
        10y · 5y · 1y %
      </span>
    </span>
  );
}
