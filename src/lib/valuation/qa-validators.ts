/**
 * Deterministic QA validators and publish gate.
 *
 * Checks for arithmetic errors, data completeness, methodology issues,
 * and consistency before allowing publication.
 */

import type { CanonicalFacts, FinancialModelOutputs, ValuationOutputs, QaIssue, QaReport } from "./types";

function issue(location: string, error: string, correctValue: string, severity: QaIssue["severity"]): QaIssue {
  return { location, error, correctValue, severity };
}

// ---------------------------------------------------------------------------
// Individual validators
// ---------------------------------------------------------------------------

function validateSourceCompleteness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (!facts.latestAnnualFiling) {
    issues.push(issue("CanonicalFacts", "No 10-K filing found", "At least one 10-K required", "high"));
  }
  if (!facts.latestQuarterlyFiling) {
    issues.push(issue("CanonicalFacts", "No 10-Q filing found", "At least one 10-Q required for TTM", "medium"));
  }
  if (facts.currentPrice.value === null) {
    issues.push(issue("MarketData", "Current price is null", "Price required for valuation", "high"));
  }
  if (facts.sharesOutstanding.value === null || facts.sharesOutstanding.value === 0) {
    issues.push(issue("MarketData", "Shares outstanding is null or zero", "Shares required for per-share values", "high"));
  }

  return issues;
}

function validateTtmConsistency(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (facts.ttmRevenue.value === null) {
    issues.push(issue("TTM", "TTM revenue is null — could not sum 4 quarters", "Need 4 quarterly revenue values", "high"));
  }
  if (facts.ttmNetIncome.value === null) {
    issues.push(issue("TTM", "TTM net income is null", "Need 4 quarterly net income values", "medium"));
  }
  if (facts.ttmOCF.value === null) {
    issues.push(issue("TTM", "TTM operating cash flow is null", "Need 4 quarterly OCF values", "medium"));
  }
  if (facts.ttmFCF.value === null) {
    issues.push(issue("TTM", "TTM free cash flow is null (OCF or CapEx missing)", "Need both OCF and CapEx", "medium"));
  }

  // Check FCF = OCF - CapEx
  if (facts.ttmOCF.value !== null && facts.ttmCapex.value !== null && facts.ttmFCF.value !== null) {
    const expected = facts.ttmOCF.value - facts.ttmCapex.value;
    const diff = Math.abs(facts.ttmFCF.value - expected);
    if (diff > 1e6) { // tolerance of $1M
      issues.push(issue("TTM", `FCF (${facts.ttmFCF.value}) != OCF (${facts.ttmOCF.value}) - CapEx (${facts.ttmCapex.value})`, `Expected: ${expected}`, "high"));
    }
  }

  return issues;
}

function validateRatioFormulas(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];
  const tol = 0.01; // 1% tolerance for rounding

  // P/E = price / TTM diluted EPS
  if (facts.trailingPE.value !== null && facts.currentPrice.value !== null && facts.ttmDilutedEPS.value !== null && facts.ttmDilutedEPS.value !== 0) {
    const expected = facts.currentPrice.value / facts.ttmDilutedEPS.value;
    if (Math.abs(facts.trailingPE.value - expected) / expected > tol) {
      issues.push(issue("Ratios", `P/E (${facts.trailingPE.value.toFixed(2)}) doesn't match price/EPS`, `Expected: ${expected.toFixed(2)}`, "high"));
    }
  }

  // P/B = price / BVPS
  if (facts.priceToBook.value !== null && facts.currentPrice.value !== null && facts.bookValuePerShare.value !== null && facts.bookValuePerShare.value !== 0) {
    const expected = facts.currentPrice.value / facts.bookValuePerShare.value;
    if (Math.abs(facts.priceToBook.value - expected) / expected > tol) {
      issues.push(issue("Ratios", `P/B (${facts.priceToBook.value.toFixed(2)}) doesn't match price/BVPS`, `Expected: ${expected.toFixed(2)}`, "medium"));
    }
  }

  // EV = market cap + debt - cash
  if (facts.enterpriseValue.value !== null && facts.marketCap.value !== null) {
    const expected = facts.marketCap.value + (facts.totalDebt.value ?? 0) - (facts.totalCashAndInvestments.value ?? 0);
    const diff = Math.abs(facts.enterpriseValue.value - expected);
    if (diff > 1e8) { // $100M tolerance
      issues.push(issue("Ratios", `EV doesn't match marketCap + debt - cash`, `Computed: ${facts.enterpriseValue.value}, Expected: ${expected}`, "high"));
    }
  }

  return issues;
}

