"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type SearchResult = {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  source: "local" | "yahoo";
};

const MAX_DROPDOWN_RESULTS = 6;

export function StockSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search — only fire after the user has stopped typing for 200ms.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLoading(false);
      setOpen(false);
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
        setResults(data.results.slice(0, MAX_DROPDOWN_RESULTS));
        setOpen(true);
        setHighlighted(-1);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
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

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      if (highlighted >= 0 && results[highlighted]) {
        router.push(`/stocks/${results[highlighted].ticker}/valuation`);
      } else {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const trimmed = query.trim();

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => trimmed.length > 0 && results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search any stock — e.g. Apple, AAPL, KO"
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
        autoComplete="off"
        spellCheck={false}
      />
      {loading && (
        <span className="absolute right-4 top-3.5 text-xs text-zinc-400 dark:text-zinc-500">
          Searching…
        </span>
      )}

      {open && trimmed.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {results.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              No matches for &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li
                  key={r.ticker}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/50"
                >
                  <Link
                    href={`/stocks/${r.ticker}/valuation`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 transition-colors ${
                      i === highlighted
                        ? "bg-zinc-50 dark:bg-zinc-800/50"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {r.ticker}
                        </p>
                        {r.source === "yahoo" && (
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            Not yet tracked
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {r.companyName}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-blue-500 dark:text-blue-400">
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/search?q=${encodeURIComponent(trimmed)}`}
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-100 px-4 py-2.5 text-center text-xs font-medium text-blue-500 hover:bg-zinc-50 dark:border-zinc-800/50 dark:text-blue-400 dark:hover:bg-zinc-800/50 transition-colors"
          >
            See all results for &ldquo;{trimmed}&rdquo;
          </Link>
        </div>
      )}
    </div>
  );
}
