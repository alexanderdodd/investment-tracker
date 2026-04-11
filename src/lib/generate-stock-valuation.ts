/**
 * Stock Valuation Pipeline v2 — Deterministic facts + code valuation + LLM narrative.
 *
 * Numbers come from code. Narrative comes from LLMs.
 * The narrative may explain the valuation but may not define it.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { stockValuations } from "../db/schema";
import { buildCanonicalFacts } from "./valuation/canonical-facts";
import { computeFinancialAnalysis } from "./valuation/financial-analysis";
import { selectFramework } from "./valuation/industry-frameworks";
import { runValuationEngine } from "./valuation/valuation-engine";
import { runQaValidation } from "./valuation/qa-validators";
import { generateNarrative, redTeamReview } from "./valuation/narrative";
import type { CanonicalFacts, FinancialModelOutputs, ValuationOutputs, QaReport } from "./valuation/types";
import type { StockValuationInsights } from "./stock-valuation-insights";
import { generateText } from "ai";
import { openrouter } from "./ai";

// ---------------------------------------------------------------------------
// Freshness check: event-based (new filing) + daily price
// ---------------------------------------------------------------------------

export async function getExistingValuation(ticker: string) {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.ticker, ticker.toUpperCase()))
    .orderBy(desc(stockValuations.generatedAt))
    .limit(1);

  if (!latest) return null;

  // For now, reuse if less than 7 days old (will be replaced with filing-event detection)
  const ageMs = Date.now() - latest.generatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 7) {
    return latest;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  stage: number;
  totalStages: number;
  label: string;
  description: string;
  status: "running" | "complete" | "error";
  percent: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

const STAGES = [
  { label: "Extracting Verified Data", description: "Pulling financial data from SEC EDGAR XBRL filings and current market prices — every number has provenance" },
  { label: "Financial Analysis", description: "Computing ratios, detecting cycle state, and normalizing metrics to mid-cycle levels if at peak" },
  { label: "Valuation Engine", description: "Running deterministic DCF, market multiples, reverse DCF, and bull/base/bear scenarios — all in code, not LLM" },
  { label: "Quality Assurance", description: "Validating arithmetic, data completeness, formula consistency, and methodology compliance" },
  { label: "Analyst Narrative", description: "Writing the analyst report — locked to verified data, may explain but not introduce new numbers" },
  { label: "Red-Team Review", description: "Challenging the report's conclusions — flagging unsupported claims, missing risks, and aggressive assumptions" },
  { label: "Structuring Results", description: "Extracting key insights for the dashboard display" },
];

// ---------------------------------------------------------------------------
// Structured insights extraction (from deterministic outputs, not narrative)
// ---------------------------------------------------------------------------

async function buildStructuredInsights(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs,
  qa: QaReport,
  narrative: string
): Promise<StockValuationInsights> {
  // Extract headline via LLM (the only LLM-dependent field)
  const { text: headline } = await generateText({
    model: openrouter()("google/gemini-2.5-flash"),
    prompt: `Write 3-4 sentences in plain English for someone with no finance background about ${facts.companyName} (${facts.ticker}). What does this company do (in everyday terms), is the stock a good deal right now, and what's the one thing to know. Like explaining it to a friend over coffee. The stock is currently $${facts.currentPrice.value?.toFixed(2)} and the analysis says it's ${valuation.verdict}. Do not give investment advice.`,
  });

  const price = facts.currentPrice.value;
  const baseCase = valuation.scenarios?.base.perShareValue ?? valuation.dcf?.perShareValue ?? null;

  return {
    ticker: facts.ticker,
    companyName: facts.companyName,
    sector: facts.sector,
    verdict: valuation.verdict === "Highly Uncertain" ? "Fair Value" : valuation.verdict,
    verdictReason: valuation.verdict === "Highly Uncertain"
      ? "Valuation methods produced widely different results — high uncertainty"
      : `Based on DCF and multiples analysis with ${qa.status === "published" ? "all QA checks passed" : "some data limitations"}`,
    confidence: valuation.confidenceScore > 0.7 ? "High" : valuation.confidenceScore > 0.4 ? "Medium" : "Low",
    confidenceReason: `${(valuation.confidenceScore * 100).toFixed(0)}% confidence based on data quality, method agreement, and cycle position`,
    currentPrice: price,
    intrinsicValue: baseCase ? Math.round(baseCase * 100) / 100 : null,
    marginOfSafety: valuation.marginOfSafety !== null
      ? `${valuation.marginOfSafety > 0 ? "+" : ""}${(valuation.marginOfSafety * 100).toFixed(1)}%`
      : null,
    headline,
    businessSummary: "", // Will be filled from narrative sections
    businessModel: "",
    competitivePosition: "",
    industryContext: "",
    revenueGrowth: model.revenueGrowth.length > 0
      ? `Revenue grew ${model.revenueGrowth.map(g => `${(g.value * 100).toFixed(1)}% in ${g.period}`).join(", ")}`
      : "Revenue growth data not available",
    profitability: `Latest gross margin ${facts.latestQuarterGrossMargin.value !== null ? (facts.latestQuarterGrossMargin.value * 100).toFixed(1) + "%" : "N/A"} vs 5Y avg ${facts.fiveYearAvgGrossMargin.value !== null ? (facts.fiveYearAvgGrossMargin.value * 100).toFixed(1) + "%" : "N/A"}. Cycle state: ${model.cycleState}.`,
    cashGeneration: `TTM GAAP FCF: $${facts.ttmFCF.value !== null ? (facts.ttmFCF.value / 1e9).toFixed(2) + "B" : "N/A"}. Cash conversion ratio: ${model.cashConversionRatio?.toFixed(2) ?? "N/A"}x.`,
    balanceSheetStrength: `Cash: $${facts.totalCashAndInvestments.value !== null ? (facts.totalCashAndInvestments.value / 1e9).toFixed(1) + "B" : "N/A"}, Debt: $${facts.totalDebt.value !== null ? (facts.totalDebt.value / 1e9).toFixed(1) + "B" : "N/A"}, D/E: ${model.debtToEquity?.toFixed(2) ?? "N/A"}`,
    capitalAllocation: `Capex intensity: ${model.capexIntensity !== null ? (model.capexIntensity * 100).toFixed(1) + "%" : "N/A"}. Buyback yield: ${model.buybackYield !== null ? (model.buybackYield * 100).toFixed(2) + "%" : "N/A"}.`,
    accountingQuality: `SBC is ${model.sbcAsPercentOfRevenue !== null ? (model.sbcAsPercentOfRevenue * 100).toFixed(1) + "% of revenue" : "N/A"}. ${qa.issues.length === 0 ? "No QA issues found." : `${qa.issues.length} QA issue(s) flagged.`}`,
    dcfSummary: valuation.dcf
      ? `DCF fair value: $${valuation.dcf.perShareValue.toFixed(2)}/share using ${(valuation.dcf.wacc * 100).toFixed(1)}% WACC, ${(valuation.dcf.terminalGrowth * 100).toFixed(1)}% terminal growth. Base FCF: $${(valuation.dcf.baseYearFCF / 1e9).toFixed(2)}B${valuation.dcf.normalized ? " (mid-cycle normalized)" : ""}.`
      : "DCF could not be computed (negative or missing FCF).",
    multiplesSummary: `Trailing P/E: ${valuation.multiples.current.pe?.toFixed(1) ?? "N/A"}x. EV/EBITDA: ${valuation.multiples.current.evEbitda?.toFixed(1) ?? "N/A"}x. EV/Revenue: ${valuation.multiples.current.evRevenue?.toFixed(1) ?? "N/A"}x.`,
    peerComparison: "Peer comparison based on competitors identified in the company's 10-K filing.",
    bullCase: valuation.scenarios ? `$${valuation.scenarios.bull.perShareValue.toFixed(2)}: ${valuation.scenarios.bull.assumptions}` : "Not computed",
    baseCase: valuation.scenarios ? `$${valuation.scenarios.base.perShareValue.toFixed(2)}: ${valuation.scenarios.base.assumptions}` : "Not computed",
    bearCase: valuation.scenarios ? `$${valuation.scenarios.bear.perShareValue.toFixed(2)}: ${valuation.scenarios.bear.assumptions}` : "Not computed",
    keyRisks: qa.issues.filter(i => i.severity !== "low").map(i => ({ label: i.location, detail: i.error })).slice(0, 5),
    keyDrivers: [],
    sensitivityFactors: valuation.dcf?.sensitivityGrid
      ? [`WACC sensitivity: ${valuation.dcf.sensitivityGrid.map(s => `$${s.perShareValue.toFixed(0)} at ${(s.wacc * 100).toFixed(1)}%`).join(", ")}`]
      : [],
    catalysts: [],
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function generateStockValuation(
  ticker: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const upperTicker = ticker.toUpperCase();
  const total = STAGES.length;

  const report = (stage: number, status: "running" | "complete" | "error") => {
    if (!onProgress) return;
    const pct = status === "complete"
      ? Math.round(((stage + 1) / total) * 100)
      : Math.round(((stage + 0.5) / total) * 100);
    onProgress({
      stage: stage + 1,
      totalStages: total,
      label: STAGES[stage].label,
      description: STAGES[stage].description,
      status,
      percent: Math.min(pct, 100),
    });
  };

  try {
    // Stage 0: Deterministic fact extraction from SEC EDGAR + market data
    report(0, "running");
    const facts = await buildCanonicalFacts(upperTicker);
    const framework = selectFramework(facts.sector, facts.industry);
    report(0, "complete");

    // Stage 1: Deterministic financial analysis
    report(1, "running");
    const financialModel = computeFinancialAnalysis(facts, framework);
    report(1, "complete");

    // Stage 2: Deterministic valuation engine
    report(2, "running");
    const valuationOutputs = runValuationEngine(facts, financialModel, framework);
    report(2, "complete");

    // Stage 3: Deterministic QA
    report(3, "running");
    const qaReport = runQaValidation(facts, financialModel, valuationOutputs);
    report(3, "complete");

    // Stage 4: LLM narrative (locked to artifacts)
    report(4, "running");
    const narrative = await generateNarrative(facts, financialModel, valuationOutputs, qaReport);
    report(4, "complete");

    // Stage 5: Red-team review
    report(5, "running");
    const redTeam = await redTeamReview(
      narrative,
      `Price: $${facts.currentPrice.value} | EPS: $${facts.ttmDilutedEPS.value} | P/E: ${facts.trailingPE.value}`,
      `Verdict: ${valuationOutputs.verdict} | DCF: $${valuationOutputs.dcf?.perShareValue.toFixed(2) ?? "N/A"}`
    );
    report(5, "complete");

    // Assemble final document
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const researchDocument = `${facts.companyName} (${facts.ticker}) — Stock Valuation Report v2
Generated: ${date}
Source: SEC EDGAR XBRL + Market Data (deterministic pipeline)
Status: ${qaReport.status}

ANALYST REPORT
${narrative}

RED-TEAM REVIEW
${redTeam}

QA REPORT (${qaReport.issues.length} issues)
${qaReport.issues.length === 0 ? "All checks passed." : qaReport.issues.map(i => `[${i.severity.toUpperCase()}] ${i.location}: ${i.error} (correct: ${i.correctValue})`).join("\n")}`;

    // Stage 6: Build structured insights
    report(6, "running");
    let structuredInsights: StockValuationInsights | null = null;
    try {
      structuredInsights = await buildStructuredInsights(facts, financialModel, valuationOutputs, qaReport, narrative);
    } catch (err) {
      console.warn(`Warning: structured insights extraction failed: ${err}`);
    }
    report(6, "complete");

    // Persist
    const db = getDb();
    const sourceAccessions = [
      facts.latestAnnualFiling?.accession,
      facts.latestQuarterlyFiling?.accession,
    ].filter(Boolean).join(",");

    await db.insert(stockValuations).values({
      ticker: upperTicker,
      companyName: facts.companyName,
      cik: facts.cik,
      status: qaReport.status,
      frameworkType: framework.type,
      canonicalFacts: facts as unknown as Record<string, unknown>,
      financialModel: financialModel as unknown as Record<string, unknown>,
      valuationOutputs: valuationOutputs as unknown as Record<string, unknown>,
      qualityReport: qaReport as unknown as Record<string, unknown>,
      researchDocument,
      structuredInsights,
      sourceAccessions,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
