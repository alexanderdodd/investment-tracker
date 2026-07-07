"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SearchResult = {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  source: "local" | "yahoo";
};

export default function SearchPage() {
  // useSearchParams requires a Suspense boundary in client pages.
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search — only fire after the user has stopped typing for 200ms.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/stocks/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  // If the user types something that looks like a ticker, offer a direct-jump
  // link even when we have no metadata for it (handy for unlisted Yahoo symbols).
  const looksLikeTicker = useMemo(
    () => /^[A-Za-z][A-Za-z0-9.-]{0,5}$/.test(trimmed),
    [trimmed],
  );
  const directTicker = looksLikeTicker ? trimmed.toUpperCase() : null;
  const directInResults =
    directTicker !== null &&
    results.some((r) => r.ticker === directTicker);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Stock Search
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Look up any stock by ticker or company name
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            Home
          </Link>
        </div>

        <div className="relative">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Apple, AAPL, Coca-Cola, KO"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-400 dark:text-zinc-500">
              Searching…
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {!hasQuery && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Start typing to search across {""}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                1,200+
              </span>{" "}
              tracked stocks. Anything else falls back to a Yahoo Finance lookup.
            </p>
          </div>
        )}

        {hasQuery && !loading && results.length === 0 && !error && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No matches for &ldquo;{trimmed}&rdquo;.
            </p>
            {directTicker && (
              <Link
                href={`/stocks/${directTicker}/valuation`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-500/20 dark:text-blue-400 transition-colors"
              >
                Try {directTicker} anyway →
              </Link>
            )}
          </div>
        )}

        {hasQuery && results.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <ul>
              {directTicker && !directInResults && (
                <li className="border-b border-zinc-100 dark:border-zinc-800/50">
                  <Link
                    href={`/stocks/${directTicker}/valuation`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {directTicker}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Open valuation page directly
                      </p>
                    </div>
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      Open →
                    </span>
                  </Link>
                </li>
              )}
              {results.map((r) => (
                <li
                  key={r.ticker}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/50"
                >
                  <Link
                    href={`/stocks/${r.ticker}/valuation`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {r.ticker}
                        </p>
                        {r.source === "yahoo" && (
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            Not yet tracked
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-zinc-600 dark:text-zinc-300">
                        {r.companyName}
                      </p>
                      {(r.sector || r.industry) && (
                        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                          {[r.sector, r.industry].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-blue-500 dark:text-blue-400">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasQuery && results.length > 0 && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Open a stock to view its overview or trigger a valuation report.
          </p>
        )}
      </div>
    </div>
  );
}
