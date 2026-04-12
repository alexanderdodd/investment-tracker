/**
 * Deterministic QA validators and two-stage publish gate.
 *
 * Gate 1 (Facts): Are core facts safe to publish?
 * Gate 2 (Valuation): Are valuation prerequisites safe enough to publish a verdict?
 *
 * See: .claude/features/stock-valuation-spec/06-publish-gate-semantics.md
 */

import type {
  CanonicalFacts,
  FinancialModelOutputs,
  ValuationOutputs,
  QaIssue,
  QaReport,
  GateDecision,
  PublishGateStatus,
} from "./types";

function issue(location: string, error: string, correctValue: string, severity: QaIssue["severity"]): QaIssue {
  return { location, error, correctValue, severity };
}

// ---------------------------------------------------------------------------
// Gate 1 validators — Facts integrity
// ---------------------------------------------------------------------------

function validateSourceCompleteness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (!facts.latestAnnualFiling) {
    issues.push(issue("SRC-002", "No 10-K filing found", "At least one 10-K required", "high"));
  }
  if (!facts.latestQuarterlyFiling) {
    issues.push(issue("SRC-001", "No 10-Q filing found", "At least one 10-Q required for TTM", "high"));
  }
  if (facts.currentPrice.value === null) {
    issues.push(issue("SRC-004", "Current price is null", "Price required for valuation", "high"));
  }
  if (facts.sharesOutstanding.value === null || facts.sharesOutstanding.value === 0) {
    issues.push(issue("SHARES-001", "Shares outstanding is null or zero", "Shares required for per-share values", "high"));
  }

  return issues;
}

function validateTtmConsistency(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (facts.ttmRevenue.value === null) {
    issues.push(issue("TTM-001", "TTM revenue is null — could not sum 4 quarters", "Need 4 quarterly revenue values", "high"));
  }
  if (facts.ttmNetIncome.value === null) {
    issues.push(issue("TTM-004", "TTM net income is null", "Need 4 quarterly net income values", "high"));
  }
  if (facts.ttmOCF.value === null) {
    issues.push(issue("TTM-006", "TTM operating cash flow is null", "Need 4 quarterly OCF values", "high"));
  }
  if (facts.ttmFCF.value === null) {
    issues.push(issue("TTM-008", "TTM free cash flow is null (OCF or CapEx missing)", "Need both OCF and CapEx", "high"));
  }

  // Check FCF = OCF - CapEx
  if (facts.ttmOCF.value !== null && facts.ttmCapex.value !== null && facts.ttmFCF.value !== null) {
    const expected = facts.ttmOCF.value - facts.ttmCapex.value;
    const diff = Math.abs(facts.ttmFCF.value - expected);
    if (diff > 1e6) { // tolerance of $1M
      issues.push(issue("TTM-008", `FCF (${facts.ttmFCF.value}) != OCF (${facts.ttmOCF.value}) - CapEx (${facts.ttmCapex.value})`, `Expected: ${expected}`, "high"));
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
      issues.push(issue("MULT-001", `P/E (${facts.trailingPE.value.toFixed(2)}) doesn't match price/EPS`, `Expected: ${expected.toFixed(2)}`, "high"));
    }
  }

  // P/B = price / BVPS
  if (facts.priceToBook.value !== null && facts.currentPrice.value !== null && facts.bookValuePerShare.value !== null && facts.bookValuePerShare.value !== 0) {
    const expected = facts.currentPrice.value / facts.bookValuePerShare.value;
    if (Math.abs(facts.priceToBook.value - expected) / expected > tol) {
      issues.push(issue("MULT-002", `P/B (${facts.priceToBook.value.toFixed(2)}) doesn't match price/BVPS`, `Expected: ${expected.toFixed(2)}`, "medium"));
    }
  }

  // EV = market cap + debt - cash
  if (facts.enterpriseValue.value !== null && facts.marketCap.value !== null) {
    const expected = facts.marketCap.value + (facts.totalDebt.value ?? 0) - (facts.totalCashAndInvestments.value ?? 0);
    const diff = Math.abs(facts.enterpriseValue.value - expected);
    if (diff > 1e8) { // $100M tolerance
      issues.push(issue("MKT-002", `EV doesn't match marketCap + debt - cash`, `Computed: ${facts.enterpriseValue.value}, Expected: ${expected}`, "high"));
    }
  }

  return issues;
}

