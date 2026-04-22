"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { sectorToSlug } from "@/lib/sectors";
import { SimulateBuyModal } from "@/components/simulate-buy-modal";
import {
  type StockMetrics,
  type MetricRating,
  METRIC_INFO,
  formatMetric,
  rateMetric,
  getDescription,
} from "@/lib/stock-metrics";
import { MetricTooltip } from "@/components/metric-tooltip";

interface IndustryInfo {
  id: string;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  cyclicalityClass: string;
  valueFrameworkId: string | null;
  sectorName: string;
  industryGroupName: string;
}

interface IndustryStock {
  ticker: string;
  companyName: string;
}

interface CandidateData {
  ticker: string;
  companyName: string;
  candidateClass: string;
  valuationLabel: string;
  valuationConfidence: number | null;
  peerQuality: string;
  trapRisk: string;
  score: number;
  reasonsFor: string[];
  reasonsAgainst: string[];
  hasValuationArtifact: boolean;
}

interface IndustryAnalyticsData {
  valuationState: string;
  industryState: string;
  universeSize: number;
  medianForwardPe: number | null;
  medianEvEbitda: number | null;
  medianPriceToBook: number | null;
  medianOperatingMargin: number | null;
  medianRoic: number | null;
  medianRoe: number | null;
  medianFcfYield: number | null;
  candidateCountValidated: number;
  candidateCountPossible: number;
  candidateCountTrapRisk: number;
  confidence: number;
  generatedAt: string;
}

type MetricKey = keyof Omit<StockMetrics, "ticker">;

const METRIC_COLUMNS: MetricKey[] = [
  "forwardPE",
  "evToEbitda",
  "priceToBook",
  "operatingMargin",
  "roic",
  "freeCashFlow",
];

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

const CYCLICALITY_LABELS: Record<string, string> = {
  defensive: "Defensive",
  mixed: "Mixed",
  cyclical: "Cyclical",
  hyper_cyclical: "Hyper-cyclical",
};

