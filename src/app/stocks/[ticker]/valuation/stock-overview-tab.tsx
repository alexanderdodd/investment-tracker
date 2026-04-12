"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import type { StockMetrics } from "@/lib/stock-metrics";
import { sectorToSlug } from "@/lib/sectors";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Timeframe = "1D" | "3M" | "1Y" | "5Y";

const RANGE_MAP: Record<Timeframe, string> = {
  "1D": "1d",
  "3M": "3mo",
  "1Y": "1y",
  "5Y": "5y",
};

const DATE_FORMAT: Record<Timeframe, Intl.DateTimeFormatOptions> = {
  "1D": { hour: "2-digit", minute: "2-digit" },
  "3M": { month: "short", day: "numeric" },
  "1Y": { month: "short", day: "numeric" },
  "5Y": { month: "short", year: "2-digit" },
};

interface ChartPoint {
  ts: number;
  close: number;
}

interface PriceData {
  price: number;
  previousClose: number | null;
  timestamp: string;
  currency: string;
  exchange: string;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  chart?: ChartPoint[];
}

export function StockOverviewTab({ ticker, sector }: { ticker: string; sector?: string }) {
  const [data, setData] = useState<PriceData | null>(null);
  const [dayData, setDayData] = useState<{ price: number; previousClose: number | null } | null>(null);
  const [metrics, setMetrics] = useState<StockMetrics | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/price?chart=true&range=${RANGE_MAP[tf]}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [ticker]);

  // Separate 1D fetch for accurate day change (independent of chart timeframe)
  useEffect(() => {
    async function loadDay() {
      try {
        const res = await fetch(`/api/stocks/${ticker}/price?range=1d`);
        if (res.ok) {
          const json = await res.json();
          setDayData({ price: json.price, previousClose: json.previousClose });
        }
      } catch { /* ignore */ }
    }
    loadDay();
  }, [ticker]);

  // Fetch key metrics
  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await fetch(`/api/stocks/metrics?tickers=${ticker}`);
        if (res.ok) {
          const data = await res.json();
          if (data[ticker]) setMetrics(data[ticker]);
        }
      } catch { /* ignore */ }
    }
    loadMetrics();
  }, [ticker]);

  useEffect(() => {
    loadData(timeframe);
  }, [timeframe, loadData]);

  const chartData = useMemo(() => {
    if (!data?.chart?.length) return [];
    const firstClose = data.chart[0].close;
    return data.chart.map(p => ({
      ts: p.ts,
      date: new Date(p.ts * 1000).toLocaleDateString("en-US", DATE_FORMAT[timeframe]),
      close: p.close,
      change: ((p.close - firstClose) / firstClose) * 100,
    }));
  }, [data, timeframe]);

  const periodChange = useMemo(() => {
    if (!data?.chart?.length) return null;
    const first = data.chart[0].close;
    const last = data.chart[data.chart.length - 1].close;
    return ((last - first) / first) * 100;
  }, [data]);

  const isPositive = (periodChange ?? 0) >= 0;
  const lineColor = isPositive ? "#22c55e" : "#ef4444";

  if (!data && loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Price performance</p>
            {periodChange !== null && (
              <p className={`text-lg font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
                {isPositive ? "+" : ""}{periodChange.toFixed(1)}%
                <span className="ml-2 text-sm font-normal text-zinc-400 dark:text-zinc-500">
                  {timeframe === "1D" ? "today" : `past ${timeframe.replace("M", " months").replace("Y", " year").replace("5 year", "5 years")}`}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-1">
            {(["1D", "3M", "1Y", "5Y"] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
                  domain={["dataMin - 1", "dataMax + 1"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(24,24,27,0.95)",
                    border: "1px solid rgba(63,63,70,0.5)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#e4e4e7",
                  }}
                  formatter={(value: unknown) => [`${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`, "Change"]}
                  labelFormatter={(label: unknown) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey="change"
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              {loading ? "Loading chart data..." : "No chart data available"}
            </div>
          )}
        </div>
      </div>

      {/* Key stats */}
      {data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Current Price" value={`$${data.price.toFixed(2)}`} />
          <StatCard
            label="Day Change"
            value={dayData?.previousClose ? `${((dayData.price - dayData.previousClose) / dayData.previousClose * 100) >= 0 ? "+" : ""}${((dayData.price - dayData.previousClose) / dayData.previousClose * 100).toFixed(2)}%` : "—"}
            color={dayData?.previousClose && dayData.price >= dayData.previousClose ? "green" : "red"}
          />
          <StatCard label="52W High" value={data.fiftyTwoWeekHigh ? `$${data.fiftyTwoWeekHigh.toFixed(2)}` : "—"} />
          <StatCard label="52W Low" value={data.fiftyTwoWeekLow ? `$${data.fiftyTwoWeekLow.toFixed(2)}` : "—"} />
        </div>
      )}

      {/* Key Metrics */}
      {metrics && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Key metrics</p>
            {sector && (
              <Link
                href={`/sectors/${sectorToSlug(sector)}`}
                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {sector}
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3">
            <MetricRow label="Forward P/E" value={metrics.forwardPE} format="ratio" />
            <MetricRow label="Trailing P/E" value={metrics.trailingPE} format="ratio" />
            <MetricRow label="EV/EBITDA" value={metrics.evToEbitda} format="ratio" />
            <MetricRow label="Price/Book" value={metrics.priceToBook} format="ratio" />
            <MetricRow label="Price/Sales" value={metrics.priceToSales} format="ratio" />
            <MetricRow label="PEG Ratio" value={metrics.pegRatio} format="ratio" />
            <MetricRow label="Operating Margin" value={metrics.operatingMargin} format="percent" />
            <MetricRow label="Gross Margin" value={metrics.grossMargin} format="percent" />
            <MetricRow label="ROE" value={metrics.roe} format="percent" />
            <MetricRow label="ROIC" value={metrics.roic} format="percent" />
            <MetricRow label="Revenue Growth" value={metrics.revenueGrowth} format="percent" />
            <MetricRow label="Free Cash Flow" value={metrics.freeCashFlow} format="currency" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${
        color === "green" ? "text-green-500" : color === "red" ? "text-red-500" : "text-zinc-900 dark:text-zinc-100"
      }`}>
        {value}
      </p>
    </div>
  );
}

function MetricRow({ label, value, format }: { label: string; value: number | null; format: "ratio" | "percent" | "currency" }) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
      </div>
    );
  }

  let formatted: string;
  let color = "";
  if (format === "ratio") {
    formatted = `${value.toFixed(1)}x`;
  } else if (format === "percent") {
    formatted = `${(value * 100).toFixed(1)}%`;
    color = value >= 0 ? "text-green-500" : "text-red-500";
  } else {
    const abs = Math.abs(value);
    formatted = abs >= 1e9 ? `$${(value / 1e9).toFixed(1)}B` : abs >= 1e6 ? `$${(value / 1e6).toFixed(0)}M` : `$${value.toFixed(0)}`;
    color = value >= 0 ? "text-green-500" : "text-red-500";
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-xs font-medium ${color || "text-zinc-900 dark:text-zinc-100"}`}>{formatted}</span>
    </div>
  );
}
