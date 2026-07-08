"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetricRating } from "@/lib/stock-metrics";
import {
  rateBigFive,
  defaultGrowthRate,
  computeSticker,
  priceVerdict,
  type StickerCalc,
} from "@/lib/rule-one";
import { MetricTooltip } from "@/components/metric-tooltip";

interface WatchlistItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  addedAt: string;
}

interface PeriodStat {
  value: number | null;
  spanYears: number | null;
}

interface BigFiveRow {
  tenYear: PeriodStat;
  fiveYear: PeriodStat;
  oneYear: PeriodStat;
}

interface GrowthPayload {
  available: boolean;
  years: { fiscalYear: number; epsDiluted: number | null; fcf: number | null; equity: number | null; revenue: number | null; roic: number | null }[];
  summary: {
    roic: BigFiveRow;
    salesGrowth: BigFiveRow;
    epsGrowth: BigFiveRow;
    equityGrowth: BigFiveRow;
    fcfGrowth: BigFiveRow;
  } | null;
}

interface StickerInputs {
  available: boolean;
  currentPrice: number | null;
  eps: number | null;
  analystGrowth: number | null;
  equityGrowth: { value: number; spanYears: number } | null;
  historicalHighPe: number | null;
}

interface RowData {
  growth?: GrowthPayload | null;
  sticker?: StickerInputs | null;
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

const BIG_FIVE_COLUMNS: {
  key: keyof NonNullable<GrowthPayload["summary"]>;
  short: string;
  label: string;
  description: string;
  negKey: "roic" | "revenue" | "epsDiluted" | "equity" | "fcf";
}[] = [
  { key: "roic", short: "ROIC", label: "ROIC (10y avg)", description: "Return on invested capital, averaged over 10 years. Rule #1 wants ≥10%.", negKey: "roic" },
  { key: "salesGrowth", short: "Sales", label: "Sales growth (10y)", description: "Revenue CAGR over 10 years. Rule #1 wants ≥10%/yr.", negKey: "revenue" },
  { key: "epsGrowth", short: "EPS", label: "EPS growth (10y)", description: "Diluted EPS CAGR over 10 years. < 0% = loss-making endpoint years.", negKey: "epsDiluted" },
  { key: "equityGrowth", short: "Equity", label: "Equity growth (10y)", description: "Book value CAGR over 10 years.", negKey: "equity" },
  { key: "fcfGrowth", short: "FCF", label: "FCF growth (10y)", description: "Free cash flow CAGR over 10 years. < 0% = cash-burning endpoint years.", negKey: "fcf" },
];

function fmtMoney(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function BigFiveCell({ stat, hasNegative }: { stat: PeriodStat | undefined; hasNegative: boolean }) {
  if (!stat) {
    return <td className="px-3 py-3 text-right text-sm text-zinc-300 dark:text-zinc-600">…</td>;
  }
  if (stat.value === null) {
    return (
      <td className={`px-3 py-3 text-right text-sm font-medium ${hasNegative ? RATING_COLORS.bad : "text-zinc-400 dark:text-zinc-500"}`}>
        {hasNegative ? "< 0%" : "—"}
      </td>
    );
  }
  return (
    <td className={`px-3 py-3 text-right text-sm font-medium ${RATING_COLORS[rateBigFive(stat.value)]}`}>
      {(stat.value * 100).toFixed(1)}%
      {stat.spanYears !== null && stat.spanYears < 10 && (
        <span className="ml-0.5 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
          ({stat.spanYears}y)
        </span>
      )}
    </td>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fan out per-ticker fetches; each row fills in as its data arrives.
  useEffect(() => {
    for (const item of items) {
      const t = item.ticker;
      fetch(`/api/stocks/${t}/growth-rates`)
        .then((r) => (r.ok ? r.json() : null))
        .then((growth) => setRows((prev) => ({ ...prev, [t]: { ...prev[t], growth } })))
        .catch(() => setRows((prev) => ({ ...prev, [t]: { ...prev[t], growth: null } })));
      fetch(`/api/stocks/${t}/sticker-price`)
        .then((r) => (r.ok ? r.json() : null))
        .then((sticker) => setRows((prev) => ({ ...prev, [t]: { ...prev[t], sticker } })))
        .catch(() => setRows((prev) => ({ ...prev, [t]: { ...prev[t], sticker: null } })));
    }
  }, [items]);

  async function removeFromWatchlist(ticker: string) {
    await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              My Watchlist
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The Big Five (10-year) plus sticker price and margin of safety for every stock
              you&apos;re tracking
            </p>
          </div>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Your watchlist is empty. Visit a stock page and click &quot;Watch&quot; to add it here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    {BIG_FIVE_COLUMNS.map((c) => (
                      <th key={c.key} className="px-3 py-3 text-right font-medium">
                        <MetricTooltip label={c.label} description={c.description}>
                          <span>{c.short}</span>
                        </MetricTooltip>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-medium">
                      <MetricTooltip
                        label="Sticker price"
                        description="Rule #1 fair value using the default growth rate (lower of 10y equity growth and the analyst estimate) — same as the Sticker Price tab's default."
                      >
                        <span>Sticker</span>
                      </MetricTooltip>
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      <MetricTooltip
                        label="Margin of Safety price"
                        description="Half the sticker price — the Rule #1 buy target. Price cell turns green at or below this."
                      >
                        <span>MOS</span>
                      </MetricTooltip>
                    </th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const row = rows[item.ticker] ?? {};
                    const growth = row.growth;
                    const sticker = row.sticker;
                    const summary = growth?.available ? growth.summary : null;

                    let calc: StickerCalc | null = null;
                    if (sticker?.available) {
                      const g = defaultGrowthRate(sticker.equityGrowth?.value, sticker.analystGrowth);
                      calc = computeSticker(sticker.eps, g, sticker.historicalHighPe);
                    }
                    const verdict = priceVerdict(sticker?.currentPrice ?? null, calc);
                    const priceColor =
                      verdict === "mos"
                        ? RATING_COLORS.good
                        : verdict === "sticker"
                          ? RATING_COLORS.caution
                          : verdict === "above"
                            ? RATING_COLORS.bad
                            : "text-zinc-900 dark:text-zinc-100";

                    const hasNegative = (key: (typeof BIG_FIVE_COLUMNS)[number]["negKey"]) =>
                      (growth?.years ?? []).some((y) => {
                        const v = y[key];
                        return v !== null && v <= 0;
                      });

                    return (
                      <tr
                        key={item.ticker}
                        className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/stocks/${item.ticker}/valuation`} className="group">
                            <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                              {item.ticker}
                            </p>
                            {item.companyName && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {item.companyName}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className={`px-3 py-3 text-right text-sm font-semibold ${priceColor}`}>
                          {sticker === undefined ? (
                            <span className="text-zinc-300 dark:text-zinc-600">…</span>
                          ) : (
                            fmtMoney(sticker?.currentPrice ?? null)
                          )}
                        </td>
                        {BIG_FIVE_COLUMNS.map((c) => (
                          <BigFiveCell
                            key={c.key}
                            stat={
                              growth === undefined
                                ? undefined
                                : c.key === "roic"
                                  ? summary?.roic.tenYear ?? { value: null, spanYears: null }
                                  : summary?.[c.key].tenYear ?? { value: null, spanYears: null }
                            }
                            hasNegative={hasNegative(c.negKey)}
                          />
                        ))}
                        <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sticker === undefined ? (
                            <span className="text-zinc-300 dark:text-zinc-600">…</span>
                          ) : (
                            fmtMoney(calc?.sticker ?? null)
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sticker === undefined ? (
                            <span className="text-zinc-300 dark:text-zinc-600">…</span>
                          ) : (
                            fmtMoney(calc?.mos ?? null)
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => removeFromWatchlist(item.ticker)}
                            className="text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                            title="Remove from watchlist"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Big Five are 10-year figures (ROIC = average, growth = CAGR) from SEC filings; sticker
          and MOS use the default Rule #1 inputs — open a stock&apos;s Sticker Price tab to
          adjust the growth assumption. Price turns green at or below MOS, amber below sticker,
          red above. First load of an untracked stock can take ~30s while SEC data is fetched.
        </p>
      </div>
    </div>
  );
}
