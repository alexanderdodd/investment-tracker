"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { StockValuationView } from "./valuation-view";
import { StockOverviewTab } from "./stock-overview-tab";
import { GrowthRatesTab } from "./growth-rates-tab";
import { StickerPriceTab } from "./sticker-price-tab";
import { ManagementTab } from "./management-tab";
import { MoatTab } from "./moat-tab";
import { TimeTravelTab } from "./time-travel-tab";
import { TechnicalTab } from "./technical-tab";
import { parseStockValuationInsights, type StockValuationInsights } from "@/lib/stock-valuation-insights";
import { defaultGrowthRate, computeSticker } from "@/lib/rule-one";
import { sectorToSlug } from "@/lib/sectors";
import { friendlyExchange } from "@/lib/exchanges";
import { formatMoney } from "@/lib/currency";
import { SimulateBuyModal } from "@/components/simulate-buy-modal";
import { StatusPicker, type WatchlistStatus } from "@/components/watchlist-status";
import { StockLabels } from "@/components/stock-labels";
import type { StockLabel } from "@/lib/labels";

type Tab = "overview" | "growth" | "sticker" | "moat" | "timetravel" | "technical" | "management" | "valuation";

// Remember the selected tab across stock pages: opening a new stock lands on
// whatever tab was last used. Backed by localStorage via useSyncExternalStore
// so it survives navigation without hydration mismatches.
const TAB_STORAGE_KEY = "stock-page-tab";
const TABS: readonly Tab[] = ["overview", "growth", "sticker", "moat", "timetravel", "technical", "management", "valuation"];

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

// Header verdict pill, derived from the Sticker Price tab's evaluation (price
// vs. sticker & 50% MOS) so the two never disagree. Mirrors the labels/colours
// used in sticker-price-tab.tsx.
interface StickerVerdict {
  label: string;
  title: string;
  className: string;
}
function stickerVerdictFor(
  price: number | null,
  sticker: number | null,
  mos: number | null
): StickerVerdict | null {
  if (price === null || sticker === null || mos === null) return null;
  if (price <= mos) {
    return {
      label: "On sale",
      title: "On sale — below MOS price",
      className: "border-green-500/40 bg-green-500/15 text-green-500 dark:text-green-400 font-semibold",
    };
  }
  if (price <= sticker) {
    return {
      label: "Below sticker",
      title: "Below sticker, above MOS",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold",
    };
  }
  return {
    label: "Above sticker",
    title: "Above sticker price",
    className: "border-red-500/40 bg-red-500/15 text-red-500 dark:text-red-400 font-semibold",
  };
}

