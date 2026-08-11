"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  RuleOneTable,
  type RuleOneSortKey,
  type SortDir,
} from "@/components/rule-one-table";
import { MosControl, useRememberedMos, useRememberedOnlyOnSale } from "@/components/mos-control";
import {
  StatusPicker,
  WATCHLIST_STATUSES,
  type WatchlistStatus,
} from "@/components/watchlist-status";
import { labelPillClass } from "@/components/stock-labels";
import type { StockLabel } from "@/lib/labels";

interface ListItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  note: string | null;
  status: string;
  addedAt: string;
}

interface ListMeta {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

const SORT_OPTIONS: { value: RuleOneSortKey; label: string }[] = [
  { value: "added", label: "Date added" },
  { value: "ticker", label: "Ticker" },
  { value: "name", label: "Company name" },
  { value: "price", label: "Price" },
  { value: "sticker", label: "Sticker price" },
  { value: "mos", label: "Margin of safety" },
];

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params.id;

  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [filter, setFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<RuleOneSortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [mosFraction, setMosFraction] = useRememberedMos();
  const [onlyOnSale, setOnlyOnSale] = useRememberedOnlyOnSale();

  const [labels, setLabels] = useState<StockLabel[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [labelFilter, setLabelFilter] = useState<Record<string, "include" | "exclude">>({});

  const [addTicker, setAddTicker] = useState("");
  const [addNote, setAddNote] = useState("");
  const [adding, setAdding] = useState(false);

  const loadList = useCallback(() => {
    fetch(`/api/lists/${listId}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data) return;
        setMeta(data.list ?? null);
        setItems(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

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

  async function removeFromList(ticker: string) {
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
    await fetch(`/api/lists/${listId}/items/${encodeURIComponent(ticker)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async function setStatus(ticker: string, status: WatchlistStatus) {
    const prev = items;
    setItems((cur) => cur.map((i) => (i.ticker === ticker ? { ...i, status } : i)));
    const res = await fetch(`/api/lists/${listId}/items/${encodeURIComponent(ticker)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) setItems(prev);
  }

  async function editNote(ticker: string, note: string) {
    const prev = items;
    setItems((cur) => cur.map((i) => (i.ticker === ticker ? { ...i, note: note || null } : i)));
    const res = await fetch(`/api/lists/${listId}/items/${encodeURIComponent(ticker)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    }).catch(() => null);
    if (!res?.ok) setItems(prev);
  }

  async function addStock() {
    const ticker = addTicker.trim().toUpperCase();
    if (!ticker || adding) return;
    setAdding(true);
    const note = addNote.trim();
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, note: note || undefined }),
    }).catch(() => null);
    setAdding(false);
    if (res?.ok) {
      setAddTicker("");
      setAddNote("");
      loadList();
    }
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
  const noteByTicker: Record<string, string | null> = {};
  for (const i of items) noteByTicker[i.ticker] = i.note;

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              This list doesn&apos;t exist.{" "}
              <Link href="/lists" className="text-blue-600 dark:text-blue-400">
                Back to your lists
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="space-y-1">
          <Link
            href="/lists"
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ← All watchlists
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {meta?.name ?? "List"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The Big Five (10-year) plus sticker price and margin of safety for every stock in this
            list.
          </p>
        </div>

        {/* Add a stock */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={addTicker}
            onChange={(e) => setAddTicker(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStock();
              }
            }}
            placeholder="Add ticker (e.g. KO)"
            className="w-40 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm uppercase text-zinc-900 placeholder:text-zinc-400 placeholder:normal-case focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <input
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStock();
              }
            }}
            placeholder="Optional note…"
            className="w-56 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            onClick={addStock}
            disabled={!addTicker.trim() || adding}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add"}
          </button>
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

        {/* Sort + MOS controls */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Sort by
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as RuleOneSortKey)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={sortDir === "asc" ? "Ascending" : "Descending"}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </label>
            <MosControl
              value={mosFraction}
              onChange={setMosFraction}
              onlyOnSale={onlyOnSale}
              onOnlyOnSaleChange={setOnlyOnSale}
            />
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              This list is empty. Add a ticker above, or visit a stock page and use “Add to list”.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">Nothing matches the current filters.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <RuleOneTable
              items={visible}
              onRemove={removeFromList}
              mosFraction={mosFraction}
              onlyOnSale={onlyOnSale}
              sortKey={sortKey}
              sortDir={sortDir}
              extraHeader="Status"
              renderExtra={(item) => (
                <StatusPicker
                  value={statusByTicker.get(item.ticker) ?? "watching"}
                  onChange={(status) => setStatus(item.ticker, status)}
                />
              )}
              notes={noteByTicker}
              onEditNote={editNote}
              labels={labels}
              assignments={assignments}
              onToggleLabel={toggleLabel}
              onCreateLabel={createAndAssignLabel}
            />
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Big Five are 10-year figures (ROIC = average, growth = CAGR) from SEC filings; sticker
          uses the default Rule #1 growth inputs. The MOS slider sets your buy target: price turns
          green at or below MOS, amber below sticker, red above. First load of an untracked stock
          can take ~30s while SEC data is fetched.
        </p>
      </div>
    </div>
  );
}
