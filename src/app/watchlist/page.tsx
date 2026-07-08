"use client";

import { useEffect, useState } from "react";
import { RuleOneTable } from "@/components/rule-one-table";

interface WatchlistItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  addedAt: string;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
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

  async function removeFromWatchlist(ticker: string) {
    await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              My Watchlist
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The Big Five (10-year) plus sticker price and margin of safety for every stock
              you&apos;re tracking
            </p>
          </div>
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
            <RuleOneTable items={items} onRemove={removeFromWatchlist} />
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Big Five are 10-year figures (ROIC = average, growth = CAGR) from SEC filings; sticker
          and MOS use the default Rule #1 inputs — open a stock&apos;s Sticker Price tab to
          adjust the growth assumption. Price turns green at or below MOS, amber below sticker,
          red above. First load of an untracked stock can take ~30s while SEC data is fetched.
        </p>
      </div>
    </div>
  );
}
