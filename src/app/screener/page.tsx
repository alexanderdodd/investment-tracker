"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MetricRating } from "@/lib/stock-metrics";
import { rateBigFive } from "@/lib/rule-one";
import { MetricTooltip } from "@/components/metric-tooltip";

interface ScreenRow {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  currency: string | null;
  score: number;
  roic10y: number | null;
  sales10y: number | null;
  eps10y: number | null;
  equity10y: number | null;
  fcf10y: number | null;
  minSpanYears: number | null;
  marketCap: number | null;
  price: number | null;
  sticker: number | null;
  mos: number | null;
  verdict: string | null;
}

interface ScreenStats {
  total: number;
  available: number;
  pass3: number;
  pass4: number;
  pass5: number;
  matching: number;
  latest: string | null;
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

const BIG_FIVE_COLS: { key: keyof ScreenRow; short: string; label: string }[] = [
  { key: "roic10y", short: "ROIC", label: "ROIC (10y avg)" },
  { key: "sales10y", short: "Sales", label: "Sales growth (10y CAGR)" },
  { key: "eps10y", short: "EPS", label: "EPS growth (10y CAGR)" },
  { key: "equity10y", short: "Equity", label: "Equity growth (10y CAGR)" },
  { key: "fcf10y", short: "FCF", label: "FCF growth (10y CAGR)" },
];

const MCAP_OPTIONS = [
  { value: 0, label: "Any size" },
  { value: 3e8, label: "≥ $300M" },
  { value: 1e9, label: "≥ $1B" },
  { value: 1e10, label: "≥ $10B" },
  { value: 1e11, label: "≥ $100B" },
];

const SORT_OPTIONS = [
  { value: "score", label: "Big Five score" },
  { value: "roic", label: "ROIC" },
  { value: "sales", label: "Sales growth" },
  { value: "eps", label: "EPS growth" },
  { value: "discount", label: "Discount to sticker" },
  { value: "marketCap", label: "Market cap" },
];

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMcap(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toFixed(2)}`;
}

export default function ScreenerPage() {
  const [minScore, setMinScore] = useState(4);
  const [sector, setSector] = useState("");
  const [minMcap, setMinMcap] = useState(1e9);
  const [sort, setSort] = useState("score");
  const [result, setResult] = useState<{
    query: string;
    data: { rows: ScreenRow[]; stats: ScreenStats; sectors: string[] };
  } | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      minScore: String(minScore),
      minMcap: String(minMcap),
      sort,
      limit: "200",
    });
    if (sector) params.set("sector", sector);
    return params.toString();
  }, [minScore, sector, minMcap, sort]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/screener?${query}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setResult({ query, data: json });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Show the latest completed result (dimmed) while a newer query loads
  const loading = result?.query !== query;
  const data = result?.data ?? null;
  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Big Five Screener
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every SEC filer, scored against Rule #1&apos;s Big Five — pure SEC-filing math, no
            AI in the loop
          </p>
        </div>

        {/* Stats strip */}
        {stats && stats.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {stats.available.toLocaleString()} companies swept
            </span>
            <span className="text-zinc-400">→</span>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 font-medium text-blue-600 dark:text-blue-400">
              {stats.pass3.toLocaleString()} pass ≥3/5
            </span>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 font-medium text-blue-600 dark:text-blue-400">
              {stats.pass4.toLocaleString()} pass ≥4/5
            </span>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-600 dark:text-emerald-400">
              {stats.pass5.toLocaleString()} perfect 5/5
            </span>
            {stats.latest && (
              <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                data as of{" "}
                {new Date(stats.latest).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex gap-1">
            {[3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setMinScore(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  minScore === s
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s === 5 ? "5/5 only" : `≥ ${s}/5`}
              </button>
            ))}
          </div>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <option value="">All sectors</option>
            {(data?.sectors ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="">— includes unclassified —</option>
          </select>
          <select
            value={minMcap}
            onChange={(e) => setMinMcap(parseFloat(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {MCAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          {stats && (
            <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
              {stats.matching.toLocaleString()} match
            </span>
          )}
        </div>

        {/* Results */}
        {loading && !data ? (
          <div className="h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : !stats || stats.total === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              No sweep data yet. Run{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                npm run sweep-big-five
              </code>{" "}
              to scan the market (first run takes a few hours; it&apos;s resumable).
            </p>
          </div>
        ) : (
          <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${loading ? "opacity-60" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 text-right font-medium">Mkt cap</th>
                    <th className="px-3 py-3 text-right font-medium">Score</th>
                    {BIG_FIVE_COLS.map((c) => (
                      <th key={c.key} className="px-3 py-3 text-right font-medium">
                        <MetricTooltip label={c.label} description="10-year figure from SEC filings; green ≥10%/yr per Rule #1.">
                          <span>{c.short}</span>
                        </MetricTooltip>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    <th className="px-3 py-3 text-right font-medium">Sticker</th>
                    <th className="px-4 py-3 text-right font-medium">MOS</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r) => {
                    const priceColor =
                      r.verdict === "mos"
                        ? RATING_COLORS.good
                        : r.verdict === "sticker"
                          ? RATING_COLORS.caution
                          : r.verdict === "above"
                            ? RATING_COLORS.bad
                            : "text-zinc-900 dark:text-zinc-100";
                    return (
                      <tr
                        key={r.ticker}
                        className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                      >
                        <td className="px-4 py-2.5">
                          <Link href={`/stocks/${r.ticker}/valuation`} className="group">
                            <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                              {r.ticker}
                              {r.minSpanYears !== null && r.minSpanYears < 10 && (
                                <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                                  ({r.minSpanYears}y)
                                </span>
                              )}
                              {r.currency && r.currency !== "USD" && (
                                <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                                  {r.currency}
                                </span>
                              )}
                            </p>
                            <p className="max-w-[220px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {r.companyName}
                              {r.sector ? ` · ${r.sector}` : ""}
                            </p>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {fmtMcap(r.marketCap)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.score === 5
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {r.score}/5
                          </span>
                        </td>
                        {BIG_FIVE_COLS.map((c) => {
                          const v = r[c.key] as number | null;
                          return (
                            <td
                              key={c.key}
                              className={`px-3 py-2.5 text-right text-sm font-medium ${v === null ? "text-zinc-400 dark:text-zinc-500" : RATING_COLORS[rateBigFive(v)]}`}
                            >
                              {fmtPct(v)}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-2.5 text-right text-sm font-semibold ${priceColor}`}>
                          {fmtMoney(r.price)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                          {fmtMoney(r.sticker)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                          {fmtMoney(r.mos)}
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
          Score = how many of the Big Five (10-year ROIC average and sales / EPS / equity / FCF
          CAGR) clear 10%/yr. (Ny) marks shorter filing histories; non-USD filers show growth
          rates but no sticker (their EPS can&apos;t be priced against USD quotes). Price turns
          green at or below MOS, amber below sticker, red above. Refresh the data with{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">npm run sweep-big-five</code>.
        </p>
      </div>
    </div>
  );
}
