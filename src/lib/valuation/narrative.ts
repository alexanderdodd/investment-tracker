/**
 * LLM narrative synthesis — locked to deterministic artifacts.
 *
 * The LLM may explain and interpret the valuation but may NOT:
 * - Introduce new numeric facts
 * - Change values from CanonicalFacts or ValuationOutputs
 * - Fetch new prices or recompute TTM
 */

import { generateText } from "ai";
import { openrouter } from "../ai";
import type { CanonicalFacts, FinancialModelOutputs, ValuationOutputs, QaReport } from "./types";
import type { FairValueSynthesis } from "./fair-value-synthesis";

const NARRATIVE_MODEL = "anthropic/claude-sonnet-4";
const REDTEAM_MODEL = "anthropic/claude-sonnet-4";

function formatFactsForPrompt(facts: CanonicalFacts): string {
  const f = (v: number | null, decimals = 2) => v !== null ? v.toFixed(decimals) : "N/A";
  const fB = (v: number | null) => v !== null ? `$${(v / 1e9).toFixed(2)}B` : "N/A";
  const fPct = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";

  return `LOCKED VERIFIED DATA — ${facts.companyName} (${facts.ticker})
CIK: ${facts.cik} | Sector: ${facts.sector} | FY End: ${facts.fiscalYearEnd}
Latest 10-K: ${facts.latestAnnualFiling?.accession ?? "N/A"} (period: ${facts.latestAnnualFiling?.periodEnd ?? "N/A"})
Latest 10-Q: ${facts.latestQuarterlyFiling?.accession ?? "N/A"} (period: ${facts.latestQuarterlyFiling?.periodEnd ?? "N/A"})

MARKET DATA (${facts.currentPrice.asOf})
  Price: $${f(facts.currentPrice.value)} | Shares: ${f(facts.sharesOutstanding.value, 0)} | Market Cap: ${fB(facts.marketCap.value)} | EV: ${fB(facts.enterpriseValue.value)}

TTM FINANCIALS (${facts.quartersUsed})
  Revenue: ${fB(facts.ttmRevenue.value)} | Gross Profit: ${fB(facts.ttmGrossProfit.value)} | Operating Income: ${fB(facts.ttmOperatingIncome.value)}
  Net Income: ${fB(facts.ttmNetIncome.value)} | Diluted EPS: $${f(facts.ttmDilutedEPS.value)}
  OCF: ${fB(facts.ttmOCF.value)} | CapEx: ${fB(facts.ttmCapex.value)} | FCF: ${fB(facts.ttmFCF.value)}
  D&A: ${fB(facts.ttmDA.value)} | SBC: ${fB(facts.ttmSBC.value)}

LATEST QUARTER
  Revenue: ${fB(facts.latestQuarterRevenue.value)} | Gross Margin: ${fPct(facts.latestQuarterGrossMargin.value)} | Op Margin: ${fPct(facts.latestQuarterOperatingMargin.value)}

BALANCE SHEET
  Cash: ${fB(facts.totalCashAndInvestments.value)} | Debt: ${fB(facts.totalDebt.value)} | Equity: ${fB(facts.totalEquity.value)} | BVPS: $${f(facts.bookValuePerShare.value)}

RATIOS
  P/E: ${f(facts.trailingPE.value, 1)}x | P/B: ${f(facts.priceToBook.value, 1)}x | EV/Rev: ${f(facts.evToRevenue.value, 1)}x

5Y AVERAGES
  Gross Margin: ${fPct(facts.fiveYearAvgGrossMargin.value)} | Op Margin: ${fPct(facts.fiveYearAvgOperatingMargin.value)}

ANNUAL HISTORY
${facts.annualHistory.map(h => `  FY${h.year}: Rev ${h.revenue !== null ? `$${(h.revenue / 1e9).toFixed(1)}B` : "N/A"} | GM ${fPct(h.grossMargin)} | OM ${fPct(h.operatingMargin)}`).join("\n")}

DATA QUALITY: ${facts.dataQualityNotes.join("; ") || "No issues"}
MISSING XBRL FIELDS: ${facts.missingFields.join(", ") || "None"}`;
}

