"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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

export function StockOverviewTab({ ticker }: { ticker: string }) {
  const [data, setData] = useState<PriceData | null>(null);
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
            value={data.previousClose ? `${((data.price - data.previousClose) / data.previousClose * 100) >= 0 ? "+" : ""}${((data.price - data.previousClose) / data.previousClose * 100).toFixed(2)}%` : "—"}
            color={data.previousClose && data.price >= data.previousClose ? "green" : "red"}
          />
          <StatCard label="52W High" value={data.fiftyTwoWeekHigh ? `$${data.fiftyTwoWeekHigh.toFixed(2)}` : "—"} />
          <StatCard label="52W Low" value={data.fiftyTwoWeekLow ? `$${data.fiftyTwoWeekLow.toFixed(2)}` : "—"} />
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
