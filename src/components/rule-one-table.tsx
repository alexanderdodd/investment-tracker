"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetricRating } from "@/lib/stock-metrics";
import {
  defaultGrowthRate,
  computeSticker,
  currentMos,
  priceVerdictAt,
  MARGIN_OF_SAFETY,
  type StickerCalc,
} from "@/lib/rule-one";
import { MetricTooltip } from "@/components/metric-tooltip";
import { TriHorizonValues, TriHorizonHeader } from "@/components/tri-horizon";
import { formatMoney } from "@/lib/currency";
import { StockLabels } from "@/components/stock-labels";
import type { StockLabel } from "@/lib/labels";

export interface RuleOneItem {
  ticker: string;
  companyName: string | null;
}

/** Columns the table can sort by. Metric sorts use each row's loaded price/
 *  sticker/MOS; rows still loading sink to the bottom. */
export type RuleOneSortKey = "added" | "ticker" | "name" | "price" | "sticker" | "mos";
export type SortDir = "asc" | "desc";

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
  return formatMoney(v, currency ?? "USD");
}

/** Current margin of safety as a signed percentage (e.g. "+42%", "-13%"). */
function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  const pct = Math.round(v * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
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
  mosFraction = MARGIN_OF_SAFETY,
  onlyOnSale = false,
  labels,
  assignments,
  onToggleLabel,
  onCreateLabel,
  notes,
  onEditNote,
  sortKey = "added",
  sortDir = "desc",
}: {
  items: RuleOneItem[];
  /** When provided, renders a Remove action column (watchlist) */
  onRemove?: (ticker: string) => void;
  /** When provided, renders an extra column after Stock (e.g. watchlist status) */
  renderExtra?: (item: RuleOneItem) => React.ReactNode;
  extraHeader?: string;
  /** Margin-of-safety fraction for the MOS column + price coloring (0.5 default) */
  mosFraction?: number;
  /** When true, hide rows that aren't on sale (price ≤ MOS) once loaded */
  onlyOnSale?: boolean;
  /** User's label catalogue — when provided, renders the inline label picker */
  labels?: StockLabel[];
  /** ticker → applied label ids */
  assignments?: Record<string, string[]>;
  onToggleLabel?: (ticker: string, labelId: string, assign: boolean) => void;
  onCreateLabel?: (ticker: string, name: string) => void;
  /** ticker → note; when onEditNote is also provided, renders an editable Note column */
  notes?: Record<string, string | null>;
  onEditNote?: (ticker: string, note: string) => void;
  /** Column to sort rows by (default: incoming order = "added") */
  sortKey?: RuleOneSortKey;
  sortDir?: SortDir;
}) {
  const labelsEnabled = !!labels && !!onToggleLabel && !!onCreateLabel;
  const notesEnabled = !!notes && !!onEditNote;
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

  // Loaded price/sticker/MOS for a ticker (null while still fetching), used both
  // for metric sorting and to keep it consistent with the row render below.
  function metricsOf(ticker: string): { price: number | null; sticker: number | null; mos: number | null } {
    const sticker = rows[ticker]?.sticker;
    if (!sticker?.available) return { price: sticker?.currentPrice ?? null, sticker: null, mos: null };
    const g = defaultGrowthRate(sticker.equityGrowth?.value, sticker.analystGrowth);
    const calc = computeSticker(sticker.eps, g, sticker.historicalHighPe);
    return {
      price: sticker.currentPrice ?? null,
      sticker: calc?.sticker ?? null,
      mos: currentMos(sticker.currentPrice ?? null, calc?.sticker ?? null),
    };
  }

  // Sort a copy of items. "added" preserves the server order (addedAt desc from
  // the caller), honouring sortDir. Metric sorts push not-yet-loaded rows last.
  const orderedItems = (() => {
    if (sortKey === "added") return sortDir === "asc" ? [...items].reverse() : items;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (item: RuleOneItem): number | string | null => {
      switch (sortKey) {
        case "ticker":
          return item.ticker;
        case "name":
          return (item.companyName || item.ticker).toLowerCase();
        case "price":
          return metricsOf(item.ticker).price;
        case "sticker":
          return metricsOf(item.ticker).sticker;
        case "mos":
          return metricsOf(item.ticker).mos;
        default:
          return null;
      }
    };
    return [...items].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      // Nulls always sink to the bottom regardless of direction.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  })();

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
                label="Margin of safety (current)"
                description="How far today's price sits below the sticker: (sticker − price) / sticker. Green once it clears your chosen MOS."
              >
                <span>MOS %</span>
              </MetricTooltip>
            </th>
            {notesEnabled && <th className="px-3 py-3 text-left font-medium">Note</th>}
            {onRemove && <th className="px-3 py-3" />}
          </tr>
        </thead>
        <tbody>
          {orderedItems.map((item) => {
            const row = rows[item.ticker] ?? {};
            const growth = row.growth;
            const sticker = row.sticker;
            const summary = growth?.available ? growth.summary : null;

            let calc: StickerCalc | null = null;
            if (sticker?.available) {
              const g = defaultGrowthRate(sticker.equityGrowth?.value, sticker.analystGrowth);
              calc = computeSticker(sticker.eps, g, sticker.historicalHighPe);
            }
            const mos = currentMos(sticker?.currentPrice ?? null, calc?.sticker ?? null);
            const verdict = priceVerdictAt(
              sticker?.currentPrice ?? null,
              calc?.sticker ?? null,
              mosFraction
            );

            // "Only on sale": once a row's price/sticker have loaded, drop it
            // unless it's green. Rows still loading (sticker === undefined) stay
            // visible so the table fills in before it filters down.
            if (onlyOnSale && sticker !== undefined && verdict !== "mos") return null;

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
                  <Link href={`/stocks/${item.ticker}/valuation`} className="group block">
                    <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                      {item.ticker}
                    </p>
                    {item.companyName && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.companyName}</p>
                    )}
                  </Link>
                  {labelsEnabled && (
                    <div className="mt-1">
                      <StockLabels
                        ticker={item.ticker}
                        labels={labels!}
                        assignedIds={assignments?.[item.ticker] ?? []}
                        onToggle={(labelId, assign) => onToggleLabel!(item.ticker, labelId, assign)}
                        onCreateAndAssign={(name) => onCreateLabel!(item.ticker, name)}
                      />
                    </div>
                  )}
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
                <td className={`px-3 py-3 text-right text-sm font-medium ${priceColor}`}>
                  {sticker === undefined ? (
                    <span className="text-zinc-300 dark:text-zinc-600">…</span>
                  ) : (
                    fmtPct(mos)
                  )}
                </td>
                {notesEnabled && (
                  <td className="px-3 py-3 align-top">
                    <NoteCell
                      value={notes![item.ticker] ?? null}
                      onSave={(note) => onEditNote!(item.ticker, note)}
                    />
                  </td>
                )}
                {onRemove && (
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => onRemove(item.ticker)}
                      className="text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                      title="Remove from list"
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

/** Inline-editable note: shows the text (or a "+ note" affordance); click to
 *  edit in a small textarea; Enter or blur saves, Esc cancels. */
function NoteCell({ value, onSave }: { value: string | null; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function startEditing() {
    setDraft(value ?? "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "")) onSave(next);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        rows={2}
        placeholder="Add a note…"
        className="w-48 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      />
    );
  }

  return (
    <button
      onClick={startEditing}
      title={value ? "Edit note" : "Add a note"}
      className={`max-w-[12rem] text-left text-xs transition-colors ${
        value
          ? "whitespace-pre-wrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
      }`}
    >
      {value || "＋ note"}
    </button>
  );
}
