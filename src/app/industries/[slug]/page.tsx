"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { sectorToSlug } from "@/lib/sectors";
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
  const [metrics, setMetrics] = useState<Record<string, StockMetrics>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/industries/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setIndustry(data.industry ?? null);
        setStocks(data.stocks ?? []);
        setAnalytics(data.analytics ?? null);
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

        {/* Stocks table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Classified Stocks
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {stocks.length} stocks in this industry
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
                  {stocks.map((stock) => {
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
    </div>
  );
}
