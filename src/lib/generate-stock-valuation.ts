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
import { buildFormulaTraces } from "./valuation/formula-traces";
import { buildSurfaceAllowlist } from "./valuation/surface-allowlist";
import { scanReportSurface } from "./valuation/surface-scanner";
import { getPeerRegistry, computeRelativeValuation, buildPeerRegistry, computeRelativeValuationFromDynamic } from "./valuation/peer-registry";
import { computeSelfHistoryValuation } from "./valuation/self-history-valuation";
import { synthesizeFairValue, evaluateValueGate } from "./valuation/fair-value-synthesis";
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

function buildFallbackSensitivityFactors(facts: CanonicalFacts, model: FinancialModelOutputs): string[] {
  const factors: string[] = [];

  if (facts.trailingPE.value !== null) {
    factors.push(`Earnings multiple: a 5x change in P/E moves the stock by ~$${((facts.ttmDilutedEPS.value ?? 0) * 5).toFixed(0)} per share`);
  }
  if (model.cashConversionRatio !== null) {
    factors.push(`Cash conversion: the ability to turn reported earnings into actual cash flow is a key swing factor (current ratio: ${model.cashConversionRatio.toFixed(1)}x)`);
  }
  if (model.debtToEquity !== null && model.debtToEquity > 0.5) {
    factors.push(`Leverage: with D/E of ${model.debtToEquity.toFixed(2)}, interest rate changes materially affect financing costs and equity value`);
  }
  if (model.cycleState === "peak" || model.cycleState === "above_mid") {
    factors.push(`Cycle position: current margins are well above historical averages — reversion to mid-cycle would significantly reduce earnings`);
  }

  // Always include at least one generic factor
  if (factors.length === 0) {
    factors.push("Revenue growth trajectory is the primary driver of valuation");
    factors.push("Operating margin expansion or compression has an outsized impact on intrinsic value");
    factors.push("Competitive dynamics and market share trends could shift the earnings outlook materially");
  }

  return factors;
}

