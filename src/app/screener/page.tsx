"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MetricRating } from "@/lib/stock-metrics";
import { MetricTooltip } from "@/components/metric-tooltip";
import { TriHorizonValues, TriHorizonHeader } from "@/components/tri-horizon";
import { MosControl, useRememberedMos, useRememberedOnlyOnSale } from "@/components/mos-control";
import { currentMos, priceVerdictAt } from "@/lib/rule-one";
import { formatMoney } from "@/lib/currency";
import { friendlyExchange } from "@/lib/exchanges";
import { displayTag } from "@/lib/meaning-tags";
import { StockLabels, labelPillClass } from "@/components/stock-labels";
import type { StockLabel } from "@/lib/labels";

interface ScreenRow {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  currency: string | null;
  score: number;
  roic10y: number | null;
  roic5y: number | null;
  roic1y: number | null;
  sales10y: number | null;
  sales5y: number | null;
  sales1y: number | null;
  eps10y: number | null;
  eps5y: number | null;
  eps1y: number | null;
  equity10y: number | null;
  equity5y: number | null;
  equity1y: number | null;
  fcf10y: number | null;
  fcf5y: number | null;
  fcf1y: number | null;
  minSpanYears: number | null;
  marketCap: number | null;
  price: number | null;
  exchange: string | null;
  sticker: number | null;
  mos: number | null;
  verdict: string | null;
  pctFrom52wHigh: number | null;
  pctVs50dAvg: number | null;
  pctVs200dAvg: number | null;
  oneLiner: string | null;
  tags: string[] | null;
  matchedTags: string[];
}

interface ScreenStats {
  total: number;
  available: number;
  pass3: number;
  pass4: number;
  pass5: number;
  matching: number;
  latest: string | null;
}

const RATING_COLORS: Record<MetricRating, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
  caution: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

const BIG_FIVE_COLS: {
  base: "roic" | "sales" | "eps" | "equity" | "fcf";
  short: string;
  label: string;
}[] = [
  { base: "roic", short: "ROIC", label: "ROIC — 10y/5y averages, latest year" },
  { base: "sales", short: "Sales", label: "Sales growth — 10y/5y CAGR, 1y YoY" },
  { base: "eps", short: "EPS", label: "EPS growth — 10y/5y CAGR, 1y YoY" },
  { base: "equity", short: "Equity", label: "Equity growth — 10y/5y CAGR, 1y YoY" },
  { base: "fcf", short: "FCF", label: "FCF growth — 10y/5y CAGR, 1y YoY" },
];

// Market-cap bands (min inclusive, max exclusive) so you can isolate a single
// tier — "just small caps" — not only a floor. `max: null` = no upper bound.
const MCAP_BANDS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "any", label: "Any size", min: 0, max: null },
  { key: "micro", label: "Micro (< $300M)", min: 0, max: 3e8 },
  { key: "small", label: "Small ($300M–$2B)", min: 3e8, max: 2e9 },
  { key: "mid", label: "Mid ($2B–$10B)", min: 2e9, max: 1e10 },
  { key: "large", label: "Large ($10B–$200B)", min: 1e10, max: 2e11 },
  { key: "mega", label: "Mega (≥ $200B)", min: 2e11, max: null },
];

// One hue per Yahoo sector so rows can be scanned/grouped visually. Full class
// strings (not interpolated) so Tailwind's scanner keeps them.
const SECTOR_COLORS: Record<string, string> = {
  Technology: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "Financial Services": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Healthcare: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  Industrials: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Consumer Cyclical": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "Consumer Defensive": "bg-lime-500/10 text-lime-600 dark:text-lime-400",
  Energy: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "Basic Materials": "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  "Real Estate": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Utilities: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  "Communication Services": "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
};
const SECTOR_FALLBACK = "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400";