function validateBalanceSheet(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (facts.totalEquity.value === null) {
    issues.push(issue("BS-002", "Total equity is null", "Required for book value and leverage calculations", "high"));
  }
  if (facts.cash.value === null) {
    issues.push(issue("BS-001", "Cash is null", "Required for EV calculation", "high"));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Gate 2 validators — Valuation prerequisites
// ---------------------------------------------------------------------------

function validateCycleAndHistoryForValuation(
  facts: CanonicalFacts,
  model: FinancialModelOutputs
): string[] {
  const failures: string[] = [];

  // HIST-001: Cyclical names need ≥5 years of history for DCF normalization
  const isCyclical = model.cycleState === "peak" || model.cycleState === "above_mid" ||
    model.cycleState === "trough" || model.cycleState === "below_mid";
  if (isCyclical && facts.annualHistory.length < 5) {
    failures.push("HIST-001: Fewer than 5 annual periods for cyclical normalization");
  }

  // VAL-001: Cycle classification must come from validated history
  if (model.cycleState === "unknown" && facts.annualHistory.length >= 3) {
    failures.push("VAL-001: Cycle state unknown despite sufficient history");
  }

  // Check if current margins are far above historical averages — indicates
  // cycle-normalization model needed for reliable DCF
  const latestGrossMargin = facts.latestQuarterGrossMargin.value;
  const avgGrossMargin = facts.fiveYearAvgGrossMargin.value;
  const latestOpMargin = facts.latestQuarterOperatingMargin.value;
  const avgOpMargin = facts.fiveYearAvgOperatingMargin.value;

  // VAL-005: Cycle divergence check — tagged as GATE_TRIGGER because detecting
  // a cycle peak is correct behavior, not a defect. The gate uses this to withhold
  // the valuation verdict, but the check itself "passed" (correctly identified the condition).
  if (latestGrossMargin !== null && avgGrossMargin !== null && avgGrossMargin > 0) {
    const ratio = latestGrossMargin / avgGrossMargin;
    if (ratio > 2.0) {
      failures.push(
        `VAL-005 [GATE_TRIGGER]: Latest gross margin (${(latestGrossMargin * 100).toFixed(1)}%) is ${ratio.toFixed(1)}x the 5Y average (${(avgGrossMargin * 100).toFixed(1)}%) — cycle-normalized DCF too assumption-sensitive for reliable verdict`
      );
    }
  }

  if (latestOpMargin !== null && avgOpMargin !== null && avgOpMargin > 0) {
    const ratio = latestOpMargin / avgOpMargin;
    if (ratio > 3.0) {
      failures.push(
        `VAL-005 [GATE_TRIGGER]: Latest operating margin (${(latestOpMargin * 100).toFixed(1)}%) is ${ratio.toFixed(1)}x the 5Y average (${(avgOpMargin * 100).toFixed(1)}%) — extreme cycle divergence`
      );
    }
  }

  // VAL-004: Direct peer set not yet deterministically sourced
  // For now, this always fails since we don't have a curated peer registry
  failures.push("VAL-004: Direct peer set for multiples is not deterministically sourced or curated");

  return failures;
}

function validateDcfIntegrity(valuation: ValuationOutputs): QaIssue[] {
  const issues: QaIssue[] = [];

  if (!valuation.dcf) return issues;

  const dcf = valuation.dcf;

  // WACC should be reasonable
  if (dcf.wacc < 0.05 || dcf.wacc > 0.20) {
    issues.push(issue("VAL-003", `WACC of ${(dcf.wacc * 100).toFixed(1)}% is outside reasonable range (5-20%)`, "Check beta and capital structure", "medium"));
  }

  // Terminal growth should be < WACC
  if (dcf.terminalGrowth >= dcf.wacc) {
    issues.push(issue("VAL-003", `Terminal growth (${(dcf.terminalGrowth * 100).toFixed(1)}%) >= WACC (${(dcf.wacc * 100).toFixed(1)}%)`, "Terminal growth must be < WACC", "high"));
  }

  // Per share value should be positive
  if (dcf.perShareValue <= 0) {
    issues.push(issue("VAL-002", `Per-share value is ${dcf.perShareValue.toFixed(2)}`, "Negative equity value — check debt levels", "high"));
  }

  // Terminal value shouldn't dominate (>85% of EV is a warning)
  const tvPct = dcf.pvTerminal / dcf.enterpriseValue;
  if (tvPct > 0.85) {
    issues.push(issue("DCF", `Terminal value is ${(tvPct * 100).toFixed(0)}% of enterprise value`, "Consider extending explicit forecast period", "low"));
  }

  return issues;
}

function validatePriceFreshness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];
  const priceDate = new Date(facts.currentPrice.asOf);
  const now = new Date();
  const hoursOld = (now.getTime() - priceDate.getTime()) / (1000 * 60 * 60);

  if (hoursOld > 48) {
    issues.push(issue("SRC-004", `Price is ${Math.round(hoursOld)}h old (${facts.currentPrice.asOf})`, "Price should be < 48h old", "medium"));
  }

  return issues;
}