function buildDeterministicRisks(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs
): { label: string; detail: string }[] {
  const risks: { label: string; detail: string; severity: number }[] = [];

  // Cycle risks
  if (model.cycleState === "peak" || model.cycleState === "above_mid") {
    const latestGM = facts.latestQuarterGrossMargin.value;
    const avgGM = facts.fiveYearAvgGrossMargin.value;
    const ratio = latestGM && avgGM && avgGM > 0 ? latestGM / avgGM : null;
    risks.push({
      label: "Peak Cycle Risk",
      detail: `Operating at cyclical peak with current gross margin ${latestGM ? (latestGM * 100).toFixed(1) + "%" : "N/A"}${ratio ? ` (${ratio.toFixed(1)}x the 5Y average of ${avgGM ? (avgGM * 100).toFixed(1) + "%" : "N/A"})` : ""}. Historical precedent shows these margins are not sustainable through the full cycle.`,
      severity: 1,
    });
  }

  // Margin reversion
  const latestOM = facts.latestQuarterOperatingMargin.value;
  const avgOM = facts.fiveYearAvgOperatingMargin.value;
  if (latestOM && avgOM && avgOM > 0 && latestOM / avgOM > 1.5) {
    risks.push({
      label: "Margin Reversion Risk",
      detail: `Current operating margin of ${(latestOM * 100).toFixed(1)}% is ${(latestOM / avgOM).toFixed(1)}x the 5Y average of ${(avgOM * 100).toFixed(1)}%. Mean reversion to historical levels would reduce earnings by approximately ${((1 - avgOM / latestOM) * 100).toFixed(0)}%.`,
      severity: 2,
    });
  }

  // Valuation uncertainty
  if (valuation.confidenceScore < 0.5) {
    risks.push({
      label: "High Valuation Uncertainty",
      detail: `Valuation confidence is ${(valuation.confidenceScore * 100).toFixed(0)}%. Multiple valuation methods produce divergent estimates, making the fair value midpoint unreliable as a precise target.`,
      severity: 3,
    });
  }

  // Capital intensity
  if (model.capexIntensity !== null && model.capexIntensity > 0.25) {
    risks.push({
      label: "Capital Intensity",
      detail: `Capex intensity of ${(model.capexIntensity * 100).toFixed(1)}% of revenue requires continuous heavy investment to maintain competitiveness. This constrains free cash flow and increases operating leverage during downturns.`,
      severity: 4,
    });
  }

  // Cyclical industry
  if (facts.sector.toLowerCase().includes("semiconductor") || facts.industry.toLowerCase().includes("semiconductor")) {
    risks.push({
      label: "Semiconductor Cyclicality",
      detail: "The memory semiconductor industry is characterized by extreme supply-demand cycles driven by capacity investment, inventory fluctuations, and technology transitions. Revenue and margins can swing dramatically between cycle peaks and troughs.",
      severity: 5,
    });
  }

  // Leverage risk
  if (model.debtToEquity !== null && model.debtToEquity > 0.5) {
    risks.push({
      label: "Leverage Exposure",
      detail: `Debt-to-equity ratio of ${model.debtToEquity.toFixed(2)} amplifies both upside and downside through cycles. In a downturn, debt servicing constrains flexibility.`,
      severity: 6,
    });
  }

  // Revenue volatility (from annual history)
  if (facts.annualHistory.length >= 3) {
    const revenues = facts.annualHistory.map(h => h.revenue).filter((r): r is number => r !== null);
    if (revenues.length >= 3) {
      const maxRev = Math.max(...revenues);
      const minRev = Math.min(...revenues);
      const volatility = maxRev > 0 ? (maxRev - minRev) / maxRev : 0;
      if (volatility > 0.3) {
        risks.push({
          label: "Revenue Volatility",
          detail: `Revenue has ranged from $${(minRev / 1e9).toFixed(1)}B to $${(maxRev / 1e9).toFixed(1)}B over the past ${revenues.length} years, a ${(volatility * 100).toFixed(0)}% swing. This level of variability makes earnings forecasting difficult.`,
          severity: 5,
        });
      }
    }
  }

  // Industry cyclicality (broader than just semiconductors)
  const sectorLower = (facts.sector + " " + facts.industry).toLowerCase();
  if (sectorLower.includes("insurance") || sectorLower.includes("casualty")) {
    risks.push({
      label: "Insurance Cycle Risk",
      detail: "The insurance industry is inherently cyclical, driven by catastrophe losses, pricing cycles, and investment returns. Underwriting results can swing dramatically between hard and soft market conditions.",
      severity: 5,
    });
  } else if (sectorLower.includes("bank") || sectorLower.includes("financial")) {
    risks.push({
      label: "Financial Sector Risk",
      detail: "Financial institutions face credit cycle risk, interest rate sensitivity, and regulatory changes that can materially impact earnings and book value.",
      severity: 5,
    });
  } else if (sectorLower.includes("oil") || sectorLower.includes("gas") || sectorLower.includes("petroleum")) {
    risks.push({
      label: "Commodity Price Risk",
      detail: "Profitability is heavily dependent on commodity prices which are volatile and influenced by global supply/demand dynamics, geopolitics, and energy transition trends.",
      severity: 5,
    });
  }

  // Unknown cycle state
  if (model.cycleState === "unknown" && facts.annualHistory.length >= 3) {
    risks.push({
      label: "Uncertain Cycle Position",
      detail: "The system could not determine the current cycle position with confidence. This increases the uncertainty of margin and earnings forecasts used in the valuation.",
      severity: 4,
    });
  }

  // Valuation method limitations
  const methodCount = [valuation.dcf, valuation.reverseDcf, valuation.scenarios].filter(Boolean).length;
  if (methodCount <= 1) {
    risks.push({
      label: "Limited Valuation Methods",
      detail: `Only ${methodCount} valuation method(s) could be applied. With fewer independent estimates, the fair value range has less cross-validation and may be less reliable.`,
      severity: 4,
    });
  }

  // Ensure at least 2 risks for any company
  if (risks.length < 2) {
    if (!risks.some(r => r.label.includes("Market"))) {
      risks.push({
        label: "Market & Macro Risk",
        detail: "Broad market conditions, interest rate changes, and macroeconomic shifts can impact the stock price independent of company-specific fundamentals.",
        severity: 7,
      });
    }
    if (risks.length < 2) {
      risks.push({
        label: "Model Estimation Risk",
        detail: "All valuation models rely on assumptions about future growth, margins, and discount rates. Actual outcomes may differ materially from estimates, particularly over longer time horizons.",
        severity: 8,
      });
    }
  }

  // Sort by severity, cap at 7
  risks.sort((a, b) => a.severity - b.severity);
  return risks.slice(0, 7).map(r => ({ label: r.label, detail: r.detail }));
}

