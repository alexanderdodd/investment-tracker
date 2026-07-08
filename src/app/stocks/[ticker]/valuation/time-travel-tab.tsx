"use client";

import { useEffect, useMemo, useState } from "react";
import { MetricTooltip } from "@/components/metric-tooltip";
import {
  buildGrowthSummary,
  type GrowthYearRow,
  type GrowthSummary,
  type PeriodStat,
} from "@/lib/sec-edgar/growth-math";
import {
  rateBigFive,
  computeSticker,
  priceVerdict,
  MINIMUM_RETURN,
  type StickerCalc,
} from "@/lib/rule-one";
import type { MetricRating } from "@/lib/stock-metrics";

interface GrowthPayload {
  available: boolean;
  unavailableReason: string | null;
  fiscalYearEndMonth: string | null;
  years: GrowthYearRow[];
  summary: GrowthSummary | null;
}

interface StickerInputs {
  available: boolean;
  currentPrice: number | null;
  historicalHighPe: number | null;
  peYearsUsed: { fiscalYear: number; eps: number; highPrice: number; highPe: number }[];
  yearEndPrices?: { fiscalYear: number; price: number }[];
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

const SUMMARY_ROWS: { key: keyof GrowthSummary; label: string; negKey: keyof GrowthYearRow }[] = [
  { key: "roic", label: "ROIC", negKey: "roic" },
  { key: "salesGrowth", label: "Sales Growth", negKey: "revenue" },
  { key: "epsGrowth", label: "EPS Growth", negKey: "epsDiluted" },
  { key: "equityGrowth", label: "Equity (BV) Growth", negKey: "equity" },
  { key: "fcfGrowth", label: "FCF Growth", negKey: "fcf" },
];

function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMoney(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function StatCell({ stat, target, negative }: { stat: PeriodStat; target: number; negative: boolean }) {
  if (stat.value === null) {
    return (
      <td className={`px-3 py-3 text-right text-sm font-medium ${negative ? RATING_COLORS.bad : "text-zinc-400 dark:text-zinc-500"}`}>
        {negative ? "< 0%" : "—"}
      </td>
    );
  }
  return (
    <td className={`px-3 py-3 text-right text-sm font-medium ${RATING_COLORS[rateBigFive(stat.value)]}`}>
      {fmtPct(stat.value)}
      {stat.spanYears !== null && stat.spanYears < target && (
        <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
          ({stat.spanYears}y)
        </span>
      )}
    </td>
  );
}

interface FetchResult {
  ticker: string;
  growth: GrowthPayload | null;
  sticker: StickerInputs | null;
  error: string | null;
}

export function TimeTravelTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [cutoff, setCutoff] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/stocks/${ticker}/growth-rates`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/stocks/${ticker}/sticker-price`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([growth, sticker]) => {
        if (!cancelled) setResult({ ticker, growth, sticker, error: null });
      })
      .catch((e) => {
        if (!cancelled) setResult({ ticker, growth: null, sticker: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const loading = result?.ticker !== ticker;
  const growth = loading ? null : result!.growth;
  const sticker = loading ? null : result!.sticker;
  const error = loading ? null : result!.error;

  const years = useMemo(() => growth?.years ?? [], [growth]);
  const latestFY = years.length > 0 ? years[years.length - 1].fiscalYear : null;
  // Need at least 3 years of history behind a cutoff for meaningful rates,
  // and the cutoff must be strictly in the past
  const minCutoff = years.length > 2 ? years[2].fiscalYear : null;
  const maxCutoff = latestFY !== null ? latestFY - 1 : null;

  const effectiveCutoff =
    cutoff !== null && minCutoff !== null && maxCutoff !== null
      ? Math.min(Math.max(cutoff, minCutoff), maxCutoff)
      : latestFY !== null && minCutoff !== null && maxCutoff !== null
        ? Math.min(Math.max(latestFY - 5, minCutoff), maxCutoff)
        : null;

  const truncYears = useMemo(
    () => (effectiveCutoff === null ? [] : years.filter((y) => y.fiscalYear <= effectiveCutoff)),
    [years, effectiveCutoff]
  );

  const summaryThen = useMemo(
    () => (truncYears.length >= 2 ? buildGrowthSummary(truncYears) : null),
    [truncYears]
  );

  // Sticker as of the cutoff: EPS from that fiscal year, growth from the
  // equity CAGR up to then (no historical analyst estimates exist), high P/E
  // from the years up to then
  const stickerThen = useMemo((): {
    eps: number | null;
    growthUsed: number | null;
    growthSpan: number | null;
    highPe: number | null;
    calc: StickerCalc | null;
  } | null => {
    if (!summaryThen || truncYears.length === 0) return null;
    const epsRow = [...truncYears].reverse().find((y) => y.epsDiluted !== null);
    const eps = epsRow?.epsDiluted ?? null;
    const eq = summaryThen.equityGrowth;
    const pick = eq.tenYear.value !== null ? eq.tenYear : eq.fiveYear;
    const growthUsed = pick.value;
    const highPe = median(
      (sticker?.peYearsUsed ?? [])
        .filter((y) => y.fiscalYear <= (effectiveCutoff ?? 0))
        .map((y) => y.highPe)
    );
    return {
      eps,
      growthUsed,
      growthSpan: pick.spanYears,
      highPe,
      calc: computeSticker(eps, growthUsed, highPe),
    };
  }, [summaryThen, truncYears, sticker, effectiveCutoff]);

  const priceThen = useMemo(() => {
    if (effectiveCutoff === null) return null;
    return sticker?.yearEndPrices?.find((p) => p.fiscalYear === effectiveCutoff)?.price ?? null;
  }, [sticker, effectiveCutoff]);

  const priceNow = sticker?.currentPrice ?? null;
  const yearsSince = latestFY !== null && effectiveCutoff !== null ? latestFY - effectiveCutoff : null;
  const realizedCagr =
    priceThen !== null && priceNow !== null && yearsSince !== null && yearsSince >= 1 && priceThen > 0
      ? Math.pow(priceNow / priceThen, 1 / yearsSince) - 1
      : null;

  const verdictThen = priceVerdict(priceThen, stickerThen?.calc ?? null);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error || !growth?.available || years.length < 4 || effectiveCutoff === null) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">
          Time travel isn&apos;t available for {ticker}.
        </p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {error ?? growth?.unavailableReason ?? "Not enough years of SEC filing history to look back."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Viewing the numbers as they looked at the end of
            </p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              FY{effectiveCutoff}
              <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">
                {latestFY! - effectiveCutoff} year{latestFY! - effectiveCutoff === 1 ? "" : "s"} ago
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">FY{minCutoff}</span>
            <input
              type="range"
              min={minCutoff!}
              max={maxCutoff!}
              step={1}
              value={effectiveCutoff}
              onChange={(e) => setCutoff(parseInt(e.target.value, 10))}
              className="w-48 accent-blue-600 sm:w-64"
            />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">FY{maxCutoff}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          Only information from filings up to FY{effectiveCutoff} is used below — no hindsight
          leaks into the numbers.
        </p>
      </div>

      {/* Big Five as of cutoff */}
      {summaryThen && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              The Big Five as of FY{effectiveCutoff}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Computed from the {truncYears.length} fiscal years available back then
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Metric</th>
                  <th className="px-3 py-3 text-right font-medium">10-Year</th>
                  <th className="px-3 py-3 text-right font-medium">5-Year</th>
                  <th className="px-3 py-3 text-right font-medium">1-Year</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_ROWS.map((row) => {
                  const negative = truncYears.some((y) => {
                    const v = y[row.negKey] as number | null;
                    return v !== null && v <= 0;
                  });
                  const r = summaryThen[row.key];
                  return (
                    <tr key={row.key} className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50">
                      <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">{row.label}</td>
                      <StatCell stat={r.tenYear} target={10} negative={negative} />
                      <StatCell stat={r.fiveYear} target={5} negative={negative} />
                      <StatCell stat={r.oneYear} target={1} negative={negative} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sticker price as of cutoff */}
      {stickerThen && (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Sticker price as of FY{effectiveCutoff}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Growth from equity CAGR up to then — historical analyst estimates aren&apos;t
              available, so this is the &ldquo;your own estimate&rdquo; side of Rule #1
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">EPS (FY{effectiveCutoff})</p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(stickerThen.eps)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Growth used{stickerThen.growthSpan ? ` (${stickerThen.growthSpan}y equity)` : ""}
              </p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtPct(stickerThen.growthUsed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">High P/E then</p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {stickerThen.highPe !== null ? stickerThen.highPe.toFixed(1) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                <MetricTooltip
                  label="Sticker price then"
                  description="EPS compounded 10 years at the growth rate, times the lower of 2×growth and the historical high P/E, discounted back at 15%/yr."
                >
                  <span>Sticker then</span>
                </MetricTooltip>
              </p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(stickerThen.calc?.sticker ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">MOS then</p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(stickerThen.calc?.mos ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Price then (FY end)</p>
              <p
                className={`text-base font-semibold ${
                  verdictThen === "mos"
                    ? RATING_COLORS.good
                    : verdictThen === "sticker"
                      ? RATING_COLORS.caution
                      : verdictThen === "above"
                        ? RATING_COLORS.bad
                        : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {fmtMoney(priceThen)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hindsight */}
      {stickerThen?.calc && priceThen !== null && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            What Rule #1 would have said — and what happened
          </h2>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            At the end of FY{effectiveCutoff}, the stock traded at {fmtMoney(priceThen)} against a
            sticker price of {fmtMoney(stickerThen.calc.sticker)} and a MOS buy price of{" "}
            {fmtMoney(stickerThen.calc.mos)} —{" "}
            {verdictThen === "mos" ? (
              <span className={`font-semibold ${RATING_COLORS.good}`}>on sale, a Rule #1 buy</span>
            ) : verdictThen === "sticker" ? (
              <span className={`font-semibold ${RATING_COLORS.caution}`}>
                below sticker but above the margin of safety
              </span>
            ) : (
              <span className={`font-semibold ${RATING_COLORS.bad}`}>above sticker — not a buy</span>
            )}
            .
          </p>
          {realizedCagr !== null && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              Since then the price went {fmtMoney(priceThen)} → {fmtMoney(priceNow)}, compounding at{" "}
              <span
                className={`font-semibold ${
                  realizedCagr >= MINIMUM_RETURN
                    ? RATING_COLORS.good
                    : realizedCagr >= 0
                      ? RATING_COLORS.caution
                      : RATING_COLORS.bad
                }`}
              >
                {fmtPct(realizedCagr)}/yr
              </span>{" "}
              over {yearsSince} year{yearsSince === 1 ? "" : "s"} — vs the{" "}
              {MINIMUM_RETURN * 100}%/yr Rule #1 hurdle. (Price only; dividends excluded.)
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        All values are split-adjusted to today&apos;s share basis, so past EPS, prices, and
        stickers are directly comparable. SEC XBRL history reaches back to roughly 2009 —
        earlier cutoffs use whatever span existed at the time, shown as &ldquo;(Ny)&rdquo;
        labels. If the year slider doesn&apos;t reach back far enough, the stock&apos;s cached
        history may predate the longer window — it refreshes automatically within a week.
      </p>
    </div>
  );
}
