"use client";

import { useState } from "react";

interface AddCashModalProps {
  portfolioId: string;
  portfolioName: string;
  cashRemaining: number;
  onClose: () => void;
  onDone: () => void;
}

function fmt(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

export function AddCashModal({ portfolioId, portfolioName, cashRemaining, onClose, onDone }: AddCashModalProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseFloat(amount) || 0;
  const valid = value > 0;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addCash: value }),
      });
      const data = await res.json();
      if (res.ok) {
        onDone();
        onClose();
      } else {
        setError(data.error ?? "Failed to add cash");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Add Cash</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          {portfolioName} — {fmt(cashRemaining)} available
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Amount to add</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10000"
              min="0"
              step="100"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {valid && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">New cash available</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(cashRemaining + value)}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || !valid}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Adding..." : valid ? `Add ${fmt(value)}` : "Add Cash"}
          </button>
        </div>
      </div>
    </div>
  );
}
