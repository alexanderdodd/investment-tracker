"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type StockValuationInsights,
  parseStockValuationInsights,
} from "@/lib/stock-valuation-insights";

// ---------------------------------------------------------------------------
// Progress types
// ---------------------------------------------------------------------------

interface ProgressStage {
  stage: number;
  totalStages: number;
  label: string;
  description: string;
  status: "pending" | "running" | "complete" | "error";
  percent: number;
}

const INITIAL_STAGES: Omit<ProgressStage, "totalStages">[] = [
  { stage: 1, label: "Extracting Verified Data", description: "Pulling financial data from SEC EDGAR XBRL filings and current market prices — every number has provenance tracking", status: "pending", percent: 0 },
  { stage: 2, label: "Financial Analysis", description: "Computing ratios, detecting cycle state, and normalizing metrics to mid-cycle levels if at peak — all in code, not LLM", status: "pending", percent: 0 },
  { stage: 3, label: "Valuation Engine", description: "Running deterministic DCF, market multiples, reverse DCF, and bull/base/bear scenarios — all computed in code", status: "pending", percent: 0 },
  { stage: 4, label: "Quality Assurance", description: "Validating arithmetic, data completeness, formula consistency, and methodology compliance against the verified fact sheet", status: "pending", percent: 0 },
  { stage: 5, label: "Analyst Narrative", description: "Writing the analyst report — locked to verified data, may explain but cannot introduce new numbers", status: "pending", percent: 0 },
  { stage: 6, label: "Red-Team Review", description: "Challenging the report's conclusions — flagging unsupported claims, missing risks, and aggressive assumptions", status: "pending", percent: 0 },
  { stage: 7, label: "Structuring Results", description: "Assembling dashboard insights from deterministic outputs — not re-extracted from narrative text", status: "pending", percent: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function confidenceColor(confidence: string) {
  switch (confidence) {
    case "High":
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Low":
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

// ---------------------------------------------------------------------------
// Progress UI
// ---------------------------------------------------------------------------

function ProgressPanel({
  stages,
  overallPercent,
  ticker,
}: {
  stages: ProgressStage[];
  overallPercent: number;
  ticker: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Analyzing {ticker}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Running deep valuation analysis across multiple dimensions
        </p>
      </div>

      {/* Overall progress bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Overall progress
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {overallPercent}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          Estimated time: 1-2 minutes total
        </p>
      </div>

      {/* Stage cards */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.stage}
            className={`rounded-xl border px-5 py-4 transition-all duration-300 ${
              stage.status === "running"
                ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30"
                : stage.status === "complete"
                  ? "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {stage.status === "complete" ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : stage.status === "running" ? (
                  <div className="flex h-5 w-5 items-center justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-300 dark:border-zinc-600">
                    <span className="text-[10px] font-medium text-zinc-400">{stage.stage}</span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${
                    stage.status === "running"
                      ? "text-blue-700 dark:text-blue-300"
                      : stage.status === "complete"
                        ? "text-green-700 dark:text-green-400"
                        : "text-zinc-500 dark:text-zinc-400"
                  }`}>
                    {stage.label}
                  </p>
                  {stage.status === "running" && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      In progress
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 text-xs leading-relaxed ${
                  stage.status === "pending"
                    ? "text-zinc-400 dark:text-zinc-500"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}>
                  {stage.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StockValuationView({ ticker }: { ticker: string }) {
  const [insights, setInsights] = useState<StockValuationInsights | null>(null);
  const [researchDoc, setResearchDoc] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stages, setStages] = useState<ProgressStage[]>([]);
  const [overallPercent, setOverallPercent] = useState(0);
  const [showResearch, setShowResearch] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; generatedAt: string; verdict: string | null; confidence: string | null; intrinsicValue: string | number | null; status: string }[]>([]);

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

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation?history=true`);
      const data = await res.json();
      if (data.history) setHistory(data.history);
    } catch {
      // ignore
    }
  }, [ticker]);

  useEffect(() => {
    loadValuation();
    loadHistory();
  }, [loadValuation, loadHistory]);

  const triggerValuation = async () => {
    setGenerating(true);
    setError(null);
    setStages(INITIAL_STAGES.map((s) => ({ ...s, totalStages: 7 })));
    setOverallPercent(0);

    try {
      const res = await fetch(`/api/stocks/${ticker}/valuation?force=true`, { method: "POST" });

      // Check if it's a JSON response (existing valuation)
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.valuation) {
          setInsights(parseStockValuationInsights(data.valuation.structuredInsights));
          setResearchDoc(data.valuation.researchDocument);
          setGeneratedAt(data.valuation.generatedAt);
        }
        setGenerating(false);
        return;
      }

      // SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);

            if (event.type === "progress") {
              setStages((prev) =>
                prev.map((s) => {
                  if (s.stage === event.stage) {
                    return { ...s, status: event.status, percent: event.percent };
                  }
                  if (s.stage < event.stage && s.status !== "complete") {
                    return { ...s, status: "complete" };
                  }
                  return s;
                })
              );
              setOverallPercent(event.percent);
            } else if (event.type === "complete" && event.valuation) {
              setInsights(parseStockValuationInsights(event.valuation.structuredInsights));
              setResearchDoc(event.valuation.researchDocument);
              setGeneratedAt(event.valuation.generatedAt);
              setOverallPercent(100);
            } else if (event.type === "error") {
              setError(event.error || "Generation failed");
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate valuation");
    } finally {
      setGenerating(false);
      loadHistory(); // Refresh history after generation
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

  // Generating — show progress
  if (generating) {
    return <ProgressPanel stages={stages} overallPercent={overallPercent} ticker={ticker} />;
  }

  // No valuation yet — show trigger
  if (!insights && !researchDoc) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{ticker} Valuation</h1>
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-md text-center">
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              No valuation report exists for {ticker} yet.
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              This will run a deep analysis covering business fundamentals, financial health, DCF valuation, peer multiples, and risk scenarios. Takes about 1-2 minutes.
            </p>

            <div className="mt-6 space-y-3">
              {INITIAL_STAGES.map((stage) => (
                <div key={stage.stage} className="flex items-start gap-2 text-left">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {stage.stage}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{stage.label}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{stage.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={triggerValuation}
              className="mt-6 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Generate Valuation Report
            </button>
            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Report exists — show it
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
              {insights.confidence && insights.confidence !== "N/A" && (
                <span className="relative group">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-help ${confidenceColor(insights.confidence)}`}>
                    {insights.confidence} confidence
                    <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                    </svg>
                  </span>
                  {insights.confidenceReason && (
                    <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <span className="mb-1 block font-semibold text-zinc-900 dark:text-zinc-100">Why {insights.confidence.toLowerCase()} confidence?</span>
                      {insights.confidenceReason.split("; ").map((reason, i) => (
                        <span key={i} className="mt-1 block">
                          <span className="text-zinc-400 dark:text-zinc-500 mr-1">-</span>
                          {reason}
                        </span>
                      ))}
                    </span>
                  )}
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
              Report from {new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at {new Date(generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
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
          {/* Valuation */}
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

      {/* Regenerate + History */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={triggerValuation}
            disabled={generating}
            className="text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Regenerate valuation
          </button>
          {history.length > 1 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              {showHistory ? "Hide" : "Show"} history ({history.length})
            </button>
          )}
        </div>

        {showHistory && history.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Valuation History</h3>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {history.map((entry, i) => (
                <button
                  key={entry.id}
                  onClick={async () => {
                    const res = await fetch(`/api/stocks/${ticker}/valuation?id=${entry.id}`);
                    const data = await res.json();
                    if (data.valuation) {
                      setInsights(parseStockValuationInsights(data.valuation.structuredInsights));
                      setResearchDoc(data.valuation.researchDocument);
                      setGeneratedAt(data.valuation.generatedAt);
                    }
                  }}
                  className="flex w-full items-center justify-between px-6 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {entry.verdict && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${verdictColor(String(entry.verdict))}`}>
                        {String(entry.verdict)}
                      </span>
                    )}
                    {entry.confidence && entry.confidence !== "N/A" && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidenceColor(String(entry.confidence))}`}>
                        {String(entry.confidence)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.intrinsicValue && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        FV: ${typeof entry.intrinsicValue === 'number' ? entry.intrinsicValue : entry.intrinsicValue}
                      </span>
                    )}
                    {i === 0 && (
                      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Latest</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