const SORT_OPTIONS = [
  { value: "score", label: "Big Five score" },
  { value: "relevance", label: "Relevance (my interests)" },
  { value: "roic", label: "ROIC" },
  { value: "sales", label: "Sales growth" },
  { value: "eps", label: "EPS growth" },
  { value: "discount", label: "Discount to sticker" },
  { value: "off52high", label: "Below 52-week high" },
  { value: "marketCap", label: "Market cap" },
];

function fmtMcap(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

function fmtMoney(v: number | null, currency?: string | null): string {
  return formatMoney(v, currency ?? "USD");
}

/** Current margin of safety as a signed percentage (e.g. "+42%", "-13%"). */
function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  const pct = Math.round(v * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

// The screener's dropdown/toggle filters, remembered in localStorage so the
// page comes back the way you left it (score tier, region, sector, size, sort,
// watched-only). MOS fraction and "only on sale" are remembered separately.
const FILTERS_KEY = "rule-one-screener-filters";
interface SavedScreenerFilters {
  minScore?: number;
  sector?: string;
  region?: string;
  minMcap?: number;
  maxMcap?: number | null;
  sort?: string;
  watchedOnly?: boolean;
}
function loadScreenerFilters(): SavedScreenerFilters {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "{}") as SavedScreenerFilters;
  } catch {
    return {};
  }
}

export default function ScreenerPage() {
  // useSearchParams requires a Suspense boundary in client pages
  return (
    <Suspense fallback={null}>
      <ScreenerPageInner />
    </Suspense>
  );
}

