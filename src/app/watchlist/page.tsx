"use client";

import { useEffect, useState } from "react";
import { RuleOneTable } from "@/components/rule-one-table";
import {
  StatusPicker,
  WATCHLIST_STATUSES,
  type WatchlistStatus,
} from "@/components/watchlist-status";

interface WatchlistItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  status: string;
  addedAt: string;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

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

  async function setStatus(ticker: string, status: WatchlistStatus) {
    const prev = items;
    // Optimistic update; revert on failure
    setItems((cur) => cur.map((i) => (i.ticker === ticker ? { ...i, status } : i)));
    const res = await fetch(`/api/watchlist/${ticker}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) setItems(prev);
  }

  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);
  const statusByTicker = new Map(items.map((i) => [i.ticker, i.status]));

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

        {/* Status filter */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "border-zinc-400 bg-zinc-500/15 text-zinc-700 dark:text-zinc-200"
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              All ({items.length})
            </button>
            {WATCHLIST_STATUSES.map((s) => {
              const n = counts.get(s.value) ?? 0;
              if (n === 0) return null;
              return (
                <button
                  key={s.value}
                  onClick={() => setFilter(filter === s.value ? "all" : s.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    filter === s.value
                      ? s.active
                      : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label} ({n})
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              Your watchlist is empty. Visit a stock page and click &quot;Watch&quot; to add it here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              No stocks with this status yet — use the pill next to a stock to set one.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <RuleOneTable
              items={visible}
              onRemove={removeFromWatchlist}
              extraHeader="Status"
              renderExtra={(item) => (
                <StatusPicker
                  value={statusByTicker.get(item.ticker) ?? "watching"}
                  onChange={(status) => setStatus(item.ticker, status)}
                />
              )}
            />
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
