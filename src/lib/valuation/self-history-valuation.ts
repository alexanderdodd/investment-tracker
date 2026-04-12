/**
 * Self-history valuation module.
 *
 * Compares current multiples and profitability to the company's own
 * prior cycle ranges to derive a historically-anchored fair value.
 *
 * See: .claude/features/stock-valuation-verdict-spec/04-mu-valuation-workflow.md
 */

import type { CanonicalFacts, FinancialModelOutputs, MultiplesOutputs } from "./types";

export interface SelfHistoryResult {
  method: "self_history";
  /** Implied per-share value from historical margin normalization */
  impliedPerShare: number | null;
  /** Range from historical multiples */
  historicalRange: {
    low: number;
    mid: number;
    high: number;
  } | null;
  /** Details */
  details: {
    medianGrossMargin: number;
    medianOperatingMargin: number;
    currentGrossMargin: number | null;
    currentOperatingMargin: number | null;
    cyclePosition: string;
    yearsOfHistory: number;
  };
  confidence: number;
}

/**
 * Derive a fair value range from the company's own cycle history.
 *
 * Logic:
 * 1. Compute median historical margins as "normal" profitability
 * 2. Apply normalized margins to current revenue to get "normalized" earnings
 * 3. Apply a mid-cycle P/E to get implied per-share value
 * 4. Use the spread of historical margins to compute a range
 */
export function computeSelfHistoryValuation(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  multiples: MultiplesOutputs
): SelfHistoryResult {
  const history = facts.annualHistory;
  const grossMargins = history.map(h => h.grossMargin).filter((m): m is number => m !== null);
  const opMargins = history.map(h => h.operatingMargin).filter((m): m is number => m !== null);

  if (grossMargins.length < 3 || opMargins.length < 3) {
    return {
      method: "self_history",
      impliedPerShare: null,
      historicalRange: null,
      details: {
        medianGrossMargin: 0,
        medianOperatingMargin: 0,
        currentGrossMargin: facts.latestQuarterGrossMargin.value,
        currentOperatingMargin: facts.latestQuarterOperatingMargin.value,
        cyclePosition: model.cycleState,
        yearsOfHistory: history.length,
      },
      confidence: 0,
    };
  }

  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const median = (arr: number[]) => {
    const s = sorted(arr);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };

  const medianGM = median(grossMargins);
  const medianOM = median(opMargins);
  const sortedGM = sorted(grossMargins);
  const sortedOM = sorted(opMargins);

  // P25 and P75 for range
  const p25 = (arr: number[]) => arr[Math.floor(arr.length * 0.25)];
  const p75 = (arr: number[]) => arr[Math.floor(arr.length * 0.75)];

  const revenue = facts.ttmRevenue.value;
  const shares = facts.sharesOutstanding.value;
  const totalDebt = facts.totalDebt.value ?? 0;
  const totalCash = facts.totalCashAndInvestments.value ?? 0;

  if (!revenue || !shares || shares === 0) {
    return {
      method: "self_history",
      impliedPerShare: null,
      historicalRange: null,
      details: {
        medianGrossMargin: medianGM,
        medianOperatingMargin: medianOM,
        currentGrossMargin: facts.latestQuarterGrossMargin.value,
        currentOperatingMargin: facts.latestQuarterOperatingMargin.value,
        cyclePosition: model.cycleState,
        yearsOfHistory: history.length,
      },
      confidence: 0,
    };
  }

  // Normalize current revenue by median margins to get "mid-cycle" earnings
  const midCycleOI = revenue * medianOM;
  const lowCycleOI = revenue * p25(sortedOM);
  const highCycleOI = revenue * p75(sortedOM);

  // Apply a mid-cycle EV/EBIT multiple
  // For cyclical semiconductors, mid-cycle EV/EBIT is typically 12-18x
  const midCycleEvEbit = 15;
  const lowEvEbit = 12;
  const highEvEbit = 18;

  const toPerShare = (oi: number, multiple: number) => {
    const impliedEV = oi * multiple;
    const equity = impliedEV - totalDebt + totalCash;
    return equity / shares;
  };

  const midValue = toPerShare(midCycleOI, midCycleEvEbit);
  const lowValue = toPerShare(lowCycleOI, lowEvEbit);
  const highValue = toPerShare(highCycleOI, highEvEbit);

  // Confidence based on history depth and cycle state clarity
  let confidence = 0.7;
  if (history.length >= 5) confidence += 0.1;
  if (history.length >= 7) confidence += 0.05;
  // Penalize if at extreme cycle position (less trust in mid-cycle normalization)
  if (model.cycleState === "peak" || model.cycleState === "trough") confidence -= 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    method: "self_history",
    impliedPerShare: midValue > 0 ? midValue : null,
    historicalRange: midValue > 0 ? { low: Math.max(0, lowValue), mid: midValue, high: highValue } : null,
    details: {
      medianGrossMargin: medianGM,
      medianOperatingMargin: medianOM,
      currentGrossMargin: facts.latestQuarterGrossMargin.value,
      currentOperatingMargin: facts.latestQuarterOperatingMargin.value,
      cyclePosition: model.cycleState,
      yearsOfHistory: history.length,
    },
    confidence,
  };
}
