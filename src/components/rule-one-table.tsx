"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetricRating } from "@/lib/stock-metrics";
import {
  defaultGrowthRate,
  computeSticker,
  priceVerdict,
  type StickerCalc,
} from "@/lib/rule-one";
import { MetricTooltip } from "@/components/metric-tooltip";
import { TriHorizonValues, TriHorizonHeader } from "@/components/tri-horizon";

export interface RuleOneItem {
  ticker: string;
  companyName: string | null;
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
  years: {
    fiscalYear: number;
    epsDiluted: number | null;
    fcf: number | null;
    equity: number | null;
    revenue: number | null;
    roic: number | null;
  }[];
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
  quoteCurrency: string | null;
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
  key: "roic" | "salesGrowth" | "epsGrowth" | "equityGrowth" | "fcfGrowth";
  short: string;
  label: string;
  description: string;
  negKey: "roic" | "revenue" | "epsDiluted" | "equity" | "fcf";
}[] = [
  { key: "roic", short: "ROIC", label: "ROIC — 10y/5y avg, latest yr", description: "Return on invested capital, averaged over 10 years. Rule #1 wants ≥10%.", negKey: "roic" },
  { key: "salesGrowth", short: "Sales", label: "Sales growth — 10y/5y CAGR, 1y YoY", description: "Revenue CAGR over 10 years. Rule #1 wants ≥10%/yr.", negKey: "revenue" },
  { key: "epsGrowth", short: "EPS", label: "EPS growth — 10y/5y CAGR, 1y YoY", description: "Diluted EPS CAGR over 10 years. < 0% = loss-making endpoint years.", negKey: "epsDiluted" },
  { key: "equityGrowth", short: "Equity", label: "Equity growth — 10y/5y CAGR, 1y YoY", description: "Book value CAGR over 10 years.", negKey: "equity" },
  { key: "fcfGrowth", short: "FCF", label: "FCF growth — 10y/5y CAGR, 1y YoY", description: "Free cash flow CAGR over 10 years. < 0% = cash-burning endpoint years.", negKey: "fcf" },
];

function fmtMoney(v: number | null, currency?: string | null): string {
  if (v === null || !isFinite(v)) return "—";
  const prefix = !currency || currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${v.toFixed(2)}`;
}

function BigFiveCell({ row, hasNegative }: { row: BigFiveRow | undefined; hasNegative: boolean }) {
  if (!row) {
    return <td className="px-3 py-3 text-right text-sm text-zinc-300 dark:text-zinc-600">…</td>;
  }
  return (
    <td className="px-3 py-3 text-right">
      <TriHorizonValues
        y10={row.tenYear.value}
        y5={row.fiveYear.value}
        y1={row.oneYear.value}
        hasNegative={hasNegative}
      />
    </td>
  );
}

/**
 * Rule #1 screening table: Big Five (10y) + sticker price + MOS for a list of
 * tickers, with per-row progressive loading. Used by the watchlist and the
 * industry pages.
 */
export function RuleOneTable({
  items,
  onRemove,
  renderExtra,
  extraHeader,
}: {
  items: RuleOneItem[];
  /** When provided, renders a Remove action column (watchlist) */
  onRemove?: (ticker: string) => void;
  /** When provided, renders an extra column after Stock (e.g. watchlist status) */
  renderExtra?: (item: RuleOneItem) => React.ReactNode;
  extraHeader?: string;
}) {
  const [rows, setRows] = useState<Record<string, RowData>>({});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map((i) => i.ticker))]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-4 py-3 font-medium">Stock</th>
            {renderExtra && <th className="px-3 py-3 font-medium">{extraHeader ?? ""}</th>}
            <th className="px-3 py-3 text-right font-medium">Price</th>
            {BIG_FIVE_COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-3 text-right font-medium">
                <MetricTooltip label={c.label} description={c.description}>
                  <TriHorizonHeader label={c.short} />
                </MetricTooltip>
              </th>
            ))}
            <th className="px-3 py-3 text-right font-medium">
              <MetricTooltip
                label="Sticker price"
                description="Rule #1 fair value using the default growth rate (lower of 10y equity growth and the analyst estimate)."
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
            {onRemove && <th className="px-3 py-3" />}
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
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.companyName}</p>
                    )}
                  </Link>
                </td>
                {renderExtra && <td className="px-3 py-3">{renderExtra(item)}</td>}
                <td className={`px-3 py-3 text-right text-sm font-semibold ${priceColor}`}>
                  {sticker === undefined ? (
                    <span className="text-zinc-300 dark:text-zinc-600">…</span>
                  ) : (
                    fmtMoney(sticker?.currentPrice ?? null, sticker?.quoteCurrency)
                  )}
                </td>
                {BIG_FIVE_COLUMNS.map((c) => (
                  <BigFiveCell
                    key={c.key}
                    row={
                      growth === undefined
                        ? undefined
                        : summary?.[c.key] ?? {
                            tenYear: { value: null, spanYears: null },
                            fiveYear: { value: null, spanYears: null },
                            oneYear: { value: null, spanYears: null },
                          }
                    }
                    hasNegative={hasNegative(c.negKey)}
                  />
                ))}
                <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {sticker === undefined ? (
                    <span className="text-zinc-300 dark:text-zinc-600">…</span>
                  ) : (
                    fmtMoney(calc?.sticker ?? null, sticker?.quoteCurrency)
                  )}
                </td>
                <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {sticker === undefined ? (
                    <span className="text-zinc-300 dark:text-zinc-600">…</span>
                  ) : (
                    fmtMoney(calc?.mos ?? null, sticker?.quoteCurrency)
                  )}
                </td>
                {onRemove && (
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => onRemove(item.ticker)}
                      className="text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                      title="Remove from watchlist"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
