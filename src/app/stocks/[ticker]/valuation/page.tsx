"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { StockValuationView } from "./valuation-view";
import { StockOverviewTab } from "./stock-overview-tab";
import { parseStockValuationInsights, type StockValuationInsights } from "@/lib/stock-valuation-insights";

type Tab = "overview" | "valuation";

function confidenceColor(confidence: string) {
  switch (confidence) {
    case "High": return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Medium": return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Low": return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
    default: return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  }
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
  const [tab, setTab] = useState<Tab>("overview");
  const [livePrice, setLivePrice] = useState<{ price: number; previousClose: number | null } | null>(null);
  const [insights, setInsights] = useState<StockValuationInsights | null>(null);
  const [hasValuation, setHasValuation] = useState(false);

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
  useEffect(() => {
    async function load() {
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
    }
    load();
  }, [ticker]);

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
            {/* Valuation badge */}
            {insights && insights.verdict !== "Withheld" && (
              <>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${verdictColor(insights.verdict)}`}>
                  {insights.verdict}
                </span>
                {insights.confidence && insights.confidence !== "N/A" && (
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${confidenceColor(insights.confidence)}`}>
                    {insights.confidence} conf.
                  </span>
                )}
              </>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
            {insights?.sector && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{insights.sector}</span>
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
          <StockOverviewTab ticker={ticker} />
        )}
        {tab === "valuation" && (
          <StockValuationView ticker={ticker} />
        )}
      </div>
    </div>
  );
}