function ScreenerPageInner() {
  const searchParams = useSearchParams();
  // Restore remembered filters (URL params, when present, still take precedence
  // so deep-links win). Read once on mount.
  const saved = useMemo(() => loadScreenerFilters(), []);
  const [minScore, setMinScore] = useState(() => {
    const p = searchParams.get("minScore");
    return p != null ? parseInt(p, 10) : saved.minScore ?? 4;
  });
  const [sector, setSector] = useState(saved.sector ?? "");
  const [region, setRegion] = useState(saved.region ?? "");
  const [minMcap, setMinMcap] = useState(() => {
    const p = searchParams.get("minMcap");
    return p != null ? parseFloat(p) : saved.minMcap ?? 0;
  });
  const [maxMcap, setMaxMcap] = useState<number | null>(saved.maxMcap ?? null);
  // Whether the current cap range is one of the preset bands (vs a custom cap
  // set by a natural-language query) — governs the removable "≤ $X" chip.
  const mcapIsBand = MCAP_BANDS.some(
    (b) => b.min === minMcap && (b.max ?? null) === (maxMcap ?? null)
  );
  const [sort, setSort] = useState(searchParams.get("sort") ?? saved.sort ?? "score");
  const [mosFraction, setMosFraction] = useRememberedMos();
  const [onlyOnSale, setOnlyOnSale] = useRememberedOnlyOnSale();
  // Watchlist: which tickers the signed-in user is watching, plus in-flight
  // toggles so a star can't be double-clicked. `authed` gates the whole
  // watch UI — the screener is usable signed-out (it's public SEC data).
  const [authed, setAuthed] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchBusy, setWatchBusy] = useState<Set<string>>(new Set());
  const [watchedOnly, setWatchedOnly] = useState(saved.watchedOnly ?? false);
  // User-defined labels: the label catalogue + a ticker→labelIds map, both
  // loaded once for the signed-in user. `labelFilter` is a client-side tri-state
  // per label (include = only these, exclude = hide these).
  const [labels, setLabels] = useState<StockLabel[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [labelFilter, setLabelFilter] = useState<Record<string, "include" | "exclude">>({});
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [nlInput, setNlInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{
    query: string;
    data: {
      rows: ScreenRow[];
      stats: ScreenStats;
      sectors: string[];
      relevanceAvailable?: boolean;
    };
  } | null>(null);

  // Remember the dropdown/toggle filters so they persist across visits.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const data: SavedScreenerFilters = { minScore, sector, region, minMcap, maxMcap, sort, watchedOnly };
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota/private-mode errors */
    }
  }, [minScore, sector, region, minMcap, maxMcap, sort, watchedOnly]);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      minScore: String(minScore),
      minMcap: String(minMcap),
      sort,
      limit: "200",
    });
    if (sector) params.set("sector", sector);
    if (region) params.set("region", region);
    if (maxMcap) params.set("maxMcap", String(maxMcap));
    if (tags.length > 0) params.set("tags", tags.join(","));
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
    return params.toString();
  }, [minScore, sector, region, minMcap, maxMcap, sort, tags, keywords]);

  // NL query → one LLM parse → chips; chip edits re-query with zero LLM calls
  const parseNl = async () => {
    const q = nlInput.trim();
    if (!q || parsing) return;
    setParsing(true);
    setParseNotice(null);
    try {
      const res = await fetch("/api/screener/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (res.status === 401) {
        setParseNotice("Sign in to use natural-language filters.");
        return;
      }
      const data = await res.json();
      setTags(data.tags ?? []);
      setKeywords(data.keywords ?? []);
      if (data.minScore != null) setMinScore(data.minScore);
      if (data.minMcap != null) setMinMcap(data.minMcap);
      setMaxMcap(data.maxMcap ?? null);
      if (data.sector != null) setSector(data.sector);
      if (data.fallback) {
        setParseNotice("Couldn't fully parse that — searching by keywords instead.");
      }
    } catch {
      setParseNotice("Parse failed — try plain filters below.");
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/screener?${query}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setResult({ query, data: json });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Load the user's watched tickers once (401 => signed out, leave empty)
  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setAuthed(true);
        setWatched(new Set<string>((json.items ?? []).map((i: { ticker: string }) => i.ticker)));
      })
      .catch(() => {});
  }, []);

  // Load the user's labels + assignments once (401 => signed out, leave empty)
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
      /* ignore — nothing applied */
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

  // Optimistic watch/unwatch; revert on failure.
  async function toggleWatch(row: ScreenRow) {
    if (watchBusy.has(row.ticker)) return;
    const isWatched = watched.has(row.ticker);
    setWatchBusy((s) => new Set(s).add(row.ticker));
    setWatched((s) => {
      const n = new Set(s);
      if (isWatched) n.delete(row.ticker);
      else n.add(row.ticker);
      return n;
    });
    try {
      if (isWatched) {
        await fetch(`/api/watchlist/${row.ticker}`, { method: "DELETE" });
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: row.ticker,
            companyName: row.companyName,
            sector: row.sector,
          }),
        });
      }
    } catch {
      setWatched((s) => {
        const n = new Set(s);
        if (isWatched) n.add(row.ticker);
        else n.delete(row.ticker);
        return n;
      });
    } finally {
      setWatchBusy((s) => {
        const n = new Set(s);
        n.delete(row.ticker);
        return n;
      });
    }
  }

  // Show the latest completed result (dimmed) while a newer query loads
  const loading = result?.query !== query;
  const data = result?.data ?? null;
  const stats = data?.stats;

  // MOS is applied client-side: recolor rows live as the slider moves,
  // without re-querying. Only rows with a sticker can be "on sale".
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const pricedCount = useMemo(
    () => rows.filter((r) => r.sticker !== null && r.price !== null).length,
    [rows]
  );
  const onSaleCount = useMemo(
    () => rows.filter((r) => priceVerdictAt(r.price, r.sticker, mosFraction) === "mos").length,
    [rows, mosFraction]
  );
  // Client-side filters: "Only on sale" drops anything not green at this MOS;
  // "Watched" narrows to tickers on the user's watchlist.
  const displayRows = useMemo(() => {
    let rs = rows;
    if (onlyOnSale)
      rs = rs.filter((r) => priceVerdictAt(r.price, r.sticker, mosFraction) === "mos");
    if (watchedOnly) rs = rs.filter((r) => watched.has(r.ticker));
    const includes = Object.keys(labelFilter).filter((id) => labelFilter[id] === "include");
    const excludes = Object.keys(labelFilter).filter((id) => labelFilter[id] === "exclude");
    if (includes.length > 0 || excludes.length > 0) {
      rs = rs.filter((r) => {
        const ids = assignments[r.ticker] ?? [];
        if (excludes.some((id) => ids.includes(id))) return false;
        if (includes.length > 0 && !includes.some((id) => ids.includes(id))) return false;
        return true;
      });
    }
    return rs;
  }, [rows, onlyOnSale, mosFraction, watchedOnly, watched, labelFilter, assignments]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Big Five Screener
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every SEC filer, scored against Rule #1&apos;s Big Five — pure SEC-filing math, no
            AI in the loop
          </p>
        </div>

        {/* Stats strip */}
        {stats && stats.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {stats.available.toLocaleString()} companies swept
            </span>
            <span className="text-zinc-400">→</span>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 font-medium text-blue-600 dark:text-blue-400">
              {stats.pass3.toLocaleString()} pass ≥3/5
            </span>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 font-medium text-blue-600 dark:text-blue-400">
              {stats.pass4.toLocaleString()} pass ≥4/5
            </span>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-600 dark:text-emerald-400">
              {stats.pass5.toLocaleString()} perfect 5/5
            </span>
            {stats.latest && (
              <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                data as of{" "}
                {new Date(stats.latest).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        )}

        {/* Natural-language filter */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              parseNl();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder='Describe what you want — e.g. "profitable coffee or pet companies under $10B"'
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={parsing || nlInput.trim() === ""}
              className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parsing ? "Parsing…" : "Filter"}
            </button>
          </form>
          {parseNotice && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{parseNotice}</p>
          )}
          {(tags.length > 0 || keywords.length > 0 || (maxMcap && !mcapIsBand)) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Filtering by:</span>
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  className="group inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
                  title="Remove filter"
                >
                  {displayTag(t)}
                  <span className="text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300">×</span>
                </button>
              ))}
              {keywords.map((k) => (
                <button
                  key={k}
                  onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}
                  className="group inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  title="Remove keyword"
                >
                  “{k}”<span className="text-zinc-400">×</span>
                </button>
              ))}
              {maxMcap && !mcapIsBand && (
                <button
                  onClick={() => setMaxMcap(null)}
                  className="group inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  ≤ {fmtMcap(maxMcap)}<span className="text-zinc-400">×</span>
                </button>
              )}
              <button
                onClick={() => {
                  setTags([]);
                  setKeywords([]);
                  setMaxMcap(null);
                  setParseNotice(null);
                }}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                clear all
              </button>
            </div>
          )}
        </div>

        {/* Relevance-sort fallback notice */}
        {sort === "relevance" && data?.relevanceAvailable === false && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            Relevance ranking needs your investing profile — set your talents, passions and
            spending on the <Link href="/" className="underline">home page</Link> first. Showing
            score order meanwhile.
          </p>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex gap-1">
            {[3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setMinScore(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  minScore === s
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s === 5 ? "5/5 only" : `≥ ${s}/5`}
              </button>
            ))}
          </div>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <option value="">All regions</option>
            <option value="us">🇺🇸 US</option>
            <option value="uk">🇬🇧 UK</option>
            <option value="eu">🇪🇺 Europe</option>
          </select>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <option value="">All sectors</option>
            {(data?.sectors ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="">— includes unclassified —</option>
          </select>
          <select
            value={
              MCAP_BANDS.find((b) => b.min === minMcap && (b.max ?? null) === (maxMcap ?? null))?.key ??
              "any"
            }
            onChange={(e) => {
              const band = MCAP_BANDS.find((b) => b.key === e.target.value) ?? MCAP_BANDS[0];
              setMinMcap(band.min);
              setMaxMcap(band.max);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {MCAP_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          {authed && (
            <button
              onClick={() => setWatchedOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                watchedOnly
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              title="Show only stocks on your watchlist"
            >
              <span className={watchedOnly ? "text-amber-400" : ""}>★</span>
              Watched ({watched.size})
            </button>
          )}
          {stats && (
            <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
              {stats.matching.toLocaleString()} match
            </span>
          )}
        </div>

        {/* Label filter — click a label to show only those, again to hide them */}
        {authed && labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">Labels:</span>
            <span className="hidden text-[11px] text-zinc-300 dark:text-zinc-600 sm:inline">
              click: show-only → exclude (∅) → off
            </span>
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
                      ? "ring-2 ring-current ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
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

        {/* Margin of safety */}
        {stats && stats.total > 0 && (
          <MosControl
            value={mosFraction}
            onChange={setMosFraction}
            onSaleCount={onSaleCount}
            pricedCount={pricedCount}
            onlyOnSale={onlyOnSale}
            onOnlyOnSaleChange={setOnlyOnSale}
          />
        )}

        {/* Results */}
        {loading && !data ? (
          <div className="h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : !stats || stats.total === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              No sweep data yet. Run{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                npm run sweep-big-five
              </code>{" "}
              to scan the market (first run takes a few hours; it&apos;s resumable).
            </p>
          </div>
        ) : (
          <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${loading ? "opacity-60" : ""}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {authed && <th className="w-9 py-3 pl-4 pr-1" aria-label="Watch" />}
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 text-right font-medium">Mkt cap</th>
                    <th className="px-3 py-3 text-right font-medium">Score</th>
                    {BIG_FIVE_COLS.map((c) => (
                      <th key={c.base} className="px-3 py-3 text-right font-medium">
                        <MetricTooltip label={c.label} description="From SEC/ESEF filings; green ≥10%/yr per Rule #1 — a metric only counts toward the score when all three horizons clear 10%.">
                          <TriHorizonHeader label={c.short} />
                        </MetricTooltip>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-medium">
                      <MetricTooltip label="Off 52-week high" description="How far below the 52-week high the stock trades (the pullback), with price vs its 50-day and 200-day averages beneath. Beaten-down quality on sale.">
                        <span>Off high</span>
                      </MetricTooltip>
                    </th>
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    <th className="px-3 py-3 text-right font-medium">Sticker</th>
                    <th className="px-4 py-3 text-right font-medium">MOS %</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={12 + (authed ? 1 : 0)}
                        className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                      >
                        {watchedOnly
                          ? "None of your watched stocks match the current filters."
                          : onlyOnSale
                            ? `Nothing on sale at ${Math.round(mosFraction * 100)}% margin of safety — lower the MOS or turn off “Only on sale”.`
                            : "No stocks match the current filters."}
                      </td>
                    </tr>
                  )}
                  {displayRows.map((r) => {
                    const verdict = priceVerdictAt(r.price, r.sticker, mosFraction);
                    const mos = currentMos(r.price, r.sticker);
                    const priceColor =
                      verdict === "mos"
                        ? RATING_COLORS.good
                        : verdict === "sticker"
                          ? RATING_COLORS.caution
                          : verdict === "above"
                            ? RATING_COLORS.bad
                            : "text-zinc-900 dark:text-zinc-100";
                    return (
                      <tr
                        key={r.ticker}
                        className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                      >
                        {authed && (
                          <td className="py-2.5 pl-4 pr-1 text-center align-top">
                            <button
                              onClick={() => toggleWatch(r)}
                              disabled={watchBusy.has(r.ticker)}
                              title={watched.has(r.ticker) ? "Remove from watchlist" : "Add to watchlist"}
                              aria-label={watched.has(r.ticker) ? "Watching" : "Not watching"}
                              className={`text-lg leading-none transition-colors disabled:opacity-40 ${
                                watched.has(r.ticker)
                                  ? "text-amber-400 hover:text-amber-500"
                                  : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600 dark:hover:text-amber-400"
                              }`}
                            >
                              {watched.has(r.ticker) ? "★" : "☆"}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/stocks/${r.ticker}/valuation`}
                              className="text-sm font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 transition-colors"
                            >
                              {r.ticker}
                              {r.minSpanYears !== null && r.minSpanYears < 10 && (
                                <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                                  ({r.minSpanYears}y)
                                </span>
                              )}
                              {r.currency && r.currency !== "USD" && (
                                <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                                  {r.currency}
                                </span>
                              )}
                            </Link>
                            {r.sector && (
                              <button
                                onClick={() => setSector(r.sector!)}
                                title={`Show only ${r.sector}`}
                                className={`rounded-full px-2 py-px text-[10px] font-medium whitespace-nowrap transition-opacity hover:opacity-70 ${
                                  SECTOR_COLORS[r.sector] ?? SECTOR_FALLBACK
                                }`}
                              >
                                {r.sector}
                              </button>
                            )}
                            {friendlyExchange(r.exchange) && (
                              <span
                                title={`Listed on ${friendlyExchange(r.exchange)}`}
                                className="rounded-full border border-zinc-200 px-2 py-px text-[10px] font-medium whitespace-nowrap text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                              >
                                {friendlyExchange(r.exchange)}
                              </span>
                            )}
                          </div>
                          <Link href={`/stocks/${r.ticker}/valuation`} className="block">
                            <p className="max-w-[260px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {r.oneLiner ?? r.companyName ?? ""}
                            </p>
                            {r.matchedTags.length > 0 && (
                              <p className="mt-0.5 flex max-w-[260px] flex-wrap gap-1">
                                {r.matchedTags.slice(0, 4).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                                  >
                                    {displayTag(t)}
                                  </span>
                                ))}
                              </p>
                            )}
                          </Link>
                          {authed && (
                            <div className="mt-1">
                              <StockLabels
                                ticker={r.ticker}
                                labels={labels}
                                assignedIds={assignments[r.ticker] ?? []}
                                onToggle={(labelId, assign) => toggleLabel(r.ticker, labelId, assign)}
                                onCreateAndAssign={(name) => createAndAssignLabel(r.ticker, name)}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {fmtMcap(r.marketCap)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.score === 5
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {r.score}/5
                          </span>
                        </td>
                        {BIG_FIVE_COLS.map((c) => (
                          <td key={c.base} className="px-3 py-2.5 text-right">
                            <TriHorizonValues
                              y10={r[`${c.base}10y`] as number | null}
                              y5={r[`${c.base}5y`] as number | null}
                              y1={r[`${c.base}1y`] as number | null}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right align-middle">
                          {r.pctFrom52wHigh !== null ? (
                            <>
                              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                                {fmtPct(r.pctFrom52wHigh)}
                              </div>
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
                                50d {fmtPct(r.pctVs50dAvg)} · 200d {fmtPct(r.pctVs200dAvg)}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right text-sm font-semibold ${priceColor}`}>
                          {fmtMoney(r.price, r.sticker !== null ? r.currency : "USD")}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                          {fmtMoney(r.sticker, r.currency)}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm font-medium ${priceColor}`}>
                          {fmtPct(mos)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Score = how many of the Big Five (10-year ROIC average and sales / EPS / equity / FCF
          CAGR) clear 10%/yr. (Ny) marks shorter filing histories; non-USD filers show growth
          rates but no sticker (their EPS can&apos;t be priced against USD quotes). The MOS slider
          sets your buy target: price turns green at or below MOS, amber below sticker, red above.
          Refresh the data with{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">npm run sweep-big-five</code>.
        </p>
      </div>
    </div>
  );
}
