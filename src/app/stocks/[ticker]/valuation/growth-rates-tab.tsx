"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { MetricTooltip } from "@/components/metric-tooltip";
import type { MetricRating } from "@/lib/stock-metrics";

interface GrowthYearRow {
  fiscalYear: number;
  revenue: number | null;
  epsDiluted: number | null;
  equity: number | null;
  ocf: number | null;
  capex: number | null;
  fcf: number | null;
  operatingIncome: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  dilutedShares: number | null;
  roic: number | null;
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

interface GrowthSummary {
  roic: BigFiveRow;
  salesGrowth: BigFiveRow;
  epsGrowth: BigFiveRow;
  equityGrowth: BigFiveRow;
  fcfGrowth: BigFiveRow;
}

interface GrowthData {
  ticker: string;
  companyName: string | null;
  fiscalYearEndMonth: string | null;
  available: boolean;
  unavailableReason: string | null;
  years: GrowthYearRow[];
  summary: GrowthSummary | null;
  generatedAt: string;
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

// Rule #1 rule of thumb: all Big Five should be ≥ 10%/year
function rateBigFive(v: number | null): MetricRating {
  if (v === null) return "neutral";
  if (v >= 0.1) return "good";
  if (v >= 0.05) return "caution";
  return "bad";
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDollars(v: number | null): string {
  if (v === null) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtEps(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toFixed(2)}`;
}

const SUMMARY_ROWS: {
  key: keyof GrowthSummary;
  label: string;
  description: string;
}[] = [
  {
    key: "roic",
    label: "ROIC",
    description:
      "Return on Invested Capital: after-tax operating income ÷ (equity + debt). Rule #1 wants ≥10% every year — 10y/5y columns show the average, 1y the latest fiscal year.",
  },
  {
    key: "salesGrowth",
    label: "Sales Growth",
    description:
      "Revenue growth rate. 10y/5y columns are compound annual growth rates (CAGR); 1y is the latest year-over-year change. Rule #1 threshold: ≥10%/yr.",
  },
  {
    key: "epsGrowth",
    label: "EPS Growth",
    description:
      "Diluted earnings-per-share growth. CAGR for 10y/5y, year-over-year for 1y. Undefined (—) when an endpoint year had negative EPS.",
  },
  {
    key: "equityGrowth",
    label: "Equity (BV) Growth",
    description:
      "Book value (stockholders' equity) growth. Buyback-heavy companies can shrink equity while still compounding value — read together with ROIC.",
  },
  {
    key: "fcfGrowth",
    label: "FCF Growth",
    description:
      "Free cash flow (operating cash flow − capex) growth. CAGR for 10y/5y, year-over-year for 1y.",
  },
];

const PERIODS: { key: keyof BigFiveRow; label: string; target: number }[] = [
  { key: "tenYear", label: "10-Year", target: 10 },
  { key: "fiveYear", label: "5-Year", target: 5 },
  { key: "oneYear", label: "1-Year", target: 1 },
];

const CHART_SERIES = [
  { key: "revenue", label: "Sales", color: "#3b82f6" },
  { key: "epsDiluted", label: "EPS", color: "#22c55e" },
  { key: "equity", label: "Equity", color: "#a855f7" },
  { key: "fcf", label: "FCF", color: "#f59e0b" },
] as const;

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "rgba(24,24,27,0.95)",
  border: "1px solid rgba(63,63,70,0.5)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e4e4e7",
};

function SummaryCell({ stat, target }: { stat: PeriodStat; target: number }) {
  const rating = rateBigFive(stat.value);
  return (
    <td className={`px-3 py-3 text-right text-sm font-medium ${RATING_COLORS[rating]}`}>
      {fmtPct(stat.value)}
      {stat.value !== null && stat.spanYears !== null && stat.spanYears < target && (
        <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
          ({stat.spanYears}y)
        </span>
      )}
    </td>
  );
}

function BigFiveSummaryTable({ summary }: { summary: GrowthSummary }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          The Big Five Numbers
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Rule #1: a wonderful business shows ≥10%/yr on all five, consistently
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-3 font-medium">Metric</th>
              {PERIODS.map((p) => (
                <th key={p.key} className="px-3 py-3 text-right font-medium">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUMMARY_ROWS.map((row) => (
              <tr
                key={row.key}
                className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
              >
                <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <MetricTooltip label={row.label} description={row.description}>
                    <span>{row.label}</span>
                  </MetricTooltip>
                </td>
                {PERIODS.map((p) => (
                  <SummaryCell key={p.key} stat={summary[row.key][p.key]} target={p.target} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ChartMode = "indexed" | "perShare";

function BigFiveChart({ years }: { years: GrowthYearRow[] }) {
  const [mode, setMode] = useState<ChartMode>("indexed");

  const { chartData, omittedCount } = useMemo(() => {
    let omitted = 0;

    if (mode === "indexed") {
      // Index each series to 100 at its first positive year; non-positive
      // values can't render on a log axis, so they become gaps.
      const bases: Record<string, number | null> = {};
      for (const s of CHART_SERIES) {
        const first = years.find((y) => (y[s.key] ?? 0) > 0);
        bases[s.key] = first ? (first[s.key] as number) : null;
      }
      const data = years.map((y) => {
        const point: Record<string, number | string | null> = { fiscalYear: y.fiscalYear };
        for (const s of CHART_SERIES) {
          const v = y[s.key];
          const base = bases[s.key];
          if (v !== null && base !== null && v > 0) {
            point[s.label] = (v / base) * 100;
          } else {
            if (v !== null && v <= 0) omitted++;
            point[s.label] = null;
          }
        }
        return point;
      });
      return { chartData: data, omittedCount: omitted };
    }

    // Per-share mode: dollar values per diluted share, linear axis
    const data = years.map((y) => {
      const shares = y.dilutedShares;
      const perShare = (v: number | null) =>
        v !== null && shares !== null && shares > 0 ? v / shares : null;
      return {
        fiscalYear: y.fiscalYear,
        Sales: perShare(y.revenue),
        EPS: y.epsDiluted,
        Equity: perShare(y.equity),
        FCF: perShare(y.fcf),
      } as Record<string, number | string | null>;
    });
    return { chartData: data, omittedCount: 0 };
  }, [years, mode]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            The four growth lines
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {mode === "indexed"
              ? "Indexed to 100, log scale — parallel straight lines mean equal growth rates"
              : "Per diluted share, linear scale"}
          </p>
        </div>
        <div className="flex gap-1">
          {(
            [
              { value: "indexed", label: "Indexed (log)" },
              { value: "perShare", label: "Per share" },
            ] as { value: ChartMode; label: string }[]
          ).map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                mode === m.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis
              dataKey="fiscalYear"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              scale={mode === "indexed" ? "log" : "auto"}
              domain={mode === "indexed" ? ["auto", "auto"] : undefined}
              allowDataOverflow={mode === "indexed"}
              tickFormatter={(v: number) =>
                mode === "indexed" ? v.toFixed(0) : `$${v.toFixed(0)}`
              }
              width={44}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => [
                mode === "indexed"
                  ? Number(value).toFixed(0)
                  : `$${Number(value).toFixed(2)}`,
                String(name),
              ]}
              labelFormatter={(label: unknown) => `FY ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {CHART_SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {mode === "indexed" && omittedCount > 0 && (
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          {omittedCount} negative/zero data point{omittedCount === 1 ? "" : "s"} omitted (cannot
          be shown on a log scale) — switch to &ldquo;Per share&rdquo; to see them.
        </p>
      )}
    </div>
  );
}

interface BreakdownCategory {
  key: keyof GrowthYearRow;
  title: string;
  format: (v: number | null) => string;
  showYoY: boolean;
}

const BREAKDOWN_CATEGORIES: BreakdownCategory[] = [
  { key: "revenue", title: "Revenue (Sales)", format: fmtDollars, showYoY: true },
  { key: "epsDiluted", title: "EPS (Diluted)", format: fmtEps, showYoY: true },
  { key: "equity", title: "Equity (Book Value)", format: fmtDollars, showYoY: true },
  { key: "fcf", title: "Free Cash Flow", format: fmtDollars, showYoY: true },
  { key: "roic", title: "ROIC", format: fmtPct, showYoY: false },
];

function BreakdownCard({
  category,
  years,
}: {
  category: BreakdownCategory;
  years: GrowthYearRow[];
}) {
  const points = years.map((y) => ({
    fiscalYear: y.fiscalYear,
    value: y[category.key] as number | null,
  }));

  const barData = points.map((p) => ({
    fiscalYear: p.fiscalYear,
    value: category.key === "roic" && p.value !== null ? p.value * 100 : p.value,
  }));

  const latest = [...points].reverse().find((p) => p.value !== null);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {category.title}
        </h3>
        {latest && (
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {category.format(latest.value)}
            <span className="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              FY{latest.fiscalYear}
            </span>
          </p>
        )}
      </div>

      <div className="h-28 px-3 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData}>
            <XAxis
              dataKey="fiscalYear"
              tick={{ fontSize: 9, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: unknown) => [
                category.key === "roic"
                  ? `${Number(value).toFixed(1)}%`
                  : category.format(Number(value)),
                category.title,
              ]}
              labelFormatter={(label: unknown) => `FY ${label}`}
              cursor={{ fill: "rgba(128,128,128,0.08)" }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {barData.map((p) => (
                <Cell
                  key={p.fiscalYear}
                  fill={(p.value ?? 0) < 0 ? "#ef4444" : "#3b82f6"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-4 pt-2">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
              <th className="py-1 font-medium">FY</th>
              <th className="py-1 text-right font-medium">Value</th>
              {category.showYoY && <th className="py-1 text-right font-medium">YoY</th>}
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p, i, arr) => {
              const prev = arr[i + 1];
              const yoy =
                category.showYoY &&
                p.value !== null &&
                prev?.value !== null &&
                prev?.value !== undefined &&
                prev.value > 0
                  ? p.value / prev.value - 1
                  : null;
              return (
                <tr
                  key={p.fiscalYear}
                  className="border-t border-zinc-50 text-xs dark:border-zinc-800/50"
                >
                  <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{p.fiscalYear}</td>
                  <td className="py-1.5 text-right font-medium text-zinc-900 dark:text-zinc-100">
                    {category.format(p.value)}
                  </td>
                  {category.showYoY && (
                    <td
                      className={`py-1.5 text-right ${
                        yoy === null
                          ? "text-zinc-400 dark:text-zinc-500"
                          : yoy >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {yoy === null ? "—" : `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FetchResult {
  ticker: string;
  data: GrowthData | null;
  error: string | null;
}

export function GrowthRatesTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/growth-rates`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setResult({ ticker, data: json, error: null });
      })
      .catch((e) => {
        if (!cancelled) setResult({ ticker, data: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // A result for a different ticker is stale — treat as still loading
  const loading = result?.ticker !== ticker;
  const data = loading ? null : result!.data;
  const error = loading ? null : result!.error;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-6 py-10 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        Couldn&apos;t load growth data: {error}
      </div>
    );
  }

  if (!data || !data.available || !data.summary) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">
          Growth history isn&apos;t available for {ticker}.
        </p>
        {data?.unavailableReason && (
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {data.unavailableReason}
          </p>
        )}
      </div>
    );
  }

  const visibleCategories = BREAKDOWN_CATEGORIES.filter((c) =>
    data.years.some((y) => y[c.key] !== null)
  );

  return (
    <div className="space-y-6">
      <BigFiveSummaryTable summary={data.summary} />
      <BigFiveChart years={data.years} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Year-by-year breakdown
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleCategories.map((c) => (
            <BreakdownCard key={c.key} category={c} years={data.years} />
          ))}
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        {data.fiscalYearEndMonth && data.fiscalYearEndMonth !== "December"
          ? `Fiscal years end in ${data.fiscalYearEndMonth}; years are labeled by the calendar year the fiscal year ends in. `
          : ""}
        Source: SEC EDGAR XBRL (10-K filings). Growth = CAGR for 10y/5y, year-over-year for 1y;
        ROIC = after-tax operating income ÷ (equity + debt), averaged over the period.
      </p>
    </div>
  );
}
