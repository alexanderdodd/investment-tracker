"use client";

import { useMemo } from "react";
import {
  type StockMetrics,
  type MetricRating,
  METRIC_INFO,
  formatMetric,
  rateMetric,
  getDescription,
} from "@/lib/stock-metrics";
import { MetricTooltip } from "@/components/metric-tooltip";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

interface EmergingLeader {
  ticker: string;
  companyName: string;
  rationale: string;
  metricLabel: string;
  metricValue: string;
  rank: number;
}

const FINANCIAL_SECTORS = ["Financials"];
const GROWTH_SECTORS = ["Technology", "Communication Services"];

type MetricKey = keyof Omit<StockMetrics, "ticker">;

function getMetricColumns(sector: string): MetricKey[] {
  if (FINANCIAL_SECTORS.includes(sector)) {
    return ["forwardPE", "priceToBook", "roe", "operatingMargin", "freeCashFlow"];
  }
  if (GROWTH_SECTORS.includes(sector)) {
    return ["forwardPE", "priceToSales", "revenueGrowth", "operatingMargin", "freeCashFlow"];
  }
  return ["forwardPE", "evToEbitda", "operatingMargin", "roic", "freeCashFlow"];
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function PreProfitBadge({ metrics: m }: { metrics?: StockMetrics }) {
  if (!m) return null;
  if (m.operatingMargin !== null && m.operatingMargin < 0) {
    return (
      <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        Pre-profit
      </span>
    );
  }
  return null;
}

function MetricCell({ value, metricKey, sector }: { value: number | null; metricKey: MetricKey; sector: string }) {
  const info = METRIC_INFO[metricKey];
  const rating = rateMetric(metricKey, value, sector);
  return (
    <td className={`px-3 py-3 text-right text-sm font-medium ${RATING_COLORS[rating]}`}>
      {formatMetric(value, info.format)}
    </td>
  );
}

export function TabHoldings({
  sector,
  ticker,
  holdings,
  leaders,
  leadersGeneratedAt,
  metrics,
}: {
  sector: string;
  ticker: string;
  holdings: Holding[] | null;
  leaders: EmergingLeader[] | null;
  leadersGeneratedAt: string | null;
  metrics: Record<string, StockMetrics>;
}) {
  const metricColumns = useMemo(() => getMetricColumns(sector), [sector]);

  return (
    <div className="space-y-6">
      {/* Top Holdings */}
      {holdings && holdings.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Top 10 Holdings
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Largest positions in the {ticker} ETF by weight
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-3 py-3 text-right font-medium">Weight</th>
                  {metricColumns.map((key) => {
                    const info = METRIC_INFO[key];
                    return (
                      <th key={key} className="px-3 py-3 text-right font-medium">
                        <MetricTooltip label={info.label} description={getDescription(info, sector)}>
                          <span className="text-xs">{info.short}</span>
                        </MetricTooltip>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, i) => {
                  const m = metrics[holding.symbol];
                  return (
                    <tr
                      key={holding.symbol}
                      className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                    >
                      <td className="px-4 py-3 text-sm text-zinc-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {holding.symbol}
                          <PreProfitBadge metrics={m} />
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{holding.name}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {holding.weight.toFixed(2)}%
                      </td>
                      {metricColumns.map((key) => (
                        <MetricCell key={key} value={m?.[key] ?? null} metricKey={key} sector={sector} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Emerging Leaders */}
      {leaders && leaders.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Emerging Leaders
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Growth opportunities showing strong momentum in this sector
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">AI Insight</th>
                  {metricColumns.map((key) => {
                    const info = METRIC_INFO[key];
                    return (
                      <th key={key} className="px-3 py-3 text-right font-medium">
                        <MetricTooltip label={info.label} description={getDescription(info, sector)}>
                          <span className="text-xs">{info.short}</span>
                        </MetricTooltip>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {leaders.map((leader) => {
                  const m = metrics[leader.ticker];
                  return (
                    <tr
                      key={leader.ticker}
                      className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                    >
                      <td className="px-4 py-3 text-sm text-zinc-400">{leader.rank}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {leader.ticker}
                          <PreProfitBadge metrics={m} />
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{leader.companyName}</p>
                      </td>
                      <td className="max-w-xs px-3 py-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {leader.rationale}
                      </td>
                      {metricColumns.map((key) => (
                        <MetricCell key={key} value={m?.[key] ?? null} metricKey={key} sector={sector} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leadersGeneratedAt && (
            <div className="border-t border-zinc-100 px-6 py-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Generated{" "}
                {new Date(leadersGeneratedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
