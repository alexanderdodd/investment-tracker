"use client";

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

interface SectorData {
  ticker: string;
  data: { date: string; value: number }[];
}

export function SectorCard({
  sector,
  sectorData,
}: {
  sector: string;
  sectorData: SectorData;
}) {
  const { ticker, data } = sectorData;
  const icon = SECTOR_ICONS[sector] ?? "📊";

  const lastValue = data.length > 0 ? data[data.length - 1].value : 0;
  const isPositive = lastValue >= 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
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
        <span
          className={`text-sm font-semibold ${
            isPositive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {lastValue.toFixed(2)}%
        </span>
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
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
              width={35}
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
    </div>
  );
}
