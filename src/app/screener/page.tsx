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
import { displayTag } from "@/lib/meaning-tags";

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
  sticker: number | null;
  mos: number | null;
  verdict: string | null;
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

const MCAP_OPTIONS = [
  { value: 0, label: "Any size" },
  { value: 3e8, label: "≥ $300M" },
  { value: 1e9, label: "≥ $1B" },
  { value: 1e10, label: "≥ $10B" },
  { value: 1e11, label: "≥ $100B" },
];

const SORT_OPTIONS = [
  { value: "score", label: "Big Five score" },
  { value: "relevance", label: "Relevance (my interests)" },
  { value: "roic", label: "ROIC" },
  { value: "sales", label: "Sales growth" },
  { value: "eps", label: "EPS growth" },
  { value: "discount", label: "Discount to sticker" },
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
  const [minScore, setMinScore] = useState(() =>
    parseInt(searchParams.get("minScore") ?? "4", 10)
  );
  const [sector, setSector] = useState("");
  const [region, setRegion] = useState("");
  const [minMcap, setMinMcap] = useState(1e9);
  const [maxMcap, setMaxMcap] = useState<number | null>(null);
  const [sort, setSort] = useState(searchParams.get("sort") ?? "score");
  const [mosFraction, setMosFraction] = useRememberedMos();
  const [onlyOnSale, setOnlyOnSale] = useRememberedOnlyOnSale();
  // Watchlist: which tickers the signed-in user is watching, plus in-flight
  // toggles so a star can't be double-clicked. `authed` gates the whole
  // watch UI — the screener is usable signed-out (it's public SEC data).
  const [authed, setAuthed] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchBusy, setWatchBusy] = useState<Set<string>>(new Set());
  const [watchedOnly, setWatchedOnly] = useState(false);
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
    return rs;
  }, [rows, onlyOnSale, mosFraction, watchedOnly, watched]);

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
          {(tags.length > 0 || keywords.length > 0 || maxMcap) && (
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
              {maxMcap && (
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
            value={minMcap}
            onChange={(e) => setMinMcap(parseFloat(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {MCAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
              <table className="w-full min-w-[1050px]">
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
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    <th className="px-3 py-3 text-right font-medium">Sticker</th>
                    <th className="px-4 py-3 text-right font-medium">MOS %</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={11 + (authed ? 1 : 0)}
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
                          <Link href={`/stocks/${r.ticker}/valuation`} className="group">
                            <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
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
                            </p>
                            <p className="max-w-[260px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {r.oneLiner ?? `${r.companyName ?? ""}${r.sector ? ` · ${r.sector}` : ""}`}
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
