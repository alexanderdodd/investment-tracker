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

function formatModelOutputsForPrompt(model: FinancialModelOutputs): string {
  const f = (v: number | null, decimals = 2) => v !== null ? v.toFixed(decimals) : "N/A";
  const fPct = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";

  return `FINANCIAL MODEL OUTPUTS
  Cycle State: ${model.cycleState} (confidence: ${f(model.cycleConfidence, 1)})
  Cash Conversion: ${f(model.cashConversionRatio)}x | ROE: ${fPct(model.roe)} | ROIC: ${fPct(model.roic)}
  Debt/Equity: ${f(model.debtToEquity)} | Debt/EBITDA: ${f(model.debtToEbitda)}x | Interest Coverage: ${f(model.interestCoverage)}x
  Capex Intensity: ${fPct(model.capexIntensity)} | SBC/Revenue: ${fPct(model.sbcAsPercentOfRevenue)}
  Normalized Op Margin: ${fPct(model.normalizedOperatingMargin)} | Normalized FCF: ${model.normalizedFCF !== null ? `$${(model.normalizedFCF / 1e9).toFixed(2)}B` : "N/A"}`;
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
  onProgress?: (label: string) => void
): Promise<string> {
  const factsText = formatFactsForPrompt(facts);
  const modelText = formatModelOutputsForPrompt(model);
  const valuationText = formatValuationForPrompt(valuation, facts.currentPrice.value);
  const qaText = qa.issues.length > 0
    ? `QA ISSUES:\n${qa.issues.map(i => `  [${i.severity.toUpperCase()}] ${i.location}: ${i.error}`).join("\n")}`
    : "QA: All checks passed.";

  onProgress?.("Writing analyst narrative");

  const prompt = `You are writing a stock valuation analyst report for ${facts.companyName} (${facts.ticker}).

You are working from LOCKED deterministic outputs. These numbers have been computed from SEC XBRL filings and market data. You may NOT:
- Introduce any new numeric facts
- Change any values from the data below
- Fetch new prices or recompute TTM figures
- Override the valuation outputs

You MAY:
- Interpret and explain the numbers
- Provide business context and qualitative analysis
- Challenge or caveat the assumptions
- Note risks and opportunities

${factsText}

${modelText}

${valuationText}

${qaText}

Write a structured analyst report with these sections:

1. EXECUTIVE SUMMARY (3-4 sentences: verdict, key reason, confidence level)

2. BUSINESS OVERVIEW (what the company does, competitive position, recent developments — use your knowledge but do not introduce new financial numbers)

3. FINANCIAL ANALYSIS (interpret the model outputs above — margins, cash conversion, cycle state, normalization. Explain what the numbers mean for the investment case)

4. VALUATION (explain the DCF assumptions and result, the multiples comparison, the reverse DCF interpretation. What is the market implying? Is the current price justified?)

5. RISKS AND SCENARIOS (bull/base/bear from the valuation outputs, plus qualitative risks from your knowledge of the business and industry)

6. METHODOLOGY AND CONFIDENCE (what methods were used, what data quality issues exist, what could be wrong with this analysis)

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