function formatModelOutputsForPrompt(model: FinancialModelOutputs, suppressedFields?: string[]): string {
  const suppressed = new Set(suppressedFields ?? []);
  const f = (v: number | null, decimals = 2) => v !== null ? v.toFixed(decimals) : "N/A";
  const fPct = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";

  const lines: string[] = ["FINANCIAL MODEL OUTPUTS"];
  lines.push(`  Cycle State: ${model.cycleState}`);
  lines.push(`  Cash Conversion: ${f(model.cashConversionRatio)}x`);

  if (!suppressed.has("model.roe"))
    lines.push(`  ROE: ${fPct(model.roe)}`);
  if (!suppressed.has("model.roic"))
    lines.push(`  ROIC: ${fPct(model.roic)}`);

  lines.push(`  Debt/Equity: ${f(model.debtToEquity)}`);
  lines.push(`  Debt/EBITDA: ${f(model.debtToEbitda)}x`);

  if (!suppressed.has("model.interest_coverage"))
    lines.push(`  Interest Coverage: ${f(model.interestCoverage)}x`);

  lines.push(`  Capex Intensity: ${fPct(model.capexIntensity)}`);
  lines.push(`  SBC/Revenue: ${fPct(model.sbcAsPercentOfRevenue)}`);

  if (!suppressed.has("model.normalized_fcf")) {
    lines.push(`  Normalized Op Margin: ${fPct(model.normalizedOperatingMargin)}`);
    lines.push(`  Normalized FCF: ${model.normalizedFCF !== null ? `$${(model.normalizedFCF / 1e9).toFixed(2)}B` : "N/A"}`);
  }

  // Never include cycle confidence score — it implies valuation usability
  // (cycle state is included as qualitative context, but the numeric score is denied)

  return lines.join("\n");
}

