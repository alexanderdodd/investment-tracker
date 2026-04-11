/**
 * Deterministic financial analysis engine.
 *
 * Computes ratios, detects cycle state, and normalizes metrics.
 * All inputs come from CanonicalFacts (ProvenancedValue fields accessed via .value).
 * All outputs are plain numbers (or null when data is insufficient).
 */

import type { CanonicalFacts, FinancialModelOutputs, IndustryFramework } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe division — returns null if numerator or denominator is null/zero-denominator. */
function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

// ---------------------------------------------------------------------------
// Revenue growth (YoY from annualHistory)
// ---------------------------------------------------------------------------

function computeRevenueGrowth(
  history: CanonicalFacts["annualHistory"]
): { period: string; value: number }[] {
  const sorted = [...history].sort((a, b) => a.year - b.year);
  const results: { period: string; value: number }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].revenue;
    const curr = sorted[i].revenue;
    if (prev != null && curr != null && prev !== 0) {
      results.push({
        period: `${sorted[i - 1].year}-${sorted[i].year}`,
        value: (curr - prev) / Math.abs(prev),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Margin trends (from annualHistory)
// ---------------------------------------------------------------------------

function computeMarginTrends(
  history: CanonicalFacts["annualHistory"]
): { period: string; gross: number | null; operating: number | null; net: number | null }[] {
  const sorted = [...history].sort((a, b) => a.year - b.year);

  return sorted.map((h) => ({
    period: String(h.year),
    gross: h.grossMargin,
    operating: h.operatingMargin,
    // Net margin not available in annualHistory — set to null
    net: null,
  }));
}

// ---------------------------------------------------------------------------
// Cycle state detection
// ---------------------------------------------------------------------------

type CycleState = FinancialModelOutputs["cycleState"];

function detectCycleState(
  facts: CanonicalFacts
): { state: CycleState; confidence: number } {
  const currentGrossMargin = facts.latestQuarterGrossMargin.value;
  const avgGrossMargin = facts.fiveYearAvgGrossMargin.value;

  const yearsOfHistory = facts.annualHistory.length;

  if (currentGrossMargin == null || avgGrossMargin == null || yearsOfHistory < 2) {
    return { state: "unknown", confidence: yearsOfHistory >= 3 ? 0.6 : 0.3 };
  }

  // Difference in percentage points (values are already ratios, e.g. 0.45 = 45%)
  const diff = currentGrossMargin - avgGrossMargin;

  let state: CycleState;
  if (diff > 0.15) {
    state = "peak";
  } else if (diff > 0.07) {
    state = "above_mid";
  } else if (diff >= -0.07) {
    state = "mid_cycle";
  } else if (diff >= -0.15) {
    state = "below_mid";
  } else {
    state = "trough";
  }

  let confidence: number;
  if (yearsOfHistory >= 5) {
    confidence = 1.0;
  } else if (yearsOfHistory >= 3) {
    confidence = 0.6;
  } else {
    confidence = 0.3;
  }

  return { state, confidence };
}

// ---------------------------------------------------------------------------
// Normalized metrics
// ---------------------------------------------------------------------------

function computeNormalized(
  facts: CanonicalFacts,
  cycleState: CycleState,
  framework: IndustryFramework
): {
  normalizedRevenue: number | null;
  normalizedOperatingMargin: number | null;
  normalizedFCF: number | null;
} {
  const ttmRevenue = facts.ttmRevenue.value;
  const ttmOperatingMargin =
    safeDiv(facts.ttmOperatingIncome.value, facts.ttmRevenue.value);
  const avgOperatingMargin = facts.fiveYearAvgOperatingMargin.value;

  const isCyclicalAtElevated =
    framework.cycleRelevant &&
    (cycleState === "peak" || cycleState === "above_mid");

  if (!isCyclicalAtElevated) {
    // Use reported values
    const reportedFCF = facts.ttmFCF.value;
    return {
      normalizedRevenue: ttmRevenue,
      normalizedOperatingMargin: ttmOperatingMargin,
      normalizedFCF: reportedFCF,
    };
  }

  // Normalize: keep revenue, use average margin
  const normalizedOperatingMargin = avgOperatingMargin;
  const normalizedRevenue = ttmRevenue;

  const taxRate = 0.21;
  const da = facts.ttmDA.value;
  const capex = facts.ttmCapex.value;

  let normalizedFCF: number | null = null;
  if (
    normalizedRevenue != null &&
    normalizedOperatingMargin != null &&
    da != null
  ) {
    // For capital-intensive cyclical companies (semiconductor, commodity),
    // actual capex often includes massive growth investments (new fabs, mines).
    // Using full capex produces unrealistic normalized FCF.
    // Estimate maintenance capex as 1.2x D&A — this reflects the cost of
    // maintaining existing capacity without expansion.
    const maintenanceCapex = framework.cycleRelevant && capex != null && da > 0 && capex > da * 2
      ? da * 1.2  // Growth capex is dominant; use maintenance estimate
      : (capex ?? da); // Normal: use actual capex

    normalizedFCF =
      normalizedRevenue * normalizedOperatingMargin * (1 - taxRate) + da - maintenanceCapex;
  }

  return {
    normalizedRevenue,
    normalizedOperatingMargin,
    normalizedFCF,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeFinancialAnalysis(
  facts: CanonicalFacts,
  framework: IndustryFramework
): FinancialModelOutputs {
  // 1. Revenue growth
  const revenueGrowth = computeRevenueGrowth(facts.annualHistory);

  // 2. Margin trends
  const marginTrends = computeMarginTrends(facts.annualHistory);

  // 3. Cash conversion ratio: TTM OCF / TTM Net Income
  const cashConversionRatio = safeDiv(
    facts.ttmOCF.value,
    facts.ttmNetIncome.value
  );

  // 4. ROE: TTM Net Income / Total Equity
  const roe = safeDiv(facts.ttmNetIncome.value, facts.totalEquity.value);

  // 5. ROIC: TTM Operating Income * (1 - 0.21) / (Total Equity + Total Debt - Total Cash)
  let roic: number | null = null;
  {
    const oi = facts.ttmOperatingIncome.value;
    const eq = facts.totalEquity.value;
    const debt = facts.totalDebt.value;
    const cash = facts.totalCashAndInvestments.value;
    if (oi != null && eq != null && debt != null && cash != null) {
      const investedCapital = eq + debt - cash;
      roic = investedCapital !== 0 ? (oi * (1 - 0.21)) / investedCapital : null;
    }
  }

  // 6. Debt/Equity
  const debtToEquity = safeDiv(facts.totalDebt.value, facts.totalEquity.value);

  // 7. Debt/EBITDA: Total Debt / (TTM Operating Income + TTM D&A)
  let debtToEbitda: number | null = null;
  {
    const oi = facts.ttmOperatingIncome.value;
    const da = facts.ttmDA.value;
    const debt = facts.totalDebt.value;
    if (oi != null && da != null && debt != null) {
      const ebitda = oi + da;
      debtToEbitda = ebitda !== 0 ? debt / ebitda : null;
    }
  }

  // 8. Interest coverage: TTM Operating Income / approximate interest expense
  //    Approximate interest = TTM Operating Income - TTM Net Income (sign-flipped)
  let interestCoverage: number | null = null;
  {
    const oi = facts.ttmOperatingIncome.value;
    const ni = facts.ttmNetIncome.value;
    if (oi != null && ni != null) {
      // Interest expense ≈ Operating Income - Net Income (taxes + interest + other)
      // This is a rough proxy; OI - NI includes taxes too, so this understates coverage.
      const approxInterestAndTax = oi - ni;
      interestCoverage =
        approxInterestAndTax !== 0 ? oi / approxInterestAndTax : null;
    }
  }

  // 9. Dividend payout ratio: TTM Dividends Paid / TTM Net Income
  const dividendPayoutRatio = safeDiv(
    facts.ttmDividendsPaid.value != null
      ? Math.abs(facts.ttmDividendsPaid.value)
      : null,
    facts.ttmNetIncome.value
  );

  // 10. Buyback yield: TTM Buybacks / Market Cap
  const buybackYield = safeDiv(
    facts.ttmBuybacks.value != null
      ? Math.abs(facts.ttmBuybacks.value)
      : null,
    facts.marketCap.value
  );

  // 11. Capex intensity: TTM Capex / TTM Revenue
  const capexIntensity = safeDiv(
    facts.ttmCapex.value != null ? Math.abs(facts.ttmCapex.value) : null,
    facts.ttmRevenue.value
  );

  // 12. SBC as % of revenue: TTM SBC / TTM Revenue
  const sbcAsPercentOfRevenue = safeDiv(
    facts.ttmSBC.value,
    facts.ttmRevenue.value
  );

  // 13. Cycle state
  const { state: cycleState, confidence: cycleConfidence } =
    detectCycleState(facts);

  // 14. Normalized metrics
  const {
    normalizedRevenue,
    normalizedOperatingMargin,
    normalizedFCF,
  } = computeNormalized(facts, cycleState, framework);

  return {
    revenueGrowth,
    marginTrends,
    cashConversionRatio,
    roe,
    roic,
    debtToEquity,
    debtToEbitda,
    interestCoverage,
    dividendPayoutRatio,
    buybackYield,
    capexIntensity,
    sbcAsPercentOfRevenue,
    cycleState,
    cycleConfidence,
    normalizedRevenue,
    normalizedOperatingMargin,
    normalizedFCF,
  };
}
