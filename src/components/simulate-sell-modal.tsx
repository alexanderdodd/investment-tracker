"use client";

import { useState } from "react";
import { calculateFee, FEE_MODEL_LABELS, type FeeModel } from "@/lib/sim-fees";
import { EFFECTIVE_RATE } from "@/lib/german-tax";

interface SimulateSellModalProps {
  portfolioId: string;
  feeModel: FeeModel;
  ticker: string;
  companyName: string;
  sharesHeld: number;
  avgCostBasis: number;
  currentPrice: number | null;
  onClose: () => void;
  onDone: () => void;
}

function fmt(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

export function SimulateSellModal({
  portfolioId,
  feeModel,
  ticker,
  companyName,
  sharesHeld,
  avgCostBasis,
  currentPrice,
  onClose,
  onDone,
}: SimulateSellModalProps) {
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const shareCount = parseFloat(shares) || 0;
  // Sell price: user-specified if entered, otherwise the live market price.
  const customPrice = parseFloat(price) > 0 ? parseFloat(price) : null;
  const sellPrice = customPrice ?? currentPrice;
  const validShares = shareCount > 0 && shareCount <= sharesHeld;
  const fees = sellPrice && shareCount > 0 ? calculateFee(feeModel, shareCount, sellPrice) : 0;
  const proceeds = sellPrice && shareCount > 0 ? shareCount * sellPrice - fees : 0;
  // Estimated realized gain (uses average cost; server computes exact FIFO gain).
  const estGain = sellPrice && shareCount > 0 ? proceeds - shareCount * avgCostBasis : 0;
  const estTax = estGain > 0 ? estGain * EFFECTIVE_RATE : 0;

  const executeSell = async () => {
    if (!validShares) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeType: "sell",
          ticker,
          companyName,
          shares: shareCount,
          pricePerShare: customPrice,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const g = data.trade.realizedGain as number;
        setResult({
          success: true,
          message: `Sold ${shareCount} ${ticker} at ${fmt(data.trade.pricePerShare)} for ${fmt(
            data.trade.proceeds
          )}. Realized ${g >= 0 ? "gain" : "loss"}: ${fmt(g)}.`,
        });
      } else {
        setResult({ success: false, message: data.error ?? "Sell failed" });
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Sell — {ticker}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{companyName}</p>

        {result && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              result.success
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
            }`}
          >
            {result.message}
            {result.success && (
              <button
                onClick={() => {
                  onDone();
                  onClose();
                }}
                className="block mt-2 text-xs underline"
              >
                Done
              </button>
            )}
          </div>
        )}

        {!result?.success && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Holding</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {sharesHeld} shares @ {fmt(avgCostBasis)} avg
              </span>
            </div>

            {/* Shares input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Shares to sell</label>
                <button
                  type="button"
                  onClick={() => setShares(String(sharesHeld))}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Sell all
                </button>
              </div>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder={`up to ${sharesHeld}`}
                min="0"
                max={sharesHeld}
                step="1"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {shareCount > sharesHeld && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  You only hold {sharesHeld} shares.
                </p>
              )}
            </div>

            {/* Sell price */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Sell price per share
                </label>
                {currentPrice && (
                  <button
                    type="button"
                    onClick={() => setPrice(String(currentPrice))}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Use market
                  </button>
                )}
              </div>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice ? `market: ${fmt(currentPrice)}` : "enter price"}
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Leave blank to sell at the current market price.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why are you selling?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Proceeds breakdown */}
            {sellPrice && shareCount > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">{shareCount} shares × {fmt(sellPrice)}</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(shareCount * sellPrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Fees ({FEE_MODEL_LABELS[feeModel]?.name ?? feeModel})
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100">−{fmt(fees)}</span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-1 flex justify-between text-sm font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">Net proceeds</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(proceeds)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Est. realized {estGain >= 0 ? "gain" : "loss"}</span>
                  <span className={estGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                    {fmt(estGain)}
                  </span>
                </div>
                {estGain > 0 ? (
                  <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Est. tax @ 26.375% (before allowance)</span>
                    <span>{fmt(estTax)}</span>
                  </div>
                ) : estGain < 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Loss harvested — offsets taxable gains this year.
                  </p>
                ) : null}
                <p className="pt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  Estimate uses average cost; exact gain is computed FIFO on execution.
                </p>
              </div>
            )}

            <button
              onClick={executeSell}
              disabled={submitting || !validShares || !sellPrice}
              className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Executing..." : `Sell ${shareCount > 0 ? shareCount : ""} ${ticker}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