function formatValuationForPrompt(val: ValuationOutputs, price: number | null): string {
  const lines: string[] = ["VALUATION OUTPUTS"];

  if (val.dcf) {
    lines.push(`  DCF: Per-share value $${val.dcf.perShareValue.toFixed(2)} | WACC ${(val.dcf.wacc * 100).toFixed(1)}% | Terminal growth ${(val.dcf.terminalGrowth * 100).toFixed(1)}%`);
    lines.push(`  DCF base year FCF: $${(val.dcf.baseYearFCF / 1e9).toFixed(2)}B (normalized: ${val.dcf.normalized})`);
  }

  lines.push(`  Multiples: P/E ${val.multiples.current.pe?.toFixed(1) ?? "N/A"}x | P/B ${val.multiples.current.pb?.toFixed(1) ?? "N/A"}x | EV/EBITDA ${val.multiples.current.evEbitda?.toFixed(1) ?? "N/A"}x`);

  if (val.reverseDcf) {
    lines.push(`  Reverse DCF: ${val.reverseDcf.interpretation}`);
  }

  if (val.scenarios) {
    lines.push(`  Bull: $${val.scenarios.bull.perShareValue.toFixed(2)} | Base: $${val.scenarios.base.perShareValue.toFixed(2)} | Bear: $${val.scenarios.bear.perShareValue.toFixed(2)}`);
  }

  lines.push(`  Verdict: ${val.verdict} | Confidence: ${(val.confidenceScore * 100).toFixed(0)}%`);
  if (val.marginOfSafety !== null && price !== null) {
    lines.push(`  Margin of Safety: ${(val.marginOfSafety * 100).toFixed(1)}% vs current price $${price.toFixed(2)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Narrative synthesis
// ---------------------------------------------------------------------------

export async function generateNarrative(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs,
  qa: QaReport,
  onProgress?: (label: string) => void,
  suppressedFields?: string[],
  fairValueSynthesis?: FairValueSynthesis
): Promise<string> {
  const factsText = formatFactsForPrompt(facts);
  const modelText = formatModelOutputsForPrompt(model, suppressedFields);
  const qaText = qa.issues.length > 0
    ? `QA ISSUES:\n${qa.issues.map(i => `  [${i.severity.toUpperCase()}] ${i.location}: ${i.error}`).join("\n")}`
    : "QA: All checks passed.";

  onProgress?.("Writing analyst narrative");

  // Determine which narrative mode to use
  const valuePublished = fairValueSynthesis !== undefined;
  const valuationWithheld = !valuePublished && qa.gateDecision && !qa.gateDecision.valuationPublishable;

  let valuationText: string;
  let valuationInstructions: string;

  if (valuePublished && fairValueSynthesis) {
    // Value gate published — include fair value context
    valuationText = `FAIR VALUE ASSESSMENT — PUBLISHED
Fair Value Range: $${fairValueSynthesis.range.low.toFixed(2)} — $${fairValueSynthesis.range.mid.toFixed(2)} — $${fairValueSynthesis.range.high.toFixed(2)}
Label: ${fairValueSynthesis.label}
Current Price: $${fairValueSynthesis.currentPrice.toFixed(2)} (${fairValueSynthesis.priceVsMid > 0 ? "+" : ""}${(fairValueSynthesis.priceVsMid * 100).toFixed(1)}% vs midpoint)
Confidence: ${fairValueSynthesis.confidenceRating} (${(fairValueSynthesis.valuationConfidence * 100).toFixed(0)}%)
${fairValueSynthesis.confidenceReasons.map(r => `- ${r}`).join("\n")}

Method contributions:
${fairValueSynthesis.methods.filter(m => m.effectiveWeight > 0).map(m => `  ${m.method}: $${m.perShareValue?.toFixed(2) ?? "N/A"} (weight: ${(m.effectiveWeight * 100).toFixed(0)}%)`).join("\n")}

MARKET MULTIPLES:
  P/E: ${valuation.multiples.current.pe?.toFixed(1) ?? "N/A"}x | P/B: ${valuation.multiples.current.pb?.toFixed(1) ?? "N/A"}x | EV/EBITDA: ${valuation.multiples.current.evEbitda?.toFixed(1) ?? "N/A"}x`;

    valuationInstructions = `
VALUATION CONTEXT — FAIR VALUE PUBLISHED:
A fair value range has been computed and published for this company. You MUST reference it in your analysis.

The system labels this stock as ${fairValueSynthesis.label} with ${fairValueSynthesis.confidenceRating} confidence.

You MUST:
- Reference the fair value range ($${fairValueSynthesis.range.low.toFixed(0)} - $${fairValueSynthesis.range.mid.toFixed(0)} - $${fairValueSynthesis.range.high.toFixed(0)})
- Explain what the ${fairValueSynthesis.label} label means for investors
- Discuss why confidence is ${fairValueSynthesis.confidenceRating} and what drives the uncertainty
- Note the key assumptions behind the valuation methods

You MUST NOT:
- Say "fair value cannot be determined" or "valuation withheld" — the fair value HAS been determined
- Invent different fair value numbers — use only the range provided above
- Provide buy/sell recommendations — only discuss valuation context
- Overstate the precision of the midpoint — the confidence rating captures the uncertainty

Write the report as a FACTS, VALUATION, AND ANALYSIS report.`;

  } else if (valuationWithheld) {
    valuationText = `VALUATION STATUS: WITHHELD
The valuation gate has determined that a fair-value verdict cannot be published for this company at this time.
Reasons: ${qa.gateDecision.valuationGateFailures.join("; ")}

MARKET MULTIPLES (publishable — these are derived from reconciled facts, not a valuation opinion):
  P/E: ${valuation.multiples.current.pe?.toFixed(1) ?? "N/A"}x | P/B: ${valuation.multiples.current.pb?.toFixed(1) ?? "N/A"}x | EV/EBITDA: ${valuation.multiples.current.evEbitda?.toFixed(1) ?? "N/A"}x`;

    // Build denied-field instruction block from suppression audit
    const deniedFieldNames = (suppressedFields ?? []).map(f => {
      const labels: Record<string, string> = {
        "model.roe": "ROE (return on equity)",
        "model.roic": "ROIC (return on invested capital)",
        "model.interest_coverage": "Interest coverage ratio",
        "model.normalized_fcf": "Normalized free cash flow or normalized FCF",
        "model.cycle_confidence": "Cycle confidence score or level",
        "valuation.fair_value": "Fair value",
        "valuation.target_price": "Target price",
        "valuation.margin_of_safety": "Margin of safety",
        "valuation.confidence": "Valuation confidence score",
        "valuation.scenarios": "Bull/base/bear scenario price targets",
      };
      return labels[f] ?? f;
    });

    const deniedFieldBlock = deniedFieldNames.length > 0
      ? `\nDENIED FIELDS — DO NOT MENTION OR COMPUTE THESE IN YOUR REPORT:\n${deniedFieldNames.map(n => `- ${n}`).join("\n")}\n\nThese fields have been suppressed by the deterministic gate. You MUST NOT:\n- Reference their values, even approximately\n- Compute or derive them from other available data\n- Use phrases like "return on equity" or "return on invested capital" with percentages\n- Mention normalized free cash flow or cycle confidence scores\n- State or imply interest coverage ratios\nIf you find yourself calculating net income / equity or similar, STOP — that metric is denied.\n`
      : "";

    valuationInstructions = `
CRITICAL INSTRUCTION — VALUATION WITHHELD:
The valuation verdict has been withheld by the deterministic gate. You MUST NOT include any of the following in your report:
- Fair value estimates or target prices
- Margin of safety calculations
- "Undervalued", "Overvalued", or "Fair Value" verdicts
- DCF per-share values
- Investment conclusions (buy, sell, hold)
- Confidence scores related to valuation
- Bull/base/bear scenario price targets
${deniedFieldBlock}
You MAY discuss:
- The reconciled financial facts and market multiples
- The company's financial health, profitability, and cash generation
- The cycle position and what it means for durability
- Qualitative risks and structural factors
- Why the valuation is withheld (explain this to the reader)

Write the report as a FACTS AND ANALYSIS report, not a valuation report.`;
  } else {
    valuationText = formatValuationForPrompt(valuation, facts.currentPrice.value);
    valuationInstructions = `Write a structured analyst report with these sections:

1. EXECUTIVE SUMMARY (3-4 sentences: verdict, key reason, confidence level)

2. BUSINESS OVERVIEW (what the company does, competitive position, recent developments — use your knowledge but do not introduce new financial numbers)

3. FINANCIAL ANALYSIS (interpret the model outputs above — margins, cash conversion, cycle state, normalization. Explain what the numbers mean for the investment case)

4. VALUATION (explain the DCF assumptions and result, the multiples comparison, the reverse DCF interpretation. What is the market implying? Is the current price justified?)

5. RISKS AND SCENARIOS (bull/base/bear from the valuation outputs, plus qualitative risks from your knowledge of the business and industry)

6. METHODOLOGY AND CONFIDENCE (what methods were used, what data quality issues exist, what could be wrong with this analysis)`;
  }

  const prompt = `You are writing a stock ${valuationWithheld ? "facts and analysis" : "valuation analyst"} report for ${facts.companyName} (${facts.ticker}).

You are working from LOCKED deterministic outputs. These numbers have been computed from SEC XBRL filings and market data. You may NOT:
- Introduce any new numeric facts
- Change any values from the data below
- Fetch new prices or recompute TTM figures
- Override the valuation outputs or gate decisions

You MAY:
- Interpret and explain the numbers
- Provide business context and qualitative analysis
- Challenge or caveat the assumptions
- Note risks and opportunities

${factsText}

${modelText}

${valuationText}

${qaText}

${valuationInstructions}

Be factual and measured. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(NARRATIVE_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Red-team review
// ---------------------------------------------------------------------------

export async function redTeamReview(
  narrative: string,
  factsText: string,
  valuationText: string,
  onProgress?: (label: string) => void
): Promise<string> {
  onProgress?.("Running red-team review");

  const prompt = `You are an investment committee reviewer. Challenge this stock valuation report.

LOCKED DATA (ground truth):
${factsText}
${valuationText}

ANALYST REPORT TO REVIEW:
${narrative}

Your job is to challenge the report's conclusions. Specifically flag:
1. Any unsupported optimism or pessimism
2. Missing risks that should be mentioned
3. Structural vs cyclical confusion
4. Overstatement of revenue visibility or recurrence
5. Assumptions that seem aggressive or unreasonable
6. Important qualitative factors the narrative ignores

You may NOT:
- Recompute any numbers
- Introduce new financial data
- Change the valuation outputs

Keep your review concise (10-15 bullet points max). State what you agree with and what you challenge.`;

  const { text } = await generateText({
    model: openrouter()(REDTEAM_MODEL),
    prompt,
  });
  return text;
}
