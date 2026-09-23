"use client";

import { useState } from "react";

interface CashModalProps {
  portfolioId: string;
  portfolioName: string;
  cashRemaining: number;
  onClose: () => void;
  onDone: () => void;
}

type Mode = "add" | "set";

function fmt(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

export function CashModal({ portfolioId, portfolioName, cashRemaining, onClose, onDone }: CashModalProps) {
  const [mode, setMode] = useState<Mode>("add");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raw = amount.trim();
  const value = parseFloat(raw);
  const parsed = raw !== "" && Number.isFinite(value);
  const valid = parsed && (mode === "add" ? value > 0 : value >= 0);
  const newCash = mode === "add" ? cashRemaining + (value || 0) : value;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setAmount(next === "set" ? cashRemaining.toFixed(2) : "");
  };

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "add" ? { addCash: value } : { setCash: value }),
      });
      const data = await res.json();
      if (res.ok) {
        onDone();
        onClose();
      } else {
        setError(data.error ?? "Failed to update cash");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Cash</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          {portfolioName} — {fmt(cashRemaining)} available
        </p>

        <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          <button type="button" onClick={() => switchMode("add")} className={tabClass(mode === "add")}>
            Add cash
          </button>
          <button type="button" onClick={() => switchMode("set")} className={tabClass(mode === "set")}>
            Set exact
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              {mode === "add" ? "Amount to add" : "Cash remaining"}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === "add" ? "e.g. 10000" : "e.g. 93529.30"}
              min="0"
              step={mode === "add" ? "100" : "0.01"}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {mode === "set" && (
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Adjusts contributed capital so cash remaining lands on this figure. Trades are untouched.
              </p>
            )}
          </div>

          {valid && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">New cash available</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(newCash)}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || !valid}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? "Saving..."
              : !valid
                ? mode === "add" ? "Add Cash" : "Set Cash"
                : mode === "add" ? `Add ${fmt(value)}` : `Set to ${fmt(value)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
