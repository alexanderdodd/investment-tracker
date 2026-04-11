/**
 * Deterministic valuation engine.
 * Computes DCF, multiples, reverse DCF, and scenarios entirely in code — no LLM calls.
 */

import type {
  CanonicalFacts,
  FinancialModelOutputs,
  IndustryFramework,
  DcfOutputs,
  MultiplesOutputs,
  ReverseDcfOutputs,
  ValuationOutputs,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely extract numeric value from a ProvenancedValue, returning fallback on null. */
function val(pv: { value: number | null }, fallback: number = 0): number {
  return pv.value ?? fallback;
}

/** Clamp a number between min and max. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ---------------------------------------------------------------------------
// 1. WACC
// ---------------------------------------------------------------------------

export function computeWacc(
  facts: CanonicalFacts
): DcfOutputs["waccDerivation"] {
  const riskFreeRate = 0.043;
  const equityRiskPremium = 0.055;
  const beta = facts.beta.value ?? 1.0;
  const costOfEquity = riskFreeRate + beta * equityRiskPremium;
  const costOfDebt = 0.05;
  const taxRate = 0.21;

  const marketCap = val(facts.marketCap);
  const totalDebt = val(facts.totalDebt);
  const totalCapital = marketCap + totalDebt;

  const debtWeight = totalCapital > 0 ? totalDebt / totalCapital : 0;
  const equityWeight = 1 - debtWeight;

  return {
    riskFreeRate,
    equityRiskPremium,
    beta,
    costOfEquity,
    costOfDebt,
    taxRate,
    debtWeight,
    equityWeight,
  };
}

function waccFromDerivation(d: DcfOutputs["waccDerivation"]): number {
  return (
    d.equityWeight * d.costOfEquity +
    d.debtWeight * d.costOfDebt * (1 - d.taxRate)
  );
}

// ---------------------------------------------------------------------------
// 2. DCF
// ---------------------------------------------------------------------------

/** Build tapering growth rates starting from an initial rate. */
function buildGrowthRates(
  initialRate: number,
  terminalGrowth: number,
  years: number
): number[] {
  const rates: number[] = [];
  const taperPerYear = (initialRate - terminalGrowth) / years;
  for (let i = 0; i < years; i++) {
    const rate = initialRate - taperPerYear * i;
    rates.push(Math.max(rate, terminalGrowth));
  }
  return rates;
}

/** Compute a full DCF given explicit parameters (used for scenarios too). */
function runDcfProjection(
  baseYearFCF: number,
  growthRates: number[],
  wacc: number,
  terminalGrowth: number,
  totalCash: number,
  totalDebt: number,
  sharesOutstanding: number,
  normalized: boolean
): DcfOutputs | null {
  if (baseYearFCF <= 0 || wacc <= terminalGrowth || sharesOutstanding <= 0) {
    return null;
  }

  const projectedFCF: DcfOutputs["projectedFCF"] = [];
  let fcf = baseYearFCF;
  let sumPV = 0;

  for (let i = 0; i < growthRates.length; i++) {
    fcf = fcf * (1 + growthRates[i]);
    const pv = fcf / Math.pow(1 + wacc, i + 1);
    projectedFCF.push({ year: i + 1, fcf, pv });
    sumPV += pv;
  }

  const lastFCF = projectedFCF[projectedFCF.length - 1].fcf;
  const terminalValue =
    (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const pvTerminal =
    terminalValue / Math.pow(1 + wacc, growthRates.length);

  const enterpriseValue = sumPV + pvTerminal;
  const equityValue = enterpriseValue + totalCash - totalDebt;
  const perShareValue = equityValue / sharesOutstanding;

  // Sensitivity grid: WACC ± 1% in 0.5% steps × terminal growth ± 0.5% in 0.5% steps
  const sensitivityGrid: DcfOutputs["sensitivityGrid"] = [];
  const waccSteps = [-0.01, -0.005, 0, 0.005, 0.01];
  const tgSteps = [-0.005, 0, 0.005];

  for (const wDelta of waccSteps) {
    for (const tgDelta of tgSteps) {
      const sWacc = wacc + wDelta;
      const sTg = terminalGrowth + tgDelta;
      if (sWacc <= sTg || sWacc <= 0) continue;

      let sFcf = baseYearFCF;
      let sSumPV = 0;
      for (let i = 0; i < growthRates.length; i++) {
        sFcf = sFcf * (1 + growthRates[i]);
        sSumPV += sFcf / Math.pow(1 + sWacc, i + 1);
      }
      const sTV = (sFcf * (1 + sTg)) / (sWacc - sTg);
      const sPvTV = sTV / Math.pow(1 + sWacc, growthRates.length);
      const sEV = sSumPV + sPvTV;
      const sEqV = sEV + totalCash - totalDebt;
      sensitivityGrid.push({
        wacc: sWacc,
        terminalGrowth: sTg,
        perShareValue: sEqV / sharesOutstanding,
      });
    }
  }

  return {
    baseYearFCF,
    normalized,
    growthRates,
    projectedFCF,
    terminalGrowth,
    terminalValue,
    pvTerminal,
    wacc,
    waccDerivation: null as unknown as DcfOutputs["waccDerivation"], // filled by caller
    enterpriseValue,
    equityValue,
    perShareValue,
    sensitivityGrid,
  };
}

export function computeDcf(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  framework: IndustryFramework
): DcfOutputs | null {
  const waccDeriv = computeWacc(facts);
  const wacc = waccFromDerivation(waccDeriv);

  // Determine base FCF — try multiple approaches before giving up
  let baseYearFCF: number | null = null;
  let normalized = false;

  // Approach 1: For cyclical companies at peak/above_mid, use normalized FCF
  if (
    framework.cycleRelevant &&
    (model.cycleState === "peak" || model.cycleState === "above_mid") &&
    model.normalizedFCF !== null &&
    model.normalizedFCF > 0
  ) {
    baseYearFCF = model.normalizedFCF;
    normalized = true;
  }

  // Approach 2: Use reported TTM FCF if positive
  if (baseYearFCF === null && facts.ttmFCF.value !== null && facts.ttmFCF.value > 0) {
    baseYearFCF = facts.ttmFCF.value;
  }

  // Approach 3: If reported FCF is negative (e.g., heavy growth capex),
  // try normalized FCF even if not at cycle peak
  if (baseYearFCF === null && model.normalizedFCF !== null && model.normalizedFCF > 0) {
    baseYearFCF = model.normalizedFCF;
    normalized = true;
  }

  // Approach 4: Estimate from operating income (NOPAT + D&A - maintenance capex)
  if (baseYearFCF === null && facts.ttmOperatingIncome.value !== null && facts.ttmOperatingIncome.value > 0) {
    const da = facts.ttmDA.value ?? 0;
    const nopat = facts.ttmOperatingIncome.value * (1 - 0.21);
    // Estimate maintenance capex as 1.2x D&A
    const maintenanceCapex = da * 1.2;
    const estimatedFCF = nopat + da - maintenanceCapex;
    if (estimatedFCF > 0) {
      baseYearFCF = estimatedFCF;
      normalized = true;
    }
  }

  if (baseYearFCF === null || baseYearFCF <= 0) {
    return null;
  }

  // Determine initial growth rate from recent revenue growth
  const recentGrowth =
    model.revenueGrowth.length > 0
      ? model.revenueGrowth[model.revenueGrowth.length - 1].value
      : 0.05;
  const initialGrowth = Math.min(0.15, Math.max(0, recentGrowth));

  const terminalGrowth = 0.025;
  const growthRates = buildGrowthRates(initialGrowth, terminalGrowth, 5);

  const totalCash = val(facts.totalCashAndInvestments);
  const totalDebt = val(facts.totalDebt);
  const shares = val(facts.sharesOutstanding, 1);

  const result = runDcfProjection(
    baseYearFCF,
    growthRates,
    wacc,
    terminalGrowth,
    totalCash,
    totalDebt,
    shares,
    normalized
  );

  if (!result) return null;

  result.waccDerivation = waccDeriv;
  return result;
}

// ---------------------------------------------------------------------------
// 3. Multiples
// ---------------------------------------------------------------------------

export function computeMultiples(
  facts: CanonicalFacts,
  _model: FinancialModelOutputs
): MultiplesOutputs {
  const pe = facts.trailingPE.value;
  const pb = facts.priceToBook.value;
  const evRevenue = facts.evToRevenue.value;

  // EV / EBITDA
  const operatingIncome = facts.ttmOperatingIncome.value;
  const da = facts.ttmDA.value;
  const ev = facts.enterpriseValue.value;
  let evEbitda: number | null = null;
  if (ev !== null && operatingIncome !== null && da !== null) {
    const ebitda = operatingIncome + da;
    evEbitda = ebitda > 0 ? ev / ebitda : null;
  }

  // EV / FCF
  const fcf = facts.ttmFCF.value;
  let evFcf: number | null = null;
  if (ev !== null && fcf !== null && fcf > 0) {
    evFcf = ev / fcf;
  }

  // Historical range from annualHistory (P/E across years if EPS data is available)
  const historicalRange: MultiplesOutputs["historicalRange"] = [];

  // Build historical operating margin range if we have enough data
  const opMargins = facts.annualHistory
    .map((y) => y.operatingMargin)
    .filter((m): m is number => m !== null);

  if (opMargins.length >= 3) {
    const sorted = [...opMargins].sort((a, b) => a - b);
    const currentOpMargin = facts.latestQuarterOperatingMargin.value;
    historicalRange.push({
      metric: "Operating Margin",
      low: sorted[0],
      median: sorted[Math.floor(sorted.length / 2)],
      high: sorted[sorted.length - 1],
      current: currentOpMargin ?? opMargins[opMargins.length - 1],
    });
  }

  // Build historical gross margin range
  const grossMargins = facts.annualHistory
    .map((y) => y.grossMargin)
    .filter((m): m is number => m !== null);

  if (grossMargins.length >= 3) {
    const sorted = [...grossMargins].sort((a, b) => a - b);
    const currentGrossMargin = facts.latestQuarterGrossMargin.value;
    historicalRange.push({
      metric: "Gross Margin",
      low: sorted[0],
      median: sorted[Math.floor(sorted.length / 2)],
      high: sorted[sorted.length - 1],
      current: currentGrossMargin ?? grossMargins[grossMargins.length - 1],
    });
  }

  return {
    current: {
      pe,
      pb,
      evEbitda,
      evRevenue,
      evFcf,
    },
    historicalRange,
  };
}

// ---------------------------------------------------------------------------
// 4. Reverse DCF
// ---------------------------------------------------------------------------

export function computeReverseDcf(
  facts: CanonicalFacts,
  waccDeriv: DcfOutputs["waccDerivation"]
): ReverseDcfOutputs | null {
  const ev = facts.enterpriseValue.value;
  const revenue = facts.ttmRevenue.value;
  const wacc = waccFromDerivation(waccDeriv);
  const terminalGrowth = 0.025;

  if (ev === null || ev <= 0 || wacc <= terminalGrowth) {
    return null;
  }

  // Simplified perpetuity: EV = FCF / (wacc - g)
  // => impliedFCF = EV * (wacc - g)
  const impliedFCF = ev * (wacc - terminalGrowth);

  if (revenue === null || revenue <= 0) {
    return {
      impliedRevenueGrowth: null,
      impliedOperatingMargin: impliedFCF > 0 ? null : null,
      interpretation:
        "Insufficient revenue data to compute implied margin from reverse DCF.",
    };
  }

  const impliedMargin = impliedFCF / revenue;
  const currentFCF = facts.ttmFCF.value;
  const currentMargin =
    currentFCF !== null && revenue > 0 ? currentFCF / revenue : null;
  const fiveYearAvgOpMargin = facts.fiveYearAvgOperatingMargin.value;

  const pctFmt = (n: number) => (n * 100).toFixed(1) + "%";

  let interpretation = `Market implies ${pctFmt(impliedMargin)} FCF margin`;
  if (currentMargin !== null) {
    interpretation += `, vs current ${pctFmt(currentMargin)}`;
  }
  if (fiveYearAvgOpMargin !== null) {
    interpretation += ` and 5Y avg operating margin ${pctFmt(fiveYearAvgOpMargin)}`;
  }
  interpretation += ".";

  return {
    impliedRevenueGrowth: null, // would need multi-year solve; omitted for now
    impliedOperatingMargin: impliedMargin,
    interpretation,
  };
}

// ---------------------------------------------------------------------------
// 5. Scenarios
// ---------------------------------------------------------------------------

function computeScenarios(
  dcf: DcfOutputs,
  facts: CanonicalFacts,
  _model: FinancialModelOutputs
): ValuationOutputs["scenarios"] {
  const totalCash = val(facts.totalCashAndInvestments);
  const totalDebt = val(facts.totalDebt);
  const shares = val(facts.sharesOutstanding, 1);

  // Bull: WACC - 1%, terminal growth + 0.5%, growth rates + 2pp
  const bullGrowth = dcf.growthRates.map((r) => r + 0.02);
  const bullResult = runDcfProjection(
    dcf.baseYearFCF,
    bullGrowth,
    dcf.wacc - 0.01,
    dcf.terminalGrowth + 0.005,
    totalCash,
    totalDebt,
    shares,
    dcf.normalized
  );

  // Bear: WACC + 1.5%, terminal growth - 0.5%, growth rates - 3pp (floored at 0%)
  const bearGrowth = dcf.growthRates.map((r) => Math.max(0, r - 0.03));
  const bearResult = runDcfProjection(
    dcf.baseYearFCF,
    bearGrowth,
    dcf.wacc + 0.015,
    dcf.terminalGrowth - 0.005,
    totalCash,
    totalDebt,
    shares,
    dcf.normalized
  );

  if (!bullResult || !bearResult) {
    return null;
  }

  return {
    bull: {
      perShareValue: bullResult.perShareValue,
      assumptions: `WACC ${((dcf.wacc - 0.01) * 100).toFixed(1)}%, terminal growth ${((dcf.terminalGrowth + 0.005) * 100).toFixed(1)}%, growth rates +2pp`,
    },
    base: {
      perShareValue: dcf.perShareValue,
      assumptions: `WACC ${(dcf.wacc * 100).toFixed(1)}%, terminal growth ${(dcf.terminalGrowth * 100).toFixed(1)}%`,
    },
    bear: {
      perShareValue: bearResult.perShareValue,
      assumptions: `WACC ${((dcf.wacc + 0.015) * 100).toFixed(1)}%, terminal growth ${((dcf.terminalGrowth - 0.005) * 100).toFixed(1)}%, growth rates -3pp (floored at 0%)`,
    },
  };
}

// ---------------------------------------------------------------------------
// 5b. Multiples-based scenarios (fallback when DCF is unavailable)
// ---------------------------------------------------------------------------

function computeMultiplesBasedScenarios(
  facts: CanonicalFacts,
  multiples: MultiplesOutputs
): ValuationOutputs["scenarios"] {
  const price = val(facts.currentPrice, 0);
  if (price <= 0) return null;

  const pe = multiples.current.pe;
  const pb = multiples.current.pb;
  const bvps = val(facts.bookValuePerShare);

  // Try P/E-based scenarios if we have earnings
  if (pe !== null && pe > 0 && pe < 200) {
    // Assume P/E can range ±30% around current for bull/bear
    const bullPE = pe * 1.3;
    const bearPE = pe * 0.7;
    const eps = facts.ttmDilutedEPS.value;
    if (eps !== null && eps > 0) {
      return {
        bull: {
          perShareValue: Math.round(eps * bullPE * 100) / 100,
          assumptions: `P/E expands to ${bullPE.toFixed(1)}x on improving fundamentals`,
        },
        base: {
          perShareValue: price,
          assumptions: `Current P/E of ${pe.toFixed(1)}x maintained — fairly valued at current multiples`,
        },
        bear: {
          perShareValue: Math.round(eps * bearPE * 100) / 100,
          assumptions: `P/E compresses to ${bearPE.toFixed(1)}x on deteriorating outlook`,
        },
      };
    }
  }

  // Try P/B-based scenarios for companies without positive earnings
  if (pb !== null && pb > 0 && bvps > 0) {
    const bullPB = pb * 1.3;
    const bearPB = Math.max(0.5, pb * 0.6);
    return {
      bull: {
        perShareValue: Math.round(bvps * bullPB * 100) / 100,
        assumptions: `P/B expands to ${bullPB.toFixed(1)}x on improved returns`,
      },
      base: {
        perShareValue: price,
        assumptions: `Current P/B of ${pb.toFixed(1)}x maintained`,
      },
      bear: {
        perShareValue: Math.round(bvps * bearPB * 100) / 100,
        assumptions: `P/B compresses to ${bearPB.toFixed(1)}x on weaker fundamentals`,
      },
    };
  }

  // Last resort: simple ±25% range around current price
  return {
    bull: {
      perShareValue: Math.round(price * 1.25 * 100) / 100,
      assumptions: "25% upside from improving fundamentals and sentiment",
    },
    base: {
      perShareValue: price,
      assumptions: "Current price maintained — insufficient data for intrinsic valuation",
    },
    bear: {
      perShareValue: Math.round(price * 0.75 * 100) / 100,
      assumptions: "25% downside from deteriorating fundamentals or market conditions",
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Main entry point
// ---------------------------------------------------------------------------

export function runValuationEngine(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  framework: IndustryFramework
): ValuationOutputs {
  const dcf = computeDcf(facts, model, framework);
  const multiples = computeMultiples(facts, model);
  const waccDeriv = computeWacc(facts);
  const reverseDcf = computeReverseDcf(facts, waccDeriv);

  // Scenarios: try DCF-based, fall back to multiples-based
  let scenarios: ValuationOutputs["scenarios"] = null;
  if (dcf) {
    scenarios = computeScenarios(dcf, facts, model);
  }
  if (!scenarios) {
    scenarios = computeMultiplesBasedScenarios(facts, multiples);
  }

  const price = val(facts.currentPrice, 0);

  // Intrinsic value range from scenarios
  let intrinsicValueRange: ValuationOutputs["intrinsicValueRange"] = null;
  if (scenarios) {
    intrinsicValueRange = {
      low: scenarios.bear.perShareValue,
      mid: scenarios.base.perShareValue,
      high: scenarios.bull.perShareValue,
    };
  }

  // Verdict
  let verdict: ValuationOutputs["verdict"] = "Fair Value";
  if (intrinsicValueRange && price > 0) {
    const mid = intrinsicValueRange.mid;
    const spread =
      (intrinsicValueRange.high - intrinsicValueRange.low) /
      intrinsicValueRange.mid;

    if (spread > 0.5) {
      verdict = "Highly Uncertain";
    } else if (mid > price * 1.15) {
      verdict = "Undervalued";
    } else if (mid < price * 0.85) {
      verdict = "Overvalued";
    }
  }

  // Confidence score: 0-1
  let confidence = 1.0;

  // Penalize missing fields
  const missingCount = facts.missingFields.length;
  confidence -= clamp(missingCount * 0.05, 0, 0.3);

  // Penalize peak cycle
  if (model.cycleState === "peak" || model.cycleState === "above_mid") {
    confidence -= 0.1;
  }

  // Penalize if DCF couldn't be computed
  if (!dcf) {
    confidence -= 0.2;
  }

  // Penalize wide scenario range
  if (intrinsicValueRange && intrinsicValueRange.mid > 0) {
    const rangeWidth =
      (intrinsicValueRange.high - intrinsicValueRange.low) /
      intrinsicValueRange.mid;
    if (rangeWidth > 0.5) confidence -= 0.15;
    if (rangeWidth > 1.0) confidence -= 0.15;
  }

  // Penalize unknown cycle
  if (model.cycleState === "unknown") {
    confidence -= 0.05;
  }

  confidence = clamp(confidence, 0, 1);

  // Margin of safety
  let marginOfSafety: number | null = null;
  if (dcf && price > 0) {
    marginOfSafety = (dcf.perShareValue - price) / price;
  }

  return {
    dcf,
    multiples,
    reverseDcf,
    scenarios,
    verdict,
    confidenceScore: Math.round(confidence * 100) / 100,
    intrinsicValueRange,
    marginOfSafety:
      marginOfSafety !== null
        ? Math.round(marginOfSafety * 1000) / 1000
        : null,
  };
}
