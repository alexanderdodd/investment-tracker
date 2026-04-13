"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type StockMetrics,
  type MetricRating,
  METRIC_INFO,
  formatMetric,
  rateMetric,
} from "@/lib/stock-metrics";
import { MetricTooltip } from "@/components/metric-tooltip";

interface WatchlistItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  addedAt: string;
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
      {formatMetric(value, info.format)}
    </td>
  );
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [metrics, setMetrics] = useState<Record<string, StockMetrics>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const tickers = items.map((i) => i.ticker);
    if (tickers.length === 0) return;

    fetch(`/api/stocks/metrics?tickers=${tickers.join(",")}`)
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {});
  }, [items]);

  async function removeFromWatchlist(ticker: string) {
    await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              My Watchlist
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Stocks you&apos;re tracking
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            Home
          </Link>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Your watchlist is empty. Visit a stock page and click &quot;Watch&quot; to add it here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 font-medium">Sector</th>
                    {METRIC_COLUMNS.map((key) => {
                      const info = METRIC_INFO[key];
                      // Strip sector-specific thresholds from tooltip since watchlist has mixed sectors
                      const desc = typeof info.description === "string"
                        ? info.description
                        : info.label;
                      return (
                        <th key={key} className="px-3 py-3 text-right font-medium">
                          <MetricTooltip label={info.label} description={desc}>
                            <span className="text-xs">{info.short}</span>
                          </MetricTooltip>
                        </th>
                      );
                    })}
                    <th className="px-3 py-3 text-right font-medium">Added</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const m = metrics[item.ticker];
                    return (
                      <tr
                        key={item.ticker}
                        className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/stocks/${item.ticker}/valuation`}
                            className="group"
                          >
                            <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                              {item.ticker}
                            </p>
                            {item.companyName && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {item.companyName}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                          {item.sector ?? "-"}
                        </td>
                        {METRIC_COLUMNS.map((key) => (
                          <MetricCell
                            key={key}
                            value={m?.[key] ?? null}
                            metricKey={key}
                            sector={item.sector ?? ""}
                          />
                        ))}
                        <td className="px-3 py-3 text-right text-xs text-zinc-400 dark:text-zinc-500">
                          {new Date(item.addedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => removeFromWatchlist(item.ticker)}
                            className="text-xs text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                            title="Remove from watchlist"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
