"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type StockValuationInsights,
  parseStockValuationInsights,
} from "@/lib/stock-valuation-insights";

function verdictColor(verdict: string) {
  switch (verdict) {
    case "Undervalued":
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Fair Value":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
    case "Overvalued":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
    default:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: { label: string; detail: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.label}: </span>
          {item.detail}
        </li>
      ))}
    </ul>
  );
}

export function StockValuationView({ ticker }: { ticker: string }) {
  const [insights, setInsights] = useState<StockValuationInsights | null>(null);
  const [researchDoc, setResearchDoc] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadValuation = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation`);
      const data = await res.json();
      if (data.valuation) {
        setInsights(parseStockValuationInsights(data.valuation.structuredInsights));
        setResearchDoc(data.valuation.researchDocument);
        setGeneratedAt(data.valuation.generatedAt);
      }
    } catch {
      // No existing valuation
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    loadValuation();
  }, [loadValuation]);

  const triggerValuation = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation`, { method: "POST" });
      const data = await res.json();
      if (data.status === "error") {
        setError(data.error || "Failed to generate valuation");
        return;
      }
      if (data.valuation) {
        setInsights(parseStockValuationInsights(data.valuation.structuredInsights));
        setResearchDoc(data.valuation.researchDocument);
        setGeneratedAt(data.valuation.generatedAt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate valuation");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  // No valuation yet — show trigger
  if (!insights && !researchDoc) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{ticker} Valuation</h1>
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No valuation report exists for {ticker} yet.
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            This will run a deep analysis using the company&apos;s latest filings and market data. It may take 1-2 minutes.
          </p>
          <button
            onClick={triggerValuation}
            disabled={generating}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {generating ? "Generating valuation..." : "Generate Valuation Report"}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {insights?.companyName ?? ticker}
          </h1>
          {insights && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictColor(insights.verdict)}`}>
                {insights.verdict}
              </span>
              {insights.currentPrice && insights.intrinsicValue && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ${insights.currentPrice} vs ${insights.intrinsicValue} fair value
                </span>
              )}
              {insights.marginOfSafety && (
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  ({insights.marginOfSafety})
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
          {insights?.sector && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{insights.sector}</span>
          )}
          {generatedAt && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Report from {new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
      </div>

      {/* Headline */}
      {insights?.headline && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">The headlines</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {insights.headline}
          </p>
        </div>
      )}

      {insights && (
        <>
          {/* Verdict & Valuation */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card title="DCF Valuation">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{insights.dcfSummary}</p>
            </Card>
            <Card title="Market Multiples">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{insights.multiplesSummary}</p>
            </Card>
            <Card title="Peer Comparison">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{insights.peerComparison}</p>
            </Card>
          </div>

          {/* Business */}
          <Card title="Business Overview">
            <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              <p>{insights.businessSummary}</p>
              <p><span className="font-semibold text-zinc-900 dark:text-zinc-100">Business model: </span>{insights.businessModel}</p>
              <p><span className="font-semibold text-zinc-900 dark:text-zinc-100">Competitive position: </span>{insights.competitivePosition}</p>
              <p><span className="font-semibold text-zinc-900 dark:text-zinc-100">Industry: </span>{insights.industryContext}</p>
            </div>
          </Card>

          {/* Financials */}
          <Card title="Financial Health">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { label: "Revenue Growth", value: insights.revenueGrowth },
                { label: "Profitability", value: insights.profitability },
                { label: "Cash Generation", value: insights.cashGeneration },
                { label: "Balance Sheet", value: insights.balanceSheetStrength },
                { label: "Capital Allocation", value: insights.capitalAllocation },
                { label: "Accounting Quality", value: insights.accountingQuality },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
                  <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Scenarios */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border-l-4 border-l-green-500 border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 dark:border-l-green-500">
              <p className="text-xs font-semibold text-green-600 dark:text-green-400">Bull Case</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{insights.bullCase}</p>
            </div>
            <div className="rounded-2xl border-l-4 border-l-zinc-400 border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 dark:border-l-zinc-500">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Base Case</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{insights.baseCase}</p>
            </div>
            <div className="rounded-2xl border-l-4 border-l-red-500 border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900 dark:border-l-red-500">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">Bear Case</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{insights.bearCase}</p>
            </div>
          </div>

          {/* Drivers, Risks, Catalysts */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card title="Key Drivers">
              <BulletList items={insights.keyDrivers} />
            </Card>
            <Card title="Key Risks">
              <BulletList items={insights.keyRisks} />
            </Card>
            <Card title="Upcoming Catalysts">
              <BulletList items={insights.catalysts} />
            </Card>
          </div>

          {/* Sensitivity */}
          <Card title="Sensitivity Factors">
            <ul className="space-y-1">
              {insights.sensitivityFactors.map((factor, i) => (
                <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mr-1.5 text-zinc-400">•</span>{factor}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Research document toggle */}
      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={() => setShowResearch((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4"
        >
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Full Research Document
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {showResearch ? "Hide" : "Show"}
          </span>
        </button>
        {showResearch && researchDoc && (
          <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div className="whitespace-pre-line text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {researchDoc}
            </div>
          </div>
        )}
      </div>

      {/* Regenerate button */}
      <div className="text-center">
        <button
          onClick={triggerValuation}
          disabled={generating}
          className="text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          {generating ? "Regenerating..." : "Regenerate valuation"}
        </button>
      </div>
    </div>
  );
}