async function buildStructuredInsights(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs,
  qa: QaReport,
  narrative: string
): Promise<StockValuationInsights> {
  // Extract headline + business fields via LLM
  const { text: qualitativeJson } = await generateText({
    model: openrouter()("google/gemini-2.5-flash"),
    prompt: `Extract qualitative summaries from this analyst report for ${facts.companyName} (${facts.ticker}). The stock is $${facts.currentPrice.value?.toFixed(2)} and the analysis verdict is ${valuation.verdict}.

ANALYST REPORT:
${narrative}

Return JSON only:
{
  "headline": "<3-4 sentences in plain English for someone with no finance background. What does this company do, is the stock a good deal, what's the one thing to know. Like explaining to a friend over coffee.>",
  "businessSummary": "<2-3 sentences summarizing what the company does>",
  "businessModel": "<1-2 sentences on how they make money>",
  "competitivePosition": "<1-2 sentences on moats/advantages>",
  "industryContext": "<1-2 sentences on industry dynamics>",
  "keyDrivers": [{"label": "<2-4 words>", "detail": "<1 sentence>"}],
  "catalysts": [{"label": "<2-4 words>", "detail": "<1 sentence about upcoming event>"}]
}
Do not give investment advice. Return ONLY valid JSON.`,
  });

  let qualitative: Record<string, unknown> = {};
  try {
    let cleaned = qualitativeJson.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) qualitative = JSON.parse(match[0]);
  } catch { /* use defaults */ }

  const headline = (qualitative.headline as string) ?? "";
  const businessSummary = (qualitative.businessSummary as string) ?? "";
  const businessModel = (qualitative.businessModel as string) ?? "";
  const competitivePosition = (qualitative.competitivePosition as string) ?? "";
  const industryContext = (qualitative.industryContext as string) ?? "";
  const keyDrivers = (qualitative.keyDrivers as { label: string; detail: string }[]) ?? [];
  const catalysts = (qualitative.catalysts as { label: string; detail: string }[]) ?? [];

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
    businessSummary,
    businessModel,
    competitivePosition,
    industryContext,
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
    keyRisks: buildDeterministicRisks(facts, model, valuation),
    keyDrivers,
    sensitivityFactors: valuation.dcf?.sensitivityGrid
      ? [`WACC sensitivity: ${valuation.dcf.sensitivityGrid.map(s => `$${s.perShareValue.toFixed(0)} at ${(s.wacc * 100).toFixed(1)}%`).join(", ")}`]
      : buildFallbackSensitivityFactors(facts, model),
    catalysts,
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

    // Stage 2b: Dynamic peer registry + relative valuation
    const dynamicPeerRegistry = await buildPeerRegistry(upperTicker, facts.sic, facts.marketCap.value ?? 0, facts.sector);
    console.log(`  Peers: ${dynamicPeerRegistry.peers.length} discovered (${dynamicPeerRegistry.source}), ${dynamicPeerRegistry.quality.usablePeerCount} usable, confidence ${(dynamicPeerRegistry.quality.overallConfidence * 100).toFixed(0)}%`);

    const subjectFactsForRelative = {
      enterpriseValue: facts.enterpriseValue.value ?? 0,
      ttmRevenue: facts.ttmRevenue.value ?? 0,
      ttmOperatingIncome: facts.ttmOperatingIncome.value ?? 0,
      ttmDA: facts.ttmDA.value ?? 0,
      totalEquity: facts.totalEquity.value ?? 0,
      sharesOutstanding: facts.sharesOutstanding.value ?? 1,
      totalDebt: facts.totalDebt.value ?? 0,
      totalCashAndInvestments: facts.totalCashAndInvestments.value ?? 0,
      priceToBook: facts.priceToBook.value,
    };
    const relativeValuation = computeRelativeValuationFromDynamic(dynamicPeerRegistry, subjectFactsForRelative);
    const selfHistoryResult = computeSelfHistoryValuation(facts, financialModel, valuationOutputs.multiples);

    // Compute cycle margin ratio for confidence model
    const latestGM = facts.latestQuarterGrossMargin.value ?? 0;
    const avgGM = facts.fiveYearAvgGrossMargin.value ?? 1;
    const cycleMarginRatio = avgGM > 0 ? latestGM / avgGM : 1;

    const fairValueSynthesis = synthesizeFairValue({
      dcf: valuationOutputs.dcf,
      reverseDcf: valuationOutputs.reverseDcf,
      relativeValuation,
      selfHistory: selfHistoryResult,
      currentPrice: facts.currentPrice.value ?? 0,
      cycleMarginRatio,
      historyDepth: facts.annualHistory.length,
    });
    const valueGate = evaluateValueGate(fairValueSynthesis);

    console.log(`  Fair value: $${fairValueSynthesis.range.low.toFixed(2)} / $${fairValueSynthesis.range.mid.toFixed(2)} / $${fairValueSynthesis.range.high.toFixed(2)} | Label: ${fairValueSynthesis.label} | Confidence: ${(fairValueSynthesis.valuationConfidence * 100).toFixed(0)}% | Value gate: ${valueGate.status}`);

    // Stage 3: Deterministic QA — two-stage publish gate
    report(3, "running");
    const qaReport = runQaValidation(facts, financialModel, valuationOutputs);
    const gate = qaReport.gateDecision;

    // Build formula traces and surface allowlist (vNext requirements)
    const formulaTraces = buildFormulaTraces(facts, financialModel);

    // Collect all failed rule IDs for suppression
    const failedRuleIds = [
      ...gate.factsGateFailures.map(f => f.split(":")[0].trim()),
      ...gate.valuationGateFailures.map(f => f.split(":")[0].trim()),
      ...qaReport.issues.filter(i => i.severity === "high").map(i => i.location),
    ];
    const { allowlist: surfaceAllowlist, suppressionAudit } = buildSurfaceAllowlist(gate, failedRuleIds, formulaTraces);

    report(3, "complete");

    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    let narrative = "";
    let redTeam = "";
    let structuredInsights: StockValuationInsights | null = null;

    if (gate.status === "WITHHOLD_ALL") {
      // Gate 1 failed — diagnostic only, no narrative
      report(4, "running");
      narrative = `VALUATION WITHHELD — DIAGNOSTIC ONLY\n\nThe facts gate blocked publication due to ${gate.factsGateFailures.length} critical failure(s):\n${gate.factsGateFailures.map(f => `- ${f}`).join("\n")}\n\nNo valuation, fair value, target price, or investment conclusion is provided.`;
      report(4, "complete");
      report(5, "running");
      redTeam = "Skipped — facts gate did not pass.";
      report(5, "complete");
    } else if (valueGate.valuePublishable) {
      // Value gate passes — publish facts + fair value assessment
      // Pass fair value context to the LLM so it can explain the assessment
      report(4, "running");
      narrative = await generateNarrative(facts, financialModel, valuationOutputs, qaReport, undefined, suppressionAudit.suppressedFields, fairValueSynthesis);
      report(4, "complete");
      report(5, "running");
      redTeam = await redTeamReview(
        narrative,
        `Price: $${facts.currentPrice.value} | EPS: $${facts.ttmDilutedEPS.value} | P/E: ${facts.trailingPE.value}`,
        `Value gate: ${valueGate.status} | Label: ${fairValueSynthesis.label} | Confidence: ${fairValueSynthesis.confidenceRating} (${(fairValueSynthesis.valuationConfidence * 100).toFixed(0)}%)`
      );
      report(5, "complete");
    } else if (!gate.valuationPublishable) {
      // Both old gate and value gate say withhold — facts only
      // Pass suppressed fields so the LLM never sees denied data
      report(4, "running");
      narrative = await generateNarrative(facts, financialModel, valuationOutputs, qaReport, undefined, suppressionAudit.suppressedFields);
      report(4, "complete");
      report(5, "running");
      redTeam = await redTeamReview(
        narrative,
        `Price: $${facts.currentPrice.value} | EPS: $${facts.ttmDilutedEPS.value} | P/E: ${facts.trailingPE.value}`,
        `Gate: ${gate.status} | Valuation withheld due to: ${gate.valuationGateFailures.join("; ")}`
      );
      report(5, "complete");
    } else {
      // Both gates passed — full report
      report(4, "running");
      narrative = await generateNarrative(facts, financialModel, valuationOutputs, qaReport);
      report(4, "complete");
      report(5, "running");
      redTeam = await redTeamReview(
        narrative,
        `Price: $${facts.currentPrice.value} | EPS: $${facts.ttmDilutedEPS.value} | P/E: ${facts.trailingPE.value}`,
        `Verdict: ${valuationOutputs.verdict} | DCF: $${valuationOutputs.dcf?.perShareValue.toFixed(2) ?? "N/A"}`
      );
      report(5, "complete");
    }

    // NARR-CLEAN-001: Check for withheld-language contamination when value is published
    if (valueGate.valuePublishable) {
      const withheldPhrases = [
        "fair value cannot be reliably determined",
        "fair value assessment cannot be",
        "no fair value provided",
        "valuation withheld",
        "valuation status: withheld",
        "cannot be determined at this time",
        "cannot be reliably determined",
        "a traditional fair value assessment cannot",
      ];
      const narrativeLower = narrative.toLowerCase();
      const contamination = withheldPhrases.filter(p => narrativeLower.includes(p.toLowerCase()));
      if (contamination.length > 0) {
        console.warn(`NARR-CLEAN-001: Withheld-language contamination in published-value report: ${contamination.join("; ")}`);
      }
    }

    // Run surface scanner on narrative (TRACE-003 / SURFACE-005 / SURFACE-006)
    const surfaceScan = scanReportSurface(narrative, facts, financialModel, formulaTraces, surfaceAllowlist, valuationOutputs, suppressionAudit, valueGate.valuePublishable ? fairValueSynthesis : undefined);
    if (surfaceScan.unmatchedClaims.length > 0) {
      console.warn(`Surface scan: ${surfaceScan.unmatchedClaims.length} unmatched numeric claims in narrative`);
      for (const c of surfaceScan.unmatchedClaims) {
        console.warn(`  L${c.lineNumber}: ${c.raw} (${c.unit}) — "${c.context.substring(0, 80)}"`);
      }
    }
    if (surfaceScan.periodLabelViolations.length > 0) {
      console.warn(`Surface scan: ${surfaceScan.periodLabelViolations.length} period-label violations`);
      for (const v of surfaceScan.periodLabelViolations) {
        console.warn(`  L${v.claim.lineNumber}: ${v.message}`);
        console.warn(`    Claim: ${v.claim.raw} in: "${v.claim.context.substring(0, 120)}"`);
      }
    }
    if (surfaceScan.suppressionViolations.length > 0) {
      console.warn(`SURFACE-007: ${surfaceScan.suppressionViolations.length} suppression violations — denied fields leaked into narrative`);
      for (const v of surfaceScan.suppressionViolations) {
        console.warn(`  ${v.field}: ${v.value} — "${v.claim.context.substring(0, 80)}"`);
      }
    }

    // Gate status label uses the effective status (value gate may upgrade)
    const gateStatusLabel = gate.status === "WITHHOLD_ALL"
      ? "WITHHOLD_ALL — diagnostic only"
      : valueGate.valuePublishable
        ? "FACTS_PLUS_VALUE — fair value published"
        : "FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD";

    // Build valuation section
    let valuationSection = "";
    if (valueGate.valuePublishable) {
      valuationSection = `\nFAIR VALUE ASSESSMENT
Label: ${fairValueSynthesis.label}
Fair Value Range: $${fairValueSynthesis.range.low.toFixed(2)} — $${fairValueSynthesis.range.mid.toFixed(2)} — $${fairValueSynthesis.range.high.toFixed(2)}
Current Price: $${fairValueSynthesis.currentPrice.toFixed(2)} (${fairValueSynthesis.priceVsMid > 0 ? "+" : ""}${(fairValueSynthesis.priceVsMid * 100).toFixed(1)}% vs mid)
Confidence: ${fairValueSynthesis.confidenceRating} (${(fairValueSynthesis.valuationConfidence * 100).toFixed(0)}%)
${fairValueSynthesis.confidenceReasons.map(r => `- ${r}`).join("\n")}
`;
    } else if (gate.status !== "WITHHOLD_ALL") {
      valuationSection = `\nVALUATION STATUS: WITHHELD
Reason: ${valueGate.withholdReasons.join("; ") || gate.valuationGateFailures.join("; ")}
No fair value, target price, margin of safety, or investment conclusion is provided.
`;
    }

    // Assemble final document
    const researchDocument = `${facts.companyName} (${facts.ticker}) — Stock Valuation Report v2
Generated: ${date}
Source: SEC EDGAR XBRL + Market Data (deterministic pipeline)
Publish Gate: ${gateStatusLabel}
${valuationSection}
ANALYST REPORT
${narrative}

RED-TEAM REVIEW
${redTeam}

QA REPORT (${qaReport.issues.length} issues, gate: ${gate.status})
${qaReport.issues.length === 0 ? "All fact checks passed." : qaReport.issues.map(i => `[${i.severity.toUpperCase()}] ${i.location}: ${i.error} (correct: ${i.correctValue})`).join("\n")}
${gate.valuationGateFailures.length > 0 ? `\nValuation gate failures:\n${gate.valuationGateFailures.map(f => `- ${f}`).join("\n")}` : ""}`;

    // RENDER-001: Report-gate consistency assertion
    if (valueGate.valuePublishable) {
      const renderChecks = [
        { label: "FAIR VALUE ASSESSMENT header", test: researchDocument.includes("FAIR VALUE ASSESSMENT") },
        { label: "Fair value range", test: /Fair Value Range:.*\$[\d.]+/.test(researchDocument) },
        { label: "Valuation label", test: /Label:\s*(CHEAP|FAIR|EXPENSIVE|DEEP_CHEAP|DEEP_EXPENSIVE)/.test(researchDocument) },
        { label: "Confidence rating", test: /Confidence:\s*(HIGH|MEDIUM|LOW)/.test(researchDocument) },
        { label: "Confidence reason", test: researchDocument.includes("- ") && /extreme cycle|range is wide|disagree|history/.test(researchDocument) },
      ];
      const failures = renderChecks.filter(c => !c.test);
      if (failures.length > 0) {
        console.error(`RENDER-001 FAIL: Value gate says PUBLISH but report is missing: ${failures.map(f => f.label).join(", ")}`);
      }
    }

    // Stage 6: Build structured insights
    report(6, "running");
    try {
      structuredInsights = await buildStructuredInsights(facts, financialModel, valuationOutputs, qaReport, narrative);

      // Enforce leak prevention based on effective gate status
      // The new value gate may allow publication even when old gate withholds valuation
      const effectiveValuePublishable = valueGate.valuePublishable;

      if (!effectiveValuePublishable && structuredInsights) {
        // Value gate blocks — strip all valuation fields
        structuredInsights.intrinsicValue = null;
        structuredInsights.marginOfSafety = null;
        structuredInsights.verdict = "Withheld";
        structuredInsights.verdictReason = valueGate.withholdReasons.join("; ") || gate.valuationGateFailures.join("; ");
        structuredInsights.confidence = "N/A";
        structuredInsights.confidenceReason = "Valuation withheld — insufficient valid methods";
        structuredInsights.dcfSummary = "DCF valuation withheld — prerequisites not met.";
        structuredInsights.bullCase = "Withheld";
        structuredInsights.baseCase = "Withheld";
        structuredInsights.bearCase = "Withheld";
      } else if (effectiveValuePublishable && structuredInsights) {
        // Value gate allows — inject fair value synthesis data
        // Map new labels to existing type system
        const verdictMap: Record<string, "Undervalued" | "Fair Value" | "Overvalued"> = {
          "CHEAP": "Undervalued", "DEEP_CHEAP": "Undervalued",
          "FAIR": "Fair Value",
          "EXPENSIVE": "Overvalued", "DEEP_EXPENSIVE": "Overvalued",
        };
        const confMap: Record<string, "High" | "Medium" | "Low"> = {
          "HIGH": "High", "MEDIUM": "Medium", "LOW": "Low",
        };
        structuredInsights.verdict = verdictMap[fairValueSynthesis.label] ?? "Fair Value";
        structuredInsights.verdictReason = fairValueSynthesis.valuationReasons.join("; ");
        structuredInsights.confidence = confMap[fairValueSynthesis.confidenceRating] ?? "Low";
        structuredInsights.confidenceReason = fairValueSynthesis.confidenceReasons.join("; ");
        structuredInsights.intrinsicValue = Math.round(fairValueSynthesis.range.mid);
        structuredInsights.marginOfSafety = fairValueSynthesis.priceVsMid !== 0
          ? `${(fairValueSynthesis.priceVsMid * -100).toFixed(1)}%`
          : null;
        if (fairValueSynthesis.methods.find(m => m.method === "normalized_dcf" && m.perShareValue)) {
          const dcfMethod = fairValueSynthesis.methods.find(m => m.method === "normalized_dcf")!;
          structuredInsights.dcfSummary = `Normalized DCF: $${dcfMethod.perShareValue!.toFixed(2)}/share (weight: ${(dcfMethod.effectiveWeight * 100).toFixed(0)}%)`;
        }
        // Scenarios from method spread
        const selfHist = fairValueSynthesis.methods.find(m => m.method === "self_history");
        const relVal = fairValueSynthesis.methods.find(m => m.method === "relative_valuation");
        structuredInsights.bullCase = `Fair value high: $${fairValueSynthesis.range.high.toFixed(0)} (self-history: $${selfHist?.perShareValue?.toFixed(0) ?? "N/A"}, relative: $${relVal?.perShareValue?.toFixed(0) ?? "N/A"})`;
        structuredInsights.baseCase = `Fair value mid: $${fairValueSynthesis.range.mid.toFixed(0)} (weighted from ${fairValueSynthesis.methods.filter(m => m.effectiveWeight > 0).length} methods)`;
        structuredInsights.bearCase = `Fair value low: $${fairValueSynthesis.range.low.toFixed(0)} (normalized DCF: $${fairValueSynthesis.methods.find(m => m.method === "normalized_dcf")?.perShareValue?.toFixed(0) ?? "N/A"})`;
      }
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

    // Map effective status to DB field
    // The value gate may upgrade PUBLISH_FACTS_ONLY to PUBLISH_FACTS_PLUS_VALUE
    const effectiveStatus = gate.status === "WITHHOLD_ALL" ? "WITHHOLD_ALL"
      : valueGate.valuePublishable ? "PUBLISH_FACTS_PLUS_VALUE"
      : gate.status;

    const dbStatus = effectiveStatus === "WITHHOLD_ALL" ? "withheld"
      : effectiveStatus === "PUBLISH_FACTS_PLUS_VALUE" ? "published"
      : effectiveStatus === "PUBLISH_FULL" ? "published"
      : "published_with_warnings";

    await db.insert(stockValuations).values({
      ticker: upperTicker,
      companyName: facts.companyName,
      cik: facts.cik,
      status: dbStatus,
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