export default function StockPage() {
  const params = useParams();
  const ticker = (params.ticker as string).toUpperCase();
  const [tab, setTab] = useRememberedTab();
  const [livePrice, setLivePrice] = useState<{ price: number; previousClose: number | null } | null>(null);
  const [quoteMeta, setQuoteMeta] = useState<{ exchange: string | null; currency: string | null } | null>(null);
  const [insights, setInsights] = useState<StockValuationInsights | null>(null);
  const [hasValuation, setHasValuation] = useState(false);
  // Verdict pill sourced from the Sticker Price tab's math (default Rule #1
  // growth), so the header agrees with that tab rather than the old report.
  const [stickerVerdict, setStickerVerdict] = useState<StickerVerdict | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchStatus, setWatchStatus] = useState<string>("watching");
  const [watchLoading, setWatchLoading] = useState(false);
  const [showSimBuy, setShowSimBuy] = useState(false);
  // User-defined labels: the full catalogue (for the picker menu) + the ids
  // applied to this ticker. `labelsAuthed` gates the picker to signed-in users.
  const [labels, setLabels] = useState<StockLabel[]>([]);
  const [assignedLabelIds, setAssignedLabelIds] = useState<string[]>([]);
  const [labelsAuthed, setLabelsAuthed] = useState(false);
  const [profile, setProfile] = useState<{
    name: string | null;
    description: string | null;
    website: string | null;
  } | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
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
          setQuoteMeta({ exchange: data.exchange || null, currency: data.currency || null });
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

  // Load sticker-price inputs → derive the header verdict (matches the tab)
  useEffect(() => {
    setStickerVerdict(null);
    fetch(`/api/stocks/${ticker}/sticker-price`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.available) return;
        const g = defaultGrowthRate(d.equityGrowth?.value, d.analystGrowth);
        const calc = computeSticker(d.eps, g, d.historicalHighPe);
        setStickerVerdict(
          stickerVerdictFor(d.currentPrice ?? null, calc?.sticker ?? null, calc?.mos ?? null)
        );
      })
      .catch(() => {});
  }, [ticker]);

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
      .then((data) => {
        setWatching(data.watching);
        if (data.status) setWatchStatus(data.status);
      })
      .catch(() => {});
  }, [ticker]);

  // Load company profile (name + business description from Yahoo)
  useEffect(() => {
    fetch(`/api/stocks/${ticker}/profile`)
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .catch(() => {});
  }, [ticker]);

  // Load the user's labels + this ticker's assignments (401 => signed out)
  useEffect(() => {
    fetch("/api/labels")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        setLabelsAuthed(true);
        setLabels(json.labels ?? []);
        setAssignedLabelIds((json.assignments ?? {})[ticker] ?? []);
      })
      .catch(() => {});
  }, [ticker]);

  // Apply/remove a label on this stock, optimistically. Reverts on failure.
  async function toggleLabel(labelId: string, assign: boolean) {
    setAssignedLabelIds((prev) =>
      assign ? [...new Set([...prev, labelId])] : prev.filter((id) => id !== labelId)
    );
    try {
      const res = await fetch("/api/labels/assign", {
        method: assign ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, labelId }),
      });
      if (!res.ok) throw new Error("assign failed");
    } catch {
      setAssignedLabelIds((prev) =>
        assign ? prev.filter((id) => id !== labelId) : [...new Set([...prev, labelId])]
      );
    }
  }

  // Create a new label and immediately apply it to this stock.
  async function createAndAssignLabel(name: string) {
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { label } = (await res.json()) as { label: StockLabel };
      setLabels((prev) => (prev.some((l) => l.id === label.id) ? prev : [...prev, label]));
      await toggleLabel(label.id, true);
    } catch {
      /* ignore — nothing applied */
    }
  }

  async function toggleWatch() {
    setWatchLoading(true);
    try {
      if (watching) {
        await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
        setWatching(false);
        setWatchStatus("watching");
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

  async function changeWatchStatus(status: WatchlistStatus) {
    const prev = watchStatus;
    setWatchStatus(status);
    const res = await fetch(`/api/watchlist/${ticker}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res?.ok) setWatchStatus(prev);
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
              {insights?.companyName ?? profile?.name ?? ticker}
            </h1>
            {/* Live price */}
            {livePrice && (
              <span className="inline-flex items-center gap-2 text-sm">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {formatMoney(livePrice.price, quoteMeta?.currency)}
                </span>
                {dayChange !== null && (
                  <span className={dayUp ? "text-green-500" : "text-red-500"}>
                    {dayUp ? "+" : ""}{dayChange.toFixed(2)}%
                  </span>
                )}
              </span>
            )}
            {/* Verdict badge — from the Sticker Price evaluation */}
            {stickerVerdict && (
              <span
                title={stickerVerdict.title}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${stickerVerdict.className}`}
              >
                {stickerVerdict.label}
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
              {!watching && "Watch"}
            </button>
            {/* Watchlist triage status */}
            {watching && (
              <StatusPicker value={watchStatus} onChange={changeWatchStatus} />
            )}
            {/* Simulate Buy button */}
            <button
              onClick={() => setShowSimBuy(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 transition-colors"
            >
              Simulate Buy
            </button>
            {/* Impression labels */}
            {labelsAuthed && (
              <StockLabels
                ticker={ticker}
                labels={labels}
                assignedIds={assignedLabelIds}
                onToggle={toggleLabel}
                onCreateAndAssign={createAndAssignLabel}
              />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              {ticker}
              {friendlyExchange(quoteMeta?.exchange) && (
                <span
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  title={`Trades on ${friendlyExchange(quoteMeta?.exchange)}${quoteMeta?.currency ? ` · quoted in ${quoteMeta.currency}` : ""}`}
                >
                  {friendlyExchange(quoteMeta?.exchange)}
                  {quoteMeta?.currency && quoteMeta.currency !== "USD" && (
                    <span className="ml-1 text-zinc-400 dark:text-zinc-500">{quoteMeta.currency}</span>
                  )}
                </span>
              )}
            </p>
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
            <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
              <a
                href={`https://finance.yahoo.com/quote/${ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                Yahoo Finance ↗
              </a>
              <a
                href={`https://www.msn.com/en-us/money/stockdetails?symbol=${ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                MSN Money ↗
              </a>
              {profile?.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                >
                  Website ↗
                </a>
              )}
            </div>
          </div>
          {profile?.description && (
            <div className="mt-3 max-w-3xl">
              <p
                className={`text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 ${
                  descExpanded ? "" : "line-clamp-2"
                }`}
              >
                {profile.description}
              </p>
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-0.5 text-xs text-blue-500 hover:underline dark:text-blue-400"
              >
                {descExpanded ? "Show less" : "Read more"}
              </button>
            </div>
          )}
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
            onClick={() => setTab("sticker")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "sticker"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Sticker Price
          </button>
          <button
            onClick={() => setTab("moat")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "moat"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Moat
          </button>
          <button
            onClick={() => setTab("timetravel")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "timetravel"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Time Travel
          </button>
          <button
            onClick={() => setTab("technical")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "technical"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Technical
          </button>
          <button
            onClick={() => setTab("management")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === "management"
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
          >
            Management
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
        {tab === "sticker" && <StickerPriceTab ticker={ticker} />}
        {tab === "moat" && <MoatTab ticker={ticker} />}
        {tab === "timetravel" && <TimeTravelTab ticker={ticker} />}
        {tab === "technical" && (
          <div className="relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1600px]">
              <TechnicalTab ticker={ticker} currency={quoteMeta?.currency} livePrice={livePrice} />
            </div>
          </div>
        )}
        {tab === "management" && <ManagementTab ticker={ticker} currency={quoteMeta?.currency} />}
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
