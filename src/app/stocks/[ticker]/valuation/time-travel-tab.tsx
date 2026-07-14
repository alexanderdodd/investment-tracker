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
  currency?: string | null;
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

interface ChartPoint {
  ts: number;
  close: number;
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

// 10-Ks are due 60-90 days after fiscal year end; assume the numbers become
// public knowledge ~90 days after the fiscal year closes
const FILING_LAG_DAYS = 90;
const MAX_LOOKBACK_YEARS = 20;

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

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Last day of a fiscal year given its label year and end-month name */
function fiscalYearEnd(fiscalYear: number, endMonthName: string | null): Date {
  const monthIdx = endMonthName
    ? new Date(`${endMonthName} 1, 2000`).getMonth()
    : 11; // default December
  return new Date(fiscalYear, isNaN(monthIdx) ? 12 : monthIdx + 1, 0);
}

/** When a fiscal year's 10-K numbers were (approximately) publicly available */
function availableFrom(fiscalYear: number, endMonthName: string | null): Date {
  const end = fiscalYearEnd(fiscalYear, endMonthName);
  return new Date(end.getTime() + FILING_LAG_DAYS * 24 * 3600 * 1000);
}

interface TimePoint {
  date: Date;
  isToday: boolean;
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
  chart: ChartPoint[] | null;
  error: string | null;
}

export function TimeTravelTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  // Index into the timeline; null = default (today)
  const [pointIdx, setPointIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/stocks/${ticker}/growth-rates`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/stocks/${ticker}/sticker-price`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/stocks/${ticker}/price?chart=true&range=max`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([growth, sticker, price]) => {
        if (!cancelled)
          setResult({ ticker, growth, sticker, chart: price?.chart ?? null, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setResult({ ticker, growth: null, sticker: null, chart: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const loading = result?.ticker !== ticker;
  const growth = loading ? null : result!.growth;
  const sticker = loading ? null : result!.sticker;
  const chart = loading ? null : result!.chart;
  const error = loading ? null : result!.error;

  const years = useMemo(() => growth?.years ?? [], [growth]);
  const fyEndMonth = growth?.fiscalYearEndMonth ?? null;

  // Timeline: quarter-end dates from the earliest usable cutoff (3 fiscal
  // years of filings, max 20 years back) up to today. Last point = today.
  const timeline = useMemo((): TimePoint[] => {
    if (years.length < 3) return [];
    const now = new Date();
    const earliestData = availableFrom(years[2].fiscalYear, fyEndMonth);
    const earliestCap = new Date(now.getFullYear() - MAX_LOOKBACK_YEARS, now.getMonth(), 1);
    const earliest = earliestData > earliestCap ? earliestData : earliestCap;

    const points: TimePoint[] = [];
    // Walk quarter ends backwards from the most recent completed quarter
    const d = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
    while (d >= earliest) {
      points.unshift({ date: new Date(d), isToday: false });
      d.setMonth(d.getMonth() - 2); // move into the previous quarter…
      d.setDate(0); // …then snap to that quarter's last day
    }
    points.push({ date: now, isToday: true });
    return points;
  }, [years, fyEndMonth]);

  const effectiveIdx =
    timeline.length === 0
      ? null
      : pointIdx === null
        ? timeline.length - 1
        : Math.min(Math.max(pointIdx, 0), timeline.length - 1);
  const point = effectiveIdx === null ? null : timeline[effectiveIdx];
  const cutoffDate = point?.date ?? null;

  // Fiscal years whose 10-K was (approximately) filed by the cutoff date
  const truncYears = useMemo(
    () =>
      cutoffDate === null
        ? []
        : years.filter((y) => availableFrom(y.fiscalYear, fyEndMonth) <= cutoffDate),
    [years, cutoffDate, fyEndMonth]
  );
  const latestKnownFY = truncYears.length > 0 ? truncYears[truncYears.length - 1].fiscalYear : null;

  const summaryThen = useMemo(
    () => (truncYears.length >= 2 ? buildGrowthSummary(truncYears) : null),
    [truncYears]
  );

  // Sticker as of the cutoff: EPS from the latest fiscal year known then,
  // growth from the equity CAGR up to then (no historical analyst estimates
  // exist), high P/E from the years known then
  const stickerThen = useMemo((): {
    eps: number | null;
    growthUsed: number | null;
    growthSpan: number | null;
    highPe: number | null;
    calc: StickerCalc | null;
  } | null => {
    if (!summaryThen || truncYears.length === 0) return null;
    // Foreign filers' EPS is in the filing currency while prices are USD —
    // the as-of sticker can't be computed without mixing units
    if ((growth?.currency ?? "USD") !== "USD") return null;
    const epsRow = [...truncYears].reverse().find((y) => y.epsDiluted !== null);
    const eps = epsRow?.epsDiluted ?? null;
    const eq = summaryThen.equityGrowth;
    const pick = eq.tenYear.value !== null ? eq.tenYear : eq.fiveYear;
    const growthUsed = pick.value;
    const highPe = median(
      (sticker?.peYearsUsed ?? [])
        .filter((y) => y.fiscalYear <= (latestKnownFY ?? 0))
        .map((y) => y.highPe)
    );
    return {
      eps,
      growthUsed,
      growthSpan: pick.spanYears,
      highPe,
      calc: computeSticker(eps, growthUsed, highPe),
    };
  }, [summaryThen, truncYears, sticker, latestKnownFY, growth?.currency]);

  const priceNow = sticker?.currentPrice ?? null;

  // Share price on the cutoff date, from monthly close history (Yahoo chart
  // closes are split-adjusted, so they compare cleanly with today's basis)
  const priceThen = useMemo(() => {
    if (cutoffDate === null) return null;
    if (point?.isToday) return priceNow;
    const cutoffTs = cutoffDate.getTime() / 1000;
    let best: number | null = null;
    for (const p of chart ?? []) {
      if (p.ts <= cutoffTs) best = p.close;
      else break;
    }
    return best;
  }, [chart, cutoffDate, point?.isToday, priceNow]);

  const yearsSince = useMemo(() => {
    if (cutoffDate === null || point?.isToday || timeline.length === 0) return null;
    const today = timeline[timeline.length - 1].date;
    return (today.getTime() - cutoffDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  }, [cutoffDate, point?.isToday, timeline]);

  const realizedCagr =
    priceThen !== null && priceNow !== null && yearsSince !== null && yearsSince >= 0.75 && priceThen > 0
      ? Math.pow(priceNow / priceThen, 1 / yearsSince) - 1
      : null;

  const verdictThen = priceVerdict(priceThen, stickerThen?.calc ?? null);
  const isToday = point?.isToday ?? false;
  const asOfLabel = point === null ? "" : isToday ? "today" : fmtDate(point.date);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error || !growth?.available || years.length < 4 || point === null) {
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
      {/* Date selector */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Viewing the numbers as an investor saw them on
        </p>
        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {isToday ? "Today" : fmtDate(point.date)}
          <span className="ml-3 text-sm font-normal text-zinc-400 dark:text-zinc-500">
            {isToday
              ? fmtDate(point.date)
              : `${quarterLabel(point.date)} · ${yearsSince!.toFixed(1)} years ago`}
          </span>
        </p>

        {/* Full-width slider row — fixed layout so it never shifts while dragging */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setPointIdx(Math.max((effectiveIdx ?? 0) - 1, 0))}
            disabled={effectiveIdx === 0}
            className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Back one quarter"
          >
            ◀
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={timeline.length - 1}
              step={1}
              value={effectiveIdx!}
              onChange={(e) => setPointIdx(parseInt(e.target.value, 10))}
              className="w-full accent-blue-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
              <span>{quarterLabel(timeline[0].date)}</span>
              <span>Today</span>
            </div>
          </div>
          <button
            onClick={() => setPointIdx(Math.min((effectiveIdx ?? 0) + 1, timeline.length - 1))}
            disabled={effectiveIdx === timeline.length - 1}
            className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Forward one quarter"
          >
            ▶
          </button>
        </div>
        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          {isToday
            ? "Drag the slider back in time — each step is one quarter. Annual filings appear ~3 months after each fiscal year closes, just like they did for a real investor."
            : `Only filings public by ${fmtDate(point.date)} are used below (latest: the FY${latestKnownFY} annual report) — no hindsight leaks into the numbers.`}
        </p>
      </div>

      {/* Big Five as of cutoff */}
      {summaryThen && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              The Big Five as of {asOfLabel}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Computed from the {truncYears.length} fiscal years on file by then (latest:
              FY{latestKnownFY})
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

      {growth?.currency && growth.currency !== "USD" && (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          This company files in {growth.currency}; the as-of sticker price is skipped because
          its EPS can&apos;t be compared with USD share prices without currency conversion.
        </p>
      )}

      {/* Sticker price as of cutoff */}
      {stickerThen && (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Sticker price as of {asOfLabel}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Growth from equity CAGR up to then — historical analyst estimates aren&apos;t
              available, so this is the &ldquo;your own estimate&rdquo; side of Rule #1
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">EPS (FY{latestKnownFY})</p>
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isToday ? "Price now" : `Price on ${fmtDate(point.date)}`}
              </p>
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
            {isToday ? "What Rule #1 says today" : "What Rule #1 would have said — and what happened"}
          </h2>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {isToday ? "Today" : `On ${fmtDate(point.date)}`}, the stock traded at{" "}
            {fmtMoney(priceThen)} against a sticker price of {fmtMoney(stickerThen.calc.sticker)}{" "}
            and a MOS buy price of {fmtMoney(stickerThen.calc.mos)} —{" "}
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
              over {yearsSince!.toFixed(1)} years — vs the {MINIMUM_RETURN * 100}%/yr Rule #1
              hurdle. (Price only; dividends excluded.)
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Each slider step is one calendar quarter, back up to {MAX_LOOKBACK_YEARS} years where
        filing history allows. Fundamentals are annual: a fiscal year&apos;s numbers appear
        ~{FILING_LAG_DAYS} days after that year closes, when its 10-K would have been filed.
        Prices are month-end closes, split-adjusted to today&apos;s share basis, so past EPS,
        prices, and stickers are directly comparable. SEC XBRL history reaches back to roughly
        2009 — earlier dates use whatever span existed at the time, shown as &ldquo;(Ny)&rdquo;
        labels.
      </p>
    </div>
  );
}
