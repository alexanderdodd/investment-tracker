"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FEE_MODEL_LABELS, type FeeModel } from "@/lib/sim-fees";

interface PortfolioSummary {
  id: string;
  name: string;
  description: string | null;
  startingCash: number;
  feeModel: string;
  cashRemaining: number;
  totalInvested: number;
  positionCount: number;
  tradeCount: number;
  createdAt: string;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCash, setNewCash] = useState("");
  const [newFeeModel, setNewFeeModel] = useState<FeeModel>("ibkr_pro");
  const [creating, setCreating] = useState(false);

  const loadPortfolios = useCallback(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => setPortfolios(data.portfolios ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPortfolios(); }, [loadPortfolios]);

  const createPortfolio = async () => {
    const cash = parseFloat(newCash);
    if (!newName.trim() || isNaN(cash) || cash <= 0) return;
    setCreating(true);
    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), startingCash: cash, feeModel: newFeeModel }),
      });
      if (res.ok) {
        setNewName("");
        setNewCash("");
        setShowCreate(false);
        loadPortfolios();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Simulation Portfolios</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Paper-trade stocks and track performance against benchmarks</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            New Portfolio
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create Portfolio</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Portfolio Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Value Picks Q2 2026"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Starting Cash ($)</label>
                <input
                  type="number"
                  value={newCash}
                  onChange={(e) => setNewCash(e.target.value)}
                  placeholder="e.g. 6000, 13000, 100000"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Fee Model</label>
              <div className="flex flex-wrap gap-3">
                {(Object.entries(FEE_MODEL_LABELS) as [FeeModel, { name: string; description: string }][]).map(([key, { name, description }]) => (
                  <button
                    key={key}
                    onClick={() => setNewFeeModel(key)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      newFeeModel === key
                        ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createPortfolio}
                disabled={creating || !newName.trim() || !newCash}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Portfolio"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Portfolio list */}
        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ) : portfolios.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">No portfolios yet. Create one to start paper-trading.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {portfolios.map((p) => (
              <Link
                key={p.id}
                href={`/portfolios/${p.id}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 transition-colors"
              >
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{p.name}</h3>
                {p.description && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{p.description}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-zinc-500 dark:text-zinc-400">Starting Cash</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{formatCurrency(p.startingCash)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 dark:text-zinc-400">Cash Remaining</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{formatCurrency(p.cashRemaining)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 dark:text-zinc-400">Positions</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.positionCount}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 dark:text-zinc-400">Trades</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.tradeCount}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {FEE_MODEL_LABELS[p.feeModel as FeeModel]?.name ?? p.feeModel}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
