"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { calculateFee, FEE_MODEL_LABELS, type FeeModel } from "@/lib/sim-fees";

interface Portfolio {
  id: string;
  name: string;
  cashRemaining: number;
  feeModel: string;
}

interface SimulateBuyModalProps {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  onClose: () => void;
}

function fmt(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

// Preselect the portfolio last bought into, so repeat buys skip the dropdown
const PORTFOLIO_STORAGE_KEY = "last-buy-portfolio";

export function SimulateBuyModal({ ticker, companyName, currentPrice, onClose }: SimulateBuyModalProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [buyDate, setBuyDate] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Prefill the price with the live price; the user can override it to record a
  // position they already own, bought earlier at a different price.
  useEffect(() => {
    if (currentPrice != null && !buyDate) setPrice(String(currentPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  // When a past buy date is chosen, look up that day's closing price so the
  // cost basis reflects what you actually paid.
  useEffect(() => {
    if (!buyDate || buyDate === today) return;
    let cancelled = false;
    setPriceLoading(true);
    fetch(`/api/stocks/${ticker}/price?date=${buyDate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.price != null) setPrice(String(Math.round(d.price * 100) / 100));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPriceLoading(false); });
    return () => { cancelled = true; };
  }, [buyDate, ticker, today]);

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => {
        const list: Portfolio[] = data.portfolios ?? [];
        setPortfolios(list);
        if (list.length > 0) {
          const remembered = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
          const match = list.find((p) => p.id === remembered);
          setSelectedPortfolio((match ?? list[0]).id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shareCount = parseFloat(shares) || 0;
  const buyPrice = parseFloat(price) || 0;
  const isCustomPrice = currentPrice != null && buyPrice > 0 && Math.abs(buyPrice - currentPrice) > 1e-6;
  const portfolio = portfolios.find((p) => p.id === selectedPortfolio);
  const feeModel = (portfolio?.feeModel ?? "ibkr_pro") as FeeModel;
  const fees = buyPrice > 0 && shareCount > 0 ? calculateFee(feeModel, shareCount, buyPrice) : 0;
  const totalCost = buyPrice > 0 && shareCount > 0 ? shareCount * buyPrice + fees : 0;
  const canAfford = portfolio ? totalCost <= portfolio.cashRemaining : false;

  const executeTrade = async () => {
    if (!selectedPortfolio || shareCount <= 0 || buyPrice <= 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/portfolios/${selectedPortfolio}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          companyName,
          shares: shareCount,
          pricePerShare: buyPrice,
          executedAt: buyDate ? new Date(`${buyDate}T12:00:00Z`).toISOString() : null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem(PORTFOLIO_STORAGE_KEY, selectedPortfolio);
        setResult({
          success: true,
          message: `Bought ${shareCount} shares of ${ticker} at ${fmt(data.trade.pricePerShare)} (${fmt(data.trade.totalCost)} total). Cash remaining: ${fmt(data.trade.cashRemaining)}`,
        });
      } else {
        setResult({ success: false, message: data.error ?? "Trade failed" });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Simulate Buy — {ticker}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{companyName}</p>

        {/* Success/error result */}
        {result && (
          <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            result.success
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}>
            {result.message}
            {result.success && (
              <button onClick={onClose} className="block mt-2 text-xs underline">Close</button>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        ) : portfolios.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">No portfolios yet.</p>
            <Link href="/portfolios" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Create a portfolio first
            </Link>
          </div>
        ) : !result?.success && (
          <div className="space-y-4">
            {/* Portfolio selector */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Portfolio</label>
              <select
                value={selectedPortfolio}
                onChange={(e) => setSelectedPortfolio(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({fmt(p.cashRemaining)} available)
                  </option>
                ))}
              </select>
            </div>

            {/* Shares input */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Shares</label>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="e.g. 10"
                min="1"
                step="1"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Buy price input (defaults to live price, editable) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Buy price / share
                </label>
                {currentPrice != null && (
                  <button
                    type="button"
                    onClick={() => setPrice(String(currentPrice))}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Use live ({fmt(currentPrice)})
                  </button>
                )}
              </div>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice != null ? String(currentPrice) : "e.g. 150.00"}
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {priceLoading ? (
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Looking up price on {buyDate}…</p>
              ) : isCustomPrice && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Custom price — recording a position bought at a different price than live.
                </p>
              )}
            </div>

            {/* Buy date input (optional; defaults to today) */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Buy date (optional)
              </label>
              <input
                type="date"
                value={buyDate}
                max={today}
                onChange={(e) => setBuyDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {buyDate && buyDate !== today && (
                <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  Backdated buy — price prefilled from that day&apos;s close; benchmarks captured as of then.
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why are you buying this?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Cost breakdown */}
            {buyPrice > 0 && shareCount > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">{shareCount} shares x {fmt(buyPrice)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(shareCount * buyPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Fees ({FEE_MODEL_LABELS[feeModel]?.name ?? feeModel})
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(fees)}</span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-1 flex justify-between text-sm font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">Total Cost</span>
                  <span className={canAfford ? "text-zinc-900 dark:text-zinc-100" : "text-red-600 dark:text-red-400"}>
                    {fmt(totalCost)}
                  </span>
                </div>
                {!canAfford && (
                  <p className="text-xs text-red-500 dark:text-red-400">
                    Insufficient cash (have {fmt(portfolio?.cashRemaining ?? 0)}, need {fmt(totalCost)})
                  </p>
                )}
              </div>
            )}

            <button
              onClick={executeTrade}
              disabled={submitting || shareCount <= 0 || buyPrice <= 0 || !canAfford}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Executing..." : `Buy ${shareCount > 0 ? shareCount : ""} ${ticker}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
