"use client";

import { useEffect, useState } from "react";
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

export function SimulateBuyModal({ ticker, companyName, currentPrice, onClose }: SimulateBuyModalProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("");
  const [shares, setShares] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => {
        setPortfolios(data.portfolios ?? []);
        if (data.portfolios?.length > 0) {
          setSelectedPortfolio(data.portfolios[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shareCount = parseFloat(shares) || 0;
  const portfolio = portfolios.find((p) => p.id === selectedPortfolio);
  const feeModel = (portfolio?.feeModel ?? "ibkr_pro") as FeeModel;
  const fees = currentPrice && shareCount > 0 ? calculateFee(feeModel, shareCount, currentPrice) : 0;
  const totalCost = currentPrice && shareCount > 0 ? shareCount * currentPrice + fees : 0;
  const canAfford = portfolio ? totalCost <= portfolio.cashRemaining : false;

  const executeTrade = async () => {
    if (!selectedPortfolio || shareCount <= 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/portfolios/${selectedPortfolio}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, companyName, shares: shareCount, notes: notes || null }),
      });
      const data = await res.json();
      if (res.ok) {
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
            <a href="/portfolios" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Create a portfolio first
            </a>
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
            {currentPrice && shareCount > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">{shareCount} shares x {fmt(currentPrice)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(shareCount * currentPrice)}</span>
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
              disabled={submitting || shareCount <= 0 || !canAfford || !currentPrice}
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
