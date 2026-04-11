"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { PricePoint, ExtendedChanges } from "@/lib/sector-data";
import type { SectorInsights } from "@/lib/sector-insights";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

interface TabOverviewProps {
  sectorPrices: PricePoint[];
  benchmarkPrices: PricePoint[];
  sectorTicker: string;
  sectorChanges: ExtendedChanges;
  benchmarkChanges: ExtendedChanges;
  insights: SectorInsights | null;
  holdings: Holding[];
}

const TIMEFRAMES = ["1M", "3M", "1Y", "3Y"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  "3Y": 3 * 365,
};

function filterAndNormalize(
  sectorPrices: PricePoint[],
  benchmarkPrices: PricePoint[],
  days: number
) {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  const filteredSector = sectorPrices.filter((p) => p.ts * 1000 >= cutoff);
  const filteredBenchmark = benchmarkPrices.filter(
    (p) => p.ts * 1000 >= cutoff
  );

  if (filteredSector.length === 0 || filteredBenchmark.length === 0) return [];

  const sectorBase = filteredSector[0].close;
  const benchmarkBase = filteredBenchmark[0].close;

  // Build a map of benchmark prices by timestamp for alignment
  const benchmarkMap = new Map<number, number>();
  for (const p of filteredBenchmark) {
    benchmarkMap.set(p.ts, ((p.close - benchmarkBase) / benchmarkBase) * 100);
  }

  // Use sector timestamps as the primary axis
  const data: {
    ts: number;
    date: string;
    sector: number | null;
    spy: number | null;
  }[] = [];

  // Collect all unique timestamps from both series
  const allTimestamps = new Set<number>();
  for (const p of filteredSector) allTimestamps.add(p.ts);
  for (const p of filteredBenchmark) allTimestamps.add(p.ts);

  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  // Build indexed lookups
  const sectorMap = new Map<number, number>();
  for (const p of filteredSector) {
    sectorMap.set(p.ts, ((p.close - sectorBase) / sectorBase) * 100);
  }

  for (const ts of sortedTimestamps) {
    const d = new Date(ts * 1000);
    data.push({
      ts,
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sector: sectorMap.get(ts) ?? null,
      spy: benchmarkMap.get(ts) ?? null,
    });
  }

  return data;
}

function valuationColor(valuation: "Cheap" | "Fair" | "Expensive") {
  switch (valuation) {
    case "Cheap":
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Fair":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Expensive":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
  }
}

function concentrationColor(weight: number) {
  if (weight > 50) return "text-red-600 dark:text-red-400";
  if (weight >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

export default function TabOverview({
  sectorPrices,
  benchmarkPrices,
  sectorTicker,
  insights,
  holdings,
}: TabOverviewProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");

  const chartData = useMemo(
    () =>
      filterAndNormalize(
        sectorPrices,
        benchmarkPrices,
        TIMEFRAME_DAYS[timeframe]
      ),
    [sectorPrices, benchmarkPrices, timeframe]
  );

  const top3Weight = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
    return sorted.slice(0, 3).reduce((sum, h) => sum + h.weight, 0);
  }, [holdings]);

  return (
    <div className="space-y-6">
      {/* Top half — two column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column — Performance chart */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Performance
            </h3>
            <div className="flex gap-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    timeframe === tf
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-zinc-200 dark:text-zinc-800"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  className="text-zinc-400"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  className="text-zinc-400"
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-zinc-900, #18181b)",
                    border: "1px solid var(--color-zinc-700, #3f3f46)",
                    borderRadius: "0.5rem",
                    fontSize: "0.75rem",
                    color: "#fff",
                  }}
                  formatter={(value) => [
                    `${Number(value).toFixed(2)}%`,
                    "Change",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="sector"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="spy"
                  stroke="#a1a1aa"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-blue-500" />
              {sectorTicker}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-zinc-400" />
              SPY
            </span>
          </div>

          {/* Performance summary */}
          {insights?.performanceSummary && (
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {insights.performanceSummary}
            </p>
          )}
        </div>

        {/* Right column — Valuation & Metrics */}
        <div className="space-y-4">
          {/* Valuation card */}
          {insights && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Valuation
              </h3>
              <div className="flex items-center gap-3">
                {insights.forwardPE !== null && (
                  <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {insights.forwardPE.toFixed(1)}x
                  </span>
                )}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Forward P/E
                </span>
                <span
                  className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium ${valuationColor(insights.valuation)}`}
                >
                  {insights.valuation}
                </span>
              </div>
            </div>
          )}

          {/* Concentration card */}
          {holdings.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Concentration
              </h3>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${concentrationColor(top3Weight)}`}
                >
                  {top3Weight.toFixed(1)}%
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Top 3 holdings
                </span>
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {holdings
                  .slice(0, 3)
                  .map((h) => h.symbol)
                  .join(", ")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom half — three column grid */}
      {insights && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Drivers */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Drivers
            </h3>
            <ul className="space-y-2">
              {insights.topDrivers.map((d, i) => (
                <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {d.label}
                  </span>{" "}
                  {d.detail}
                </li>
              ))}
            </ul>
          </div>

          {/* Risks */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Risks
            </h3>
            <ul className="space-y-2">
              {insights.topRisks.map((r, i) => (
                <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {r.label}
                  </span>{" "}
                  {r.detail}
                </li>
              ))}
            </ul>
          </div>

          {/* Watch Next */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Watch Next
            </h3>
            <ul className="space-y-2">
              {insights.watchItems.map((w, i) => (
                <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {w.label}
                  </span>{" "}
                  {w.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
