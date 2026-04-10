"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  type StockMetrics,
  type MetricRating,
  METRIC_INFO,
  formatMetric,
  rateMetric,
  getDescription,
} from "@/lib/stock-metrics";
import { MetricTooltip } from "@/components/metric-tooltip";

type Timeframe = "1D" | "1M" | "1Y" | "5Y";

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1D": 1,
  "1M": 30,
  "1Y": 365,
  "5Y": 5 * 365,
};

interface PricePoint {
  ts: number;
  close: number;
}

interface SectorPriceData {
  ticker: string;
  prices: PricePoint[];
  changes: {
    day: number | null;
    month: number | null;
    year: number | null;
    fiveYear: number | null;
  };
}

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

interface SectorAnalysis {
  performanceSummary: string;
  sectorStructure: string;
  fundamentalDrivers: string;
  opportunities: string;
  risks: string;
  generatedAt: string;
}

const SECTOR_ICONS: Record<string, string> = {
  Technology: "💻",
  Financials: "🏦",
  Utilities: "⚡",
  "Consumer Staples": "🛒",
  "Consumer Discretionary": "🛍️",
  Industrials: "🏭",
  "Health Care": "🏥",
  Energy: "🛢️",
  Materials: "⛏️",
  "Communication Services": "📡",
  "Real Estate": "🏠",
};

// Which metrics to show based on sector type
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

function getChangeForTimeframe(
  changes: SectorPriceData["changes"],
  tf: Timeframe
): number | null {
  if (tf === "1D") return changes.day;
  if (tf === "1M") return changes.month;
  if (tf === "1Y") return changes.year;
  return changes.fiveYear;
}

function ChangeValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-400">—</span>;
  const isPositive = value >= 0;
  return (
    <span
      className={`font-semibold ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function PreProfitBadge({ metrics: m }: { metrics?: StockMetrics }) {
  if (!m) return null;
  const opMargin = m.operatingMargin;
  if (opMargin !== null && opMargin < 0) {
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

export function SectorDetail({
  sector,
  ticker,
  slug,
}: {
  sector: string;
  ticker: string;
  slug: string;
}) {
  const [priceData, setPriceData] = useState<SectorPriceData | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SectorAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    performance: true,
  });
  const [leaders, setLeaders] = useState<EmergingLeader[] | null>(null);
  const [leadersGeneratedAt, setLeadersGeneratedAt] = useState<string | null>(
    null
  );
  const [leadersLoading, setLeadersLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, StockMetrics>>({});
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [loading, setLoading] = useState(true);

  const metricColumns = useMemo(() => getMetricColumns(sector), [sector]);

  useEffect(() => {
    Promise.all([
      fetch("/api/sectors")
        .then((r) => r.json())
        .then((data) => data[sector] as SectorPriceData),
      fetch(`/api/sectors/${slug}/holdings`)
        .then((r) => r.json())
        .then((data) => data.holdings as Holding[]),
    ])
      .then(([prices, holds]) => {
        setPriceData(prices);
        setHoldings(holds);
      })
      .finally(() => setLoading(false));

    fetch(`/api/sectors/${slug}/summary`)
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
        if (data.generatedAt) setSummaryGeneratedAt(data.generatedAt);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));

    fetch(`/api/sectors/${slug}/analysis`)
      .then((r) => r.json())
      .then((data) => {
        if (data.analysis) setAnalysis(data.analysis);
      })
      .catch(() => {})
      .finally(() => setAnalysisLoading(false));

    fetch(`/api/sectors/${slug}/emerging-leaders`)
      .then((r) => r.json())
      .then((data) => {
        if (data.leaders?.length) setLeaders(data.leaders);
        if (data.generatedAt) setLeadersGeneratedAt(data.generatedAt);
      })
      .catch(() => {})
      .finally(() => setLeadersLoading(false));
  }, [sector, slug]);

  // Fetch metrics once we know which tickers to look up
  useEffect(() => {
    const holdingTickers = holdings?.map((h) => h.symbol) ?? [];
    const leaderTickers = leaders?.map((l) => l.ticker) ?? [];
    const allTickers = [...new Set([...holdingTickers, ...leaderTickers])];
    if (allTickers.length === 0) return;

    fetch(`/api/stocks/metrics?tickers=${allTickers.join(",")}`)
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {});
  }, [holdings, leaders]);

  const chartData = useMemo(() => {
    if (!priceData) return [];
    const days = TIMEFRAME_DAYS[timeframe];
    const nowTs = Math.floor(Date.now() / 1000);
    const cutoff = nowTs - days * 24 * 60 * 60;
    const filtered = priceData.prices.filter((p) => p.ts >= cutoff);
    if (filtered.length === 0) return [];

    const basePrice = filtered[0].close;
    const dateFormat: Intl.DateTimeFormatOptions =
      timeframe === "5Y"
        ? { year: "numeric", month: "short" }
        : timeframe === "1Y"
          ? { year: "numeric", month: "short" }
          : timeframe === "1D"
            ? { hour: "numeric", minute: "2-digit" }
            : { year: "numeric", month: "short", day: "numeric" };

    return filtered.map((p) => ({
      date: new Date(p.ts * 1000).toLocaleDateString("en-US", dateFormat),
      value: parseFloat(
        (((p.close - basePrice) / basePrice) * 100).toFixed(2)
      ),
    }));
  }, [priceData, timeframe]);

  const lastValue =
    chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const isPositive = lastValue >= 0;
  const icon = SECTOR_ICONS[sector] ?? "📊";

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-16 w-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl" role="img" aria-label={sector}>
          {icon}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {sector}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
        </div>
      </div>

      {/* Sector Analysis */}
      {analysisLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : analysis ? (
        <div className="space-y-2">
          {([
            { key: "performance", title: "Performance", content: analysis.performanceSummary },
            { key: "structure", title: "Sector Structure & Valuation", content: analysis.sectorStructure },
            { key: "drivers", title: "Fundamental Drivers", content: analysis.fundamentalDrivers },
            { key: "opportunities", title: "Opportunities", content: analysis.opportunities },
            { key: "risks", title: "Risks", content: analysis.risks },
          ] as const).map(({ key, title, content }) => (
            <div
              key={key}
              className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }))
                }
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {title}
                </h3>
                <span className="text-zinc-400 dark:text-zinc-500">
                  {expandedSections[key] ? "−" : "+"}
                </span>
              </button>
              {expandedSections[key] && (
                <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
                  <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {content}
                  </p>
                </div>
              )}
            </div>
          ))}
          {analysis.generatedAt && (
            <p className="px-2 text-xs text-zinc-400 dark:text-zinc-500">
              Analysis generated{" "}
              {new Date(analysis.generatedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      ) : summaryLoading ? (
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-4 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : summary ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {summary}
          </p>
          {summaryGeneratedAt && (
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Generated{" "}
              {new Date(summaryGeneratedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
          AI analysis unavailable.
        </p>
      )}

      {/* Performance indicators */}
      {priceData && (
        <div className="grid grid-cols-4 gap-3">
          {(["1D", "1M", "1Y", "5Y"] as Timeframe[]).map((tf) => {
            const label =
              tf === "1D"
                ? "1 Day"
                : tf === "1M"
                  ? "1 Month"
                  : tf === "1Y"
                    ? "1 Year"
                    : "5 Years";
            const value = getChangeForTimeframe(priceData.changes, tf);
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex flex-col items-center rounded-xl border px-4 py-3 transition-colors ${
                  active
                    ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
                <ChangeValue value={value} />
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-zinc-100 dark:text-zinc-800"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={false}
                width={50}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--background)",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
                formatter={(value) => [
                  `${Number(value).toFixed(2)}%`,
                  "Change",
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "#10b981" : "#ef4444"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Holdings table */}
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
                      <td className="px-4 py-3 text-sm text-zinc-400">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {holding.symbol}
                          <PreProfitBadge metrics={m} />
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {holding.name}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {holding.weight.toFixed(2)}%
                      </td>
                      {metricColumns.map((key) => (
                        <MetricCell
                          key={key}
                          value={m?.[key] ?? null}
                          metricKey={key}
                          sector={sector}
                        />
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
      {leadersLoading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800" />
      ) : leaders && leaders.length > 0 ? (
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
                      <td className="px-4 py-3 text-sm text-zinc-400">
                        {leader.rank}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {leader.ticker}
                          <PreProfitBadge metrics={m} />
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {leader.companyName}
                        </p>
                      </td>
                      <td className="max-w-xs px-3 py-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {leader.rationale}
                      </td>
                      {metricColumns.map((key) => (
                        <MetricCell
                          key={key}
                          value={m?.[key] ?? null}
                          metricKey={key}
                          sector={sector}
                        />
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
      ) : null}
    </div>
  );
}
