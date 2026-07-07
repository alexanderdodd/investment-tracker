"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StockValuationView } from "./valuation-view";
import { StockOverviewTab } from "./stock-overview-tab";
import { GrowthRatesTab } from "./growth-rates-tab";
import { parseStockValuationInsights, type StockValuationInsights } from "@/lib/stock-valuation-insights";
import { sectorToSlug } from "@/lib/sectors";
import { SimulateBuyModal } from "@/components/simulate-buy-modal";

type Tab = "overview" | "growth" | "valuation";

// Remember the selected tab across stock pages: opening a new stock lands on
// whatever tab was last used. Backed by localStorage via useSyncExternalStore
// so it survives navigation without hydration mismatches.
const TAB_STORAGE_KEY = "stock-page-tab";
const TABS: readonly Tab[] = ["overview", "growth", "valuation"];

function subscribeTab(callback: () => void) {
  window.addEventListener("stock-tab-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("stock-tab-change", callback);
    window.removeEventListener("storage", callback);
  };
}

function getTabSnapshot(): Tab {
  const stored = localStorage.getItem(TAB_STORAGE_KEY);
  return TABS.includes(stored as Tab) ? (stored as Tab) : "overview";
}

function useRememberedTab(): [Tab, (tab: Tab) => void] {
  const tab = useSyncExternalStore(subscribeTab, getTabSnapshot, () => "overview" as Tab);
  const setTab = useCallback((next: Tab) => {
    localStorage.setItem(TAB_STORAGE_KEY, next);
    window.dispatchEvent(new Event("stock-tab-change"));
  }, []);
  return [tab, setTab];
}

function verdictColor(verdict: string) {
  switch (verdict) {
    case "Undervalued": return "border-green-500/40 bg-green-500/15 text-green-500 dark:text-green-400 font-semibold";
    case "Fair Value": return "border-blue-500/40 bg-blue-500/15 text-blue-500 dark:text-blue-400 font-semibold";
    case "Overvalued": return "border-red-500/40 bg-red-500/15 text-red-500 dark:text-red-400 font-semibold";
    default: return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  }
}

export default function StockPage() {
  const params = useParams();
  const ticker = (params.ticker as string).toUpperCase();
  const [tab, setTab] = useRememberedTab();
  const [livePrice, setLivePrice] = useState<{ price: number; previousClose: number | null } | null>(null);
  const [insights, setInsights] = useState<StockValuationInsights | null>(null);
  const [hasValuation, setHasValuation] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [showSimBuy, setShowSimBuy] = useState(false);
  const [classification, setClassification] = useState<{
    sectorName: string;
    industryName: string;
    industrySlug: string;
  } | null>(null);

  // Load live price
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/stocks/${ticker}/price`);
        if (res.ok) {
          const data = await res.json();
          setLivePrice({ price: data.price, previousClose: data.previousClose });
        }
      } catch { /* ignore */ }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [ticker]);

  // Load latest valuation summary (lightweight — just for the header)
  const refreshInsights = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation`);
      if (res.ok) {
        const data = await res.json();
        if (data.valuation?.structuredInsights) {
          setInsights(parseStockValuationInsights(data.valuation.structuredInsights));
          setHasValuation(true);
        }
      }
    } catch { /* ignore */ }
  }, [ticker]);

  useEffect(() => {
    refreshInsights();
  }, [refreshInsights]);

  // Load GICS classification
  useEffect(() => {
    fetch(`/api/stocks/${ticker}/classification`)
      .then((r) => r.json())
      .then((data) => {
        if (data.classification) setClassification(data.classification);
      })
      .catch(() => {});
  }, [ticker]);

  // Load watchlist status
  useEffect(() => {
    fetch(`/api/watchlist/${ticker}`)
      .then((r) => r.json())
      .then((data) => setWatching(data.watching))
      .catch(() => {});
  }, [ticker]);

  async function toggleWatch() {
    setWatchLoading(true);
    try {
      if (watching) {
        await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
        setWatching(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            companyName: insights?.companyName ?? null,
            sector: insights?.sector ?? null,
          }),
        });
        setWatching(true);
      }
    } catch { /* ignore */ }
    setWatchLoading(false);
  }

  const dayChange = livePrice?.previousClose
    ? ((livePrice.price - livePrice.previousClose) / livePrice.previousClose) * 100
    : null;
  const dayUp = (dayChange ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">

        {/* Sticky header */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {insights?.companyName ?? ticker}
            </h1>
            {/* Live price */}
            {livePrice && (
              <span className="inline-flex items-center gap-2 text-sm">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                  ${livePrice.price.toFixed(2)}
                </span>
                {dayChange !== null && (
                  <span className={dayUp ? "text-green-500" : "text-red-500"}>
                    {dayUp ? "+" : ""}{dayChange.toFixed(2)}%
                  </span>
                )}
              </span>
            )}
            {/* Valuation verdict badge (confidence shown in valuation tab only) */}
            {insights && insights.verdict !== "Withheld" && (
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${verdictColor(insights.verdict)}`}>
                {insights.verdict}
              </span>
            )}
            {/* Watch button */}
            <button
              onClick={toggleWatch}
              disabled={watchLoading}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                watching
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                  : "border-zinc-300 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
              }`}
              title={watching ? "Remove from watchlist" : "Add to watchlist"}
            >
              {watching ? "\u2605" : "\u2606"}
              {watching ? "Watching" : "Watch"}
            </button>
            {/* Simulate Buy button */}
            <button
              onClick={() => setShowSimBuy(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 transition-colors"
            >
              Simulate Buy
            </button>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
            {(classification || insights?.sector) && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                <Link href={`/sectors/${sectorToSlug(classification?.sectorName ?? insights?.sector ?? "")}`} className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                  {classification?.sectorName ?? insights?.sector}
                </Link>
                {classification?.industryName && (
                  <>
                    <span>/</span>
                    <Link href={`/industries/${classification.industrySlug}`} className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                      {classification.industryName}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setTab("overview")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "overview"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("growth")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "growth"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Growth
          </button>
          <button
            onClick={() => setTab("valuation")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "valuation"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Valuation Report
            {!hasValuation && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                New
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <StockOverviewTab ticker={ticker} sector={insights?.sector} />
        )}
        {tab === "growth" && <GrowthRatesTab ticker={ticker} />}
        {tab === "valuation" && (
          <StockValuationView ticker={ticker} onReportGenerated={refreshInsights} />
        )}
      </div>

      {/* Simulate Buy Modal */}
      {showSimBuy && (
        <SimulateBuyModal
          ticker={ticker}
          companyName={insights?.companyName ?? ticker}
          currentPrice={livePrice?.price ?? null}
          onClose={() => setShowSimBuy(false)}
        />
      )}
    </div>
  );
}
