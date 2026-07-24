"use client";

import { useEffect, useState } from "react";
import { RuleOneTable } from "@/components/rule-one-table";
import { MosControl, useRememberedMos, useRememberedOnlyOnSale } from "@/components/mos-control";
import {
  StatusPicker,
  WATCHLIST_STATUSES,
  type WatchlistStatus,
} from "@/components/watchlist-status";
import { labelPillClass } from "@/components/stock-labels";
import type { StockLabel } from "@/lib/labels";

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
  const [mosFraction, setMosFraction] = useRememberedMos();
  const [onlyOnSale, setOnlyOnSale] = useRememberedOnlyOnSale();
  // User-defined labels: catalogue + ticker→labelIds map, and a client-side
  // tri-state filter per label (include = only these, exclude = hide these).
  const [labels, setLabels] = useState<StockLabel[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [labelFilter, setLabelFilter] = useState<Record<string, "include" | "exclude">>({});

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load the user's labels + assignments
  useEffect(() => {
    fetch("/api/labels")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setLabels(json.labels ?? []);
        setAssignments(json.assignments ?? {});
      })
      .catch(() => {});
  }, []);

  // Apply/remove a label on a stock, optimistically. Reverts on failure.
  async function toggleLabel(ticker: string, labelId: string, assign: boolean) {
    setAssignments((prev) => {
      const cur = prev[ticker] ?? [];
      const next = assign ? [...new Set([...cur, labelId])] : cur.filter((id) => id !== labelId);
      return { ...prev, [ticker]: next };
    });
    try {
      const res = await fetch("/api/labels/assign", {
        method: assign ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, labelId }),
      });
      if (!res.ok) throw new Error("assign failed");
    } catch {
      setAssignments((prev) => {
        const cur = prev[ticker] ?? [];
        const next = assign ? cur.filter((id) => id !== labelId) : [...new Set([...cur, labelId])];
        return { ...prev, [ticker]: next };
      });
    }
  }

  // Create a new label and immediately apply it to the stock.
  async function createAndAssignLabel(ticker: string, name: string) {
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { label } = (await res.json()) as { label: StockLabel };
      setLabels((prev) => (prev.some((l) => l.id === label.id) ? prev : [...prev, label]));
      await toggleLabel(ticker, label.id, true);
    } catch {
      /* ignore */
    }
  }

  // Cycle a label's filter state: off → include → exclude → off.
  function cycleLabelFilter(labelId: string) {
    setLabelFilter((prev) => {
      const next = { ...prev };
      const cur = prev[labelId];
      if (!cur) next[labelId] = "include";
      else if (cur === "include") next[labelId] = "exclude";
      else delete next[labelId];
      return next;
    });
  }

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
  const includes = Object.keys(labelFilter).filter((id) => labelFilter[id] === "include");
  const excludes = Object.keys(labelFilter).filter((id) => labelFilter[id] === "exclude");
  const visible = items.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (includes.length > 0 || excludes.length > 0) {
      const ids = assignments[i.ticker] ?? [];
      if (excludes.some((id) => ids.includes(id))) return false;
      if (includes.length > 0 && !includes.some((id) => ids.includes(id))) return false;
    }
    return true;
  });
  const statusByTicker = new Map(items.map((i) => [i.ticker, i.status]));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 space-y-6">
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

        {/* Label filter — click to show only those, again to hide them */}
        {items.length > 0 && labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Labels:</span>
            {labels.map((l) => {
              const state = labelFilter[l.id];
              return (
                <button
                  key={l.id}
                  onClick={() => cycleLabelFilter(l.id)}
                  title={
                    state === "include"
                      ? `Only showing “${l.name}” — click to hide instead`
                      : state === "exclude"
                        ? `Hiding “${l.name}” — click to clear`
                        : `Show only “${l.name}”`
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${labelPillClass(
                    l.color
                  )} ${
                    state === "include"
                      ? "ring-2 ring-current ring-offset-1 ring-offset-white dark:ring-offset-black"
                      : state === "exclude"
                        ? "opacity-40 line-through"
                        : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {state === "exclude" && <span className="no-underline">∅</span>}
                  {l.name}
                </button>
              );
            })}
            {Object.keys(labelFilter).length > 0 && (
              <button
                onClick={() => setLabelFilter({})}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                clear
              </button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <MosControl
            value={mosFraction}
            onChange={setMosFraction}
            onlyOnSale={onlyOnSale}
            onOnlyOnSaleChange={setOnlyOnSale}
          />
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
              mosFraction={mosFraction}
              onlyOnSale={onlyOnSale}
              extraHeader="Status"
              renderExtra={(item) => (
                <StatusPicker
                  value={statusByTicker.get(item.ticker) ?? "watching"}
                  onChange={(status) => setStatus(item.ticker, status)}
                />
              )}
              labels={labels}
              assignments={assignments}
              onToggleLabel={toggleLabel}
              onCreateLabel={createAndAssignLabel}
            />
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Big Five are 10-year figures (ROIC = average, growth = CAGR) from SEC filings; sticker
          uses the default Rule #1 growth inputs — open a stock&apos;s Sticker Price tab to adjust
          the growth assumption. The MOS slider sets your buy target: price turns green at or
          below MOS, amber below sticker, red above. First load of an untracked stock can take
          ~30s while SEC data is fetched.
        </p>
      </div>
    </div>
  );
}