function validatePriceFreshness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];
  const priceDate = new Date(facts.currentPrice.asOf);
  const now = new Date();
  const hoursOld = (now.getTime() - priceDate.getTime()) / (1000 * 60 * 60);

  if (hoursOld > 48) {
    issues.push(issue("MarketData", `Price is ${Math.round(hoursOld)}h old (${facts.currentPrice.asOf})`, "Price should be < 24h old", "medium"));
  }

  return issues;
}

function validateCycleAwareness(facts: CanonicalFacts, model: FinancialModelOutputs): QaIssue[] {
  const issues: QaIssue[] = [];

  if (model.cycleState === "peak" || model.cycleState === "above_mid") {
    if (model.normalizedFCF === null || model.normalizedFCF === facts.ttmFCF.value) {
      issues.push(issue("Normalization", `Company at ${model.cycleState} but FCF not normalized`, "Mid-cycle FCF should be computed", "medium"));
    }
  }

  return issues;
}

function validateDcfIntegrity(valuation: ValuationOutputs): QaIssue[] {
  const issues: QaIssue[] = [];

  if (!valuation.dcf) return issues;

  const dcf = valuation.dcf;

  // WACC should be reasonable
  if (dcf.wacc < 0.05 || dcf.wacc > 0.20) {
    issues.push(issue("DCF", `WACC of ${(dcf.wacc * 100).toFixed(1)}% is outside reasonable range (5-20%)`, "Check beta and capital structure", "medium"));
  }

  // Terminal growth should be < WACC
  if (dcf.terminalGrowth >= dcf.wacc) {
    issues.push(issue("DCF", `Terminal growth (${(dcf.terminalGrowth * 100).toFixed(1)}%) >= WACC (${(dcf.wacc * 100).toFixed(1)}%)`, "Terminal growth must be < WACC", "high"));
  }

  // Per share value should be positive
  if (dcf.perShareValue <= 0) {
    issues.push(issue("DCF", `Per-share value is ${dcf.perShareValue.toFixed(2)}`, "Negative equity value — check debt levels", "high"));
  }

  // Terminal value shouldn't dominate (>85% of EV is a warning)
  const tvPct = dcf.pvTerminal / dcf.enterpriseValue;
  if (tvPct > 0.85) {
    issues.push(issue("DCF", `Terminal value is ${(tvPct * 100).toFixed(0)}% of enterprise value`, "Consider extending explicit forecast period", "low"));
  }

  return issues;
}

function validateDataCompleteness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (facts.missingFields.length > 3) {
    issues.push(issue("XBRL", `${facts.missingFields.length} fields missing from XBRL: ${facts.missingFields.join(", ")}`, "Some analysis may be limited", "low"));
  }

  if (facts.annualHistory.length < 3) {
    issues.push(issue("History", `Only ${facts.annualHistory.length} years of annual history`, "5 years preferred for reliable trend analysis", "medium"));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main QA runner
// ---------------------------------------------------------------------------

export function runQaValidation(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs
): QaReport {
  const allIssues: QaIssue[] = [
    ...validateSourceCompleteness(facts),
    ...validateTtmConsistency(facts),
    ...validateRatioFormulas(facts),
    ...validatePriceFreshness(facts),
    ...validateCycleAwareness(facts, model),
    ...validateDcfIntegrity(valuation),
    ...validateDataCompleteness(facts),
  ];

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const mediumCount = allIssues.filter((i) => i.severity === "medium").length;

  let status: QaReport["status"];
  if (highCount > 0) {
    status = "withheld";
  } else if (mediumCount > 0) {
    status = "published_with_warnings";
  } else {
    status = "published";
  }

  return {
    issues: allIssues,
    passed: highCount === 0,
    status,
  };
}