function validateDataCompleteness(facts: CanonicalFacts): QaIssue[] {
  const issues: QaIssue[] = [];

  if (facts.missingFields.length > 3) {
    issues.push(issue("XBRL", `${facts.missingFields.length} fields missing from XBRL: ${facts.missingFields.join(", ")}`, "Some analysis may be limited", "low"));
  }

  if (facts.annualHistory.length < 3) {
    issues.push(issue("HIST-001", `Only ${facts.annualHistory.length} years of annual history`, "5 years preferred for reliable trend analysis", "medium"));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Two-stage publish gate
// ---------------------------------------------------------------------------

function computeGateDecision(
  factsIssues: QaIssue[],
  valuationIssues: QaIssue[],
  valuationPrereqFailures: string[],
  confidenceScore: number
): GateDecision {
  const factsHighFails = factsIssues.filter(i => i.severity === "high");
  const valuationHighFails = valuationIssues.filter(i => i.severity === "high");

  // Gate 1: Facts gate
  if (factsHighFails.length > 0) {
    return {
      status: "WITHHOLD_ALL",
      factsPublishable: false,
      valuationPublishable: false,
      valuationConfidence: null,
      factsGateFailures: factsHighFails.map(i => `${i.location}: ${i.error}`),
      valuationGateFailures: [],
    };
  }

  // Gate 2: Valuation gate
  const allValuationFailures = [
    ...valuationPrereqFailures,
    ...valuationHighFails.map(i => `${i.location}: ${i.error}`),
  ];

  if (allValuationFailures.length > 0) {
    return {
      status: "PUBLISH_FACTS_ONLY",
      factsPublishable: true,
      valuationPublishable: false,
      valuationConfidence: null,
      factsGateFailures: [],
      valuationGateFailures: allValuationFailures,
    };
  }

  // Check for non-critical warnings
  const allIssues = [...factsIssues, ...valuationIssues];
  const mediumCount = allIssues.filter(i => i.severity === "medium").length;

  if (mediumCount > 0) {
    return {
      status: "PUBLISH_WITH_WARNINGS",
      factsPublishable: true,
      valuationPublishable: true,
      valuationConfidence: confidenceScore,
      factsGateFailures: [],
      valuationGateFailures: [],
    };
  }

  return {
    status: "PUBLISH_FULL",
    factsPublishable: true,
    valuationPublishable: true,
    valuationConfidence: confidenceScore,
    factsGateFailures: [],
    valuationGateFailures: [],
  };
}

// ---------------------------------------------------------------------------
// Main QA runner
// ---------------------------------------------------------------------------

export function runQaValidation(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  valuation: ValuationOutputs
): QaReport {
  // Gate 1: Facts integrity checks
  const factsIssues: QaIssue[] = [
    ...validateSourceCompleteness(facts),
    ...validateTtmConsistency(facts),
    ...validateRatioFormulas(facts),
    ...validateBalanceSheet(facts),
    ...validatePriceFreshness(facts),
    ...validateDataCompleteness(facts),
  ];

  // Gate 2: Valuation prerequisite checks
  const valuationIssues: QaIssue[] = [
    ...validateDcfIntegrity(valuation),
  ];

  // Valuation prerequisite failures (not QA issues — structural blocks)
  const valuationPrereqFailures = validateCycleAndHistoryForValuation(facts, model);

  const allIssues = [...factsIssues, ...valuationIssues];
  const highCount = allIssues.filter(i => i.severity === "high").length;
  const mediumCount = allIssues.filter(i => i.severity === "medium").length;

  // Legacy status for backward compatibility
  let status: QaReport["status"];
  if (highCount > 0) {
    status = "withheld";
  } else if (mediumCount > 0 || valuationPrereqFailures.length > 0) {
    status = "published_with_warnings";
  } else {
    status = "published";
  }

  const gateDecision = computeGateDecision(
    factsIssues,
    valuationIssues,
    valuationPrereqFailures,
    valuation.confidenceScore
  );

  return {
    issues: allIssues,
    passed: highCount === 0,
    status,
    gateDecision,
  };
}