const STATE_BADGES: Record<string, { label: string; className: string }> = {
  ATTRACTIVE_HUNTING_GROUND: {
    label: "Attractive Hunting Ground",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  MIXED: {
    label: "Mixed",
    className: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400",
  },
  OVERHEATED: {
    label: "Overheated",
    className: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  },
  LOW_VISIBILITY: {
    label: "Low Visibility",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  WITHHELD: {
    label: "Pending Analysis",
    className: "border-zinc-300/40 bg-zinc-300/10 text-zinc-500 dark:text-zinc-500",
  },
};

const CANDIDATE_BADGES: Record<string, { label: string; className: string }> = {
  validated_value: {
    label: "Validated Value",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  possible_value: {
    label: "Possible Value",
    className: "border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  value_trap_risk: {
    label: "Trap Risk",
    className: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  },
  not_attractive: {
    label: "Not Attractive",
    className: "border-zinc-300/40 bg-zinc-300/10 text-zinc-500 dark:text-zinc-500",
  },
};

const SCREEN_STATE_BADGES: Record<string, { label: string; icon: string; className: string }> = {
  PUBLISHED_VALUE_CANDIDATE: {
    label: "Published Candidate",
    icon: "\u2605",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  SCREEN_PASS: {
    label: "Screen Pass",
    icon: "\u25CE",
    className: "border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  NEEDS_DEEP_WORK: {
    label: "Needs Deep Work",
    icon: "\u25C6",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  WATCHLIST_ONLY: {
    label: "Watchlist Only",
    icon: "\u00B7",
    className: "border-zinc-300/40 bg-zinc-300/10 text-zinc-500 dark:text-zinc-500",
  },
  EXCLUDED_VALUE_TRAP_RISK: {
    label: "Trap Risk",
    icon: "\u26A0",
    className: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

interface ScreenResultData {
  ticker: string;
  companyName: string;
  screenState: string;
  cheapnessPass: boolean;
  cheapnessSignalCount: number;
  qualityPass: boolean;
  qualityScore: number | null;
  trapFlags: string[];
  hasValuationArtifact: boolean;
  hasPeerArtifact: boolean;
  artifactPublished: boolean;
  valuationLabel: string | null;
  candidatePublishable: boolean;
  compositeScore: number;
}

interface ScreenStepLog {
  stage: string;
  description: string;
  detail: string;
  stocksAffected?: number;
}

interface ScreenRunResult {
  industry: { name: string; frameworkId: string | null };
  medians: Record<string, number | null>;
  methodology: ScreenStepLog[];
  results: ScreenResultData[];
  summary: { total: number; published: number; screenPass: number; deepWork: number; trapRisk: number; watchlist: number };
  screenedAt: string;
}

const SCREEN_STAGES = [
  { stage: "Resolve Industry", description: "Identify the GICS industry classification and screening framework" },
  { stage: "Compute Industry Medians", description: "Calculate baseline valuation benchmarks from current constituent data" },
  { stage: "Fetch Market Data", description: "Pull live valuation multiples and quality metrics for each stock" },
  { stage: "Check Valuation Artifacts", description: "Look up existing deep-valuation reports and peer analysis" },
  { stage: "Cheapness Screen (Stage C)", description: "Test each stock against industry-relative cheapness signals" },
  { stage: "Quality Filter (Stage D)", description: "Check financial health to separate genuine value from traps" },
  { stage: "Candidate Publication Gate", description: "Apply the strictest gate for published value candidate status" },
];

const VALUATION_BADGES: Record<string, { label: string; className: string }> = {
  cheap: {
    label: "Cheap",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  fair: {
    label: "Fair",
    className: "border-blue-500/40 bg-blue-500/10 text-blue-500 dark:text-blue-400",
  },
  expensive: {
    label: "Expensive",
    className: "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-400",
  },
  withheld: {
    label: "Withheld",
    className: "border-zinc-300/40 bg-zinc-300/10 text-zinc-500 dark:text-zinc-500",
  },
};

function MetricCell({
  value,
  metricKey,
  sector,
}: {
  value: number | null;
  metricKey: MetricKey;
  sector: string;
}) {
  const info = METRIC_INFO[metricKey];
  const rating = rateMetric(metricKey, value, sector);
  return (
    <td className={`px-3 py-3 text-right text-sm font-medium ${RATING_COLORS[rating]}`}>
      <MetricTooltip label={info.label} description={getDescription(info, sector)}>
        <span>{formatMetric(value, info.format)}</span>
      </MetricTooltip>
    </td>
  );
}

export default function IndustryDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [industry, setIndustry] = useState<IndustryInfo | null>(null);
  const [stocks, setStocks] = useState<IndustryStock[]>([]);
  const [analytics, setAnalytics] = useState<IndustryAnalyticsData | null>(null);
  const [screenResults, setScreenResults] = useState<ScreenResultData[]>([]);
  const [metrics, setMetrics] = useState<Record<string, StockMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [screenRunning, setScreenRunning] = useState(false);
  const [simBuyTarget, setSimBuyTarget] = useState<{ ticker: string; companyName: string } | null>(null);
  const [screenRun, setScreenRun] = useState<ScreenRunResult | null>(null);

  const runScreen = useCallback(async () => {
    setScreenRunning(true);
    setScreenRun(null);
    try {
      const res = await fetch(`/api/industries/${slug}/screen`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setScreenRun(data);
        setScreenResults(data.results ?? []);
      }
    } catch {
      // ignore
    } finally {
      setScreenRunning(false);
    }
  }, [slug]);

  useEffect(() => {
    fetch(`/api/industries/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setIndustry(data.industry ?? null);
        setStocks(data.stocks ?? []);
        setAnalytics(data.analytics ?? null);
        setScreenResults(data.screenResults ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    const tickers = stocks.map((s) => s.ticker);
    if (tickers.length === 0) return;

    fetch(`/api/stocks/metrics?tickers=${tickers.join(",")}`)
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {});
  }, [stocks]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
          <div className="h-20 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!industry) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-zinc-500">Industry not found.</p>
        </div>
      </div>
    );
  }

  const sectorSlug = sectorToSlug(industry.sectorName);
  const state = analytics?.industryState ?? "WITHHELD";
  const badge = STATE_BADGES[state] ?? STATE_BADGES.WITHHELD;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mb-2">
            <Link href="/sectors" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              Sectors
            </Link>
            <span>/</span>
            <Link
              href={`/sectors/${sectorSlug}`}
              className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              {industry.sectorName}
            </Link>
            <span>/</span>
            <span className="text-zinc-600 dark:text-zinc-300">{industry.name}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {industry.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {CYCLICALITY_LABELS[industry.cyclicalityClass] ?? industry.cyclicalityClass}
            </span>
          </div>

          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {industry.industryGroupName} &middot; {industry.sectorName} &middot; GICS {industry.code}
          </p>
        </div>

        {/* Analytics summary cards */}
        {analytics && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Median Fwd P/E", value: analytics.medianForwardPe !== null ? `${analytics.medianForwardPe.toFixed(1)}x` : "-" },
              { label: "Median EV/EBITDA", value: analytics.medianEvEbitda !== null ? `${analytics.medianEvEbitda.toFixed(1)}x` : "-" },
              { label: "Median Op Margin", value: analytics.medianOperatingMargin !== null ? `${(analytics.medianOperatingMargin * 100).toFixed(1)}%` : "-" },
              { label: "Confidence", value: `${(analytics.confidence * 100).toFixed(0)}%` },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Value Screen ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Value Screen
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Deterministic cheapness + quality filter for this industry
              </p>
            </div>
            <button
              onClick={runScreen}
              disabled={screenRunning}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {screenRunning ? "Screening..." : screenRun ? "Re-run Screen" : "Run Value Screen"}
            </button>
          </div>

          {/* Phase 1: Education — show stages before running */}
          {!screenRun && !screenRunning && screenResults.length === 0 && (
            <div className="px-6 py-6 space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                The value screen runs a deterministic pipeline to find stocks in this industry that may be undervalued relative to their peers. It does not use AI — every result is traceable to specific metrics and thresholds.
              </p>
              <div className="space-y-3">
                {SCREEN_STAGES.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{s.stage}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 2: Running — show spinner */}
          {screenRunning && (
            <div className="px-6 py-12 text-center space-y-4">
              <div className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-medium">Screening {stocks.length} stocks...</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Fetching live market data and computing industry-relative signals
              </p>
            </div>
          )}

          {/* Phase 3: Results — methodology + results */}
          {screenRun && !screenRunning && (
            <div>
              {/* Methodology steps */}
              <div className="border-b border-zinc-100 dark:border-zinc-800 px-6 py-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Screening Methodology
                </h3>
                <div className="space-y-3">
                  {screenRun.methodology.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{"\u2713"}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {step.stage}
                          {step.stocksAffected !== undefined && (
                            <span className="ml-2 text-xs font-normal text-zinc-400">({step.stocksAffected} stocks)</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{step.description}</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary counts */}
              <div className="border-b border-zinc-100 dark:border-zinc-800 px-6 py-3">
                <div className="flex flex-wrap gap-4 text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{screenRun.summary.total} stocks screened</span>
                  {screenRun.summary.published > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{screenRun.summary.published} published candidates</span>
                  )}
                  {screenRun.summary.screenPass > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">{screenRun.summary.screenPass} screen pass</span>
                  )}
                  {screenRun.summary.deepWork > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">{screenRun.summary.deepWork} need deep work</span>
                  )}
                  {screenRun.summary.trapRisk > 0 && (
                    <span className="text-red-500 dark:text-red-400">{screenRun.summary.trapRisk} trap risks</span>
                  )}
                  <span className="text-zinc-400">{screenRun.summary.watchlist} watchlist</span>
                </div>
              </div>

              {/* Stock results (non-watchlist) */}
              {(() => {
                const nonWatchlist = screenRun.results.filter((sr) => sr.screenState !== "WATCHLIST_ONLY");
                return nonWatchlist.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {nonWatchlist.map((sr) => {
                      const sBadge = SCREEN_STATE_BADGES[sr.screenState] ?? SCREEN_STATE_BADGES.WATCHLIST_ONLY;
                      return (
                        <div key={sr.ticker} className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/stocks/${sr.ticker}/valuation`}
                              className="text-sm font-semibold text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 transition-colors"
                            >
                              {sr.ticker}
                            </Link>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {sr.companyName}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${sBadge.className}`}>
                              {sBadge.icon} {sBadge.label}
                            </span>
                            {sr.valuationLabel && (
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${(VALUATION_BADGES[sr.valuationLabel] ?? VALUATION_BADGES.withheld).className}`}>
                                {(VALUATION_BADGES[sr.valuationLabel] ?? VALUATION_BADGES.withheld).label}
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-2">
                              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                Score: {sr.compositeScore}
                              </span>
                              <button
                                onClick={() => setSimBuyTarget({ ticker: sr.ticker, companyName: sr.companyName })}
                                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 transition-colors"
                              >
                                Buy
                              </button>
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-[10px]">
                            <span className={sr.cheapnessPass ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>
                              Cheap: {sr.cheapnessSignalCount} signals {sr.cheapnessPass ? "\u2713" : "\u2717"}
                            </span>
                            <span className={sr.qualityPass ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>
                              Quality: {sr.qualityScore ?? 0}/100 {sr.qualityPass ? "\u2713" : "\u2717"}
                            </span>
                            <span className={sr.hasValuationArtifact ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}>
                              Artifact: {sr.hasValuationArtifact ? "\u2713" : "\u2717"}
                            </span>
                            <span className={sr.hasPeerArtifact ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}>
                              Peers: {sr.hasPeerArtifact ? "\u2713" : "\u2717"}
                            </span>
                          </div>
                          {sr.trapFlags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {sr.trapFlags.map((flag, i) => (
                                <span key={i} className="text-[10px] text-red-500 dark:text-red-400">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No stocks passed the value screen. All {screenRun.summary.total} stocks are watchlist-only.
                  </div>
                );
              })()}
            </div>
          )}

          {/* Show previous results if no run yet but data exists */}
          {!screenRun && !screenRunning && screenResults.length > 0 && (() => {
            const nonWatchlist = screenResults.filter((sr) => sr.screenState !== "WATCHLIST_ONLY");
            return nonWatchlist.length > 0 ? (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {nonWatchlist.map((sr) => {
                  const sBadge = SCREEN_STATE_BADGES[sr.screenState] ?? SCREEN_STATE_BADGES.WATCHLIST_ONLY;
                  return (
                    <div key={sr.ticker} className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/stocks/${sr.ticker}/valuation`}
                          className="text-sm font-semibold text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 transition-colors"
                        >
                          {sr.ticker}
                        </Link>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{sr.companyName}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${sBadge.className}`}>
                          {sBadge.icon} {sBadge.label}
                        </span>
                        <span className="ml-auto text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Score: {sr.compositeScore}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null;
          })()}
        </div>

        {/* Top Stocks in Industry */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Top Stocks in {industry.name}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {stocks.length > 10 ? `Showing 10 of ${stocks.length}` : `${stocks.length} stocks`} in this industry
            </p>
          </div>

          {stocks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No stocks classified in this industry yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    {METRIC_COLUMNS.map((key) => {
                      const info = METRIC_INFO[key];
                      return (
                        <th key={key} className="px-3 py-3 text-right font-medium">
                          <span className="text-xs">{info.short}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {stocks.slice(0, 10).map((stock) => {
                    const m = metrics[stock.ticker];
                    return (
                      <tr
                        key={stock.ticker}
                        className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/stocks/${stock.ticker}/valuation`}
                            className="group"
                          >
                            <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                              {stock.ticker}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {stock.companyName}
                            </p>
                          </Link>
                        </td>
                        {METRIC_COLUMNS.map((key) => (
                          <MetricCell
                            key={key}
                            value={m?.[key] ?? null}
                            metricKey={key}
                            sector={industry?.sectorName ?? ""}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Simulate Buy Modal */}
      {simBuyTarget && (
        <SimulateBuyModal
          ticker={simBuyTarget.ticker}
          companyName={simBuyTarget.companyName}
          currentPrice={null}
          onClose={() => setSimBuyTarget(null)}
        />
      )}
    </div>
  );
}
