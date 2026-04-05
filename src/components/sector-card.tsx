"use client";

import { useMemo } from "react";
import Link from "next/link";
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

export type Timeframe = "1D" | "1M" | "1Y" | "5Y";

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

interface SectorData {
  ticker: string;
  prices: PricePoint[];
  changes: { day: number | null; month: number | null; year: number | null; fiveYear: number | null };
}

function getChangeForTimeframe(
  changes: SectorData["changes"],
  tf: Timeframe
): number | null {
  if (tf === "1D") return changes.day;
  if (tf === "1M") return changes.month;
  if (tf === "1Y") return changes.year;
  return changes.fiveYear;
}

function ChangeChip({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  active: boolean;
  onClick: () => void;
}) {
  if (value === null) {
    return (
      <button
        onClick={onClick}
        className={`flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-1 transition-colors ${
          active
            ? "bg-zinc-200 dark:bg-zinc-700"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
          {label}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
      </button>
    );
  }

  const isPositive = value >= 0;

  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-1 transition-colors ${
        active
          ? "bg-zinc-200 dark:bg-zinc-700"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${
          isPositive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {isPositive ? "+" : ""}
        {value.toFixed(1)}%
      </span>
    </button>
  );
}

export function SectorCard({
  sector,
  sectorData,
  timeframe,
  onTimeframeChange,
}: {
  sector: string;
  sectorData: SectorData;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const { ticker, prices, changes } = sectorData;
  const icon = SECTOR_ICONS[sector] ?? "📊";

  const chartData = useMemo(() => {
    const days = TIMEFRAME_DAYS[timeframe];
    const nowTs = Math.floor(Date.now() / 1000);
    const cutoff = nowTs - days * 24 * 60 * 60;
    const filtered = prices.filter((p) => p.ts >= cutoff);
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
  }, [prices, timeframe]);

  const lastValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const isPositive = lastValue >= 0;
  const activeChange = getChangeForTimeframe(changes, timeframe);

  return (
    <Link
      href={`/sectors/${sectorToSlug(sector)}`}
      className="block overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label={sector}>
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {sector}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{ticker}</p>
          </div>
        </div>
        {activeChange !== null && (
          <span
            className={`text-sm font-semibold ${
              activeChange >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {activeChange >= 0 ? "+" : ""}
            {activeChange.toFixed(1)}%
          </span>
        )}
      </div>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-50 py-1 dark:bg-zinc-800/50" onClick={(e) => e.preventDefault()}>
        <ChangeChip
          label="1D"
          value={changes.day}
          active={timeframe === "1D"}
          onClick={() => onTimeframeChange("1D")}
        />
        <ChangeChip
          label="1M"
          value={changes.month}
          active={timeframe === "1M"}
          onClick={() => onTimeframeChange("1M")}
        />
        <ChangeChip
          label="1Y"
          value={changes.year}
          active={timeframe === "1Y"}
          onClick={() => onTimeframeChange("1Y")}
        />
        <ChangeChip
          label="5Y"
          value={changes.fiveYear}
          active={timeframe === "5Y"}
          onClick={() => onTimeframeChange("5Y")}
        />
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-zinc-100 dark:text-zinc-800"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--background)",
                border: "1px solid #3f3f46",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${Number(value).toFixed(2)}%`, "Change"]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Link>
  );
}
