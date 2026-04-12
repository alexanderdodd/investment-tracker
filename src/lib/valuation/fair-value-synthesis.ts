/**
 * Fair value synthesis module.
 *
 * Combines outputs from multiple valuation methods into a single fair value
 * range (low / mid / high) with a valuation label (CHEAP / FAIR / EXPENSIVE).
 *
 * See: .claude/features/stock-valuation-verdict-spec/06-fair-value-synthesis-and-labeling.md
 */

import type { DcfOutputs, ReverseDcfOutputs, ValuationOutputs } from "./types";
import type { RelativeValuationResult } from "./peer-registry";
import type { SelfHistoryResult } from "./self-history-valuation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValuationLabel = "CHEAP" | "FAIR" | "EXPENSIVE" | "DEEP_CHEAP" | "DEEP_EXPENSIVE" | "WITHHELD";

export interface MethodContribution {
  method: string;
  perShareValue: number | null;
  weight: number;
  confidence: number;
  /** Effective weight after reweighting (weight × confidence, renormalized) */
  effectiveWeight: number;
}

export type ConfidenceRating = "HIGH" | "MEDIUM" | "LOW";

export interface FairValueSynthesis {
  /** Fair value range */
  range: {
    low: number;
    mid: number;
    high: number;
    currency: string;
  };
  /** Width as fraction of midpoint: (high - low) / mid */
  rangeWidth: number;
  /** CHEAP / FAIR / EXPENSIVE / WITHHELD */
  label: ValuationLabel;
  /** Current price used for label derivation */
  currentPrice: number;
  /** Price vs midpoint: (price - mid) / mid */
  priceVsMid: number;
  /** Individual method contributions */
  methods: MethodContribution[];
  /** Maximum disagreement between primary methods as fraction */
  primaryMethodDisagreement: number;
  /** Overall valuation confidence (0-1) */
  valuationConfidence: number;
  /** Confidence rating: HIGH (≥0.70), MEDIUM (0.50-0.69), LOW (<0.50) */
  confidenceRating: ConfidenceRating;
  /** Human-readable reasons for the confidence rating */
  confidenceReasons: string[];
  /** Pass/fail checklist for confidence factors */
  confidenceChecklist: { label: string; passed: boolean; detail: string }[];
  /** Key assumptions */
  keyAssumptions: string[];
  /** Why this label was assigned */
  valuationReasons: string[];
}

export interface ValueGateDecision {
  /** Whether fair value can be published */
  valuePublishable: boolean;
  /** Status for the output contract */
  status: "PUBLISH_FACTS_PLUS_VALUE" | "PUBLISH_FACTS_ONLY";
  /** Reasons for withholding, if applicable */
  withholdReasons: string[];
}

// ---------------------------------------------------------------------------
// Default weights per spec
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS = {
  normalized_dcf: 0.55,
  reverse_dcf: 0, // Excluded from midpoint — circular (derives from market price). Kept as diagnostic.
  relative_valuation: 0.30,
  self_history: 0.15,
};

// ---------------------------------------------------------------------------
// Confidence penalty model per spec (09-validation-framework)
// ---------------------------------------------------------------------------

function computeValuationConfidence(
  methods: MethodContribution[],
  rangeWidth: number,
  primaryDisagreement: number,
  peerQuality: "strong" | "medium" | "weak",
  cycleMarginRatio: number,
  historyDepth: number
): { score: number; rating: ConfidenceRating; reasons: string[]; checklist: { label: string; passed: boolean; detail: string }[] } {
  let confidence = 1.0;
  const reasons: string[] = [];
  const checklist: { label: string; passed: boolean; detail: string }[] = [];

  // Peer set quality
  if (peerQuality === "strong") {
    checklist.push({ label: "Peer comparables", passed: true, detail: "Strong peer set with good data quality" });
  } else if (peerQuality === "medium") {
    confidence -= 0.15;
    reasons.push("Peer set quality is medium — few clean pure-play peers, curated snapshots rather than live pipeline data, conglomerate adjustments required");
    checklist.push({ label: "Peer comparables", passed: false, detail: "Limited peer data — few clean comparables or only curated snapshots" });
  } else {
    confidence -= 0.25;
    reasons.push("Peer set quality is weak — limited comparable companies with significant data limitations");
    checklist.push({ label: "Peer comparables", passed: false, detail: "Weak peer set — no comparable companies with usable multiples" });
  }

  // Cycle divergence (current margins vs historical)
  if (cycleMarginRatio > 2.5) {
    confidence -= 0.20;
    reasons.push(`Current margins are ${cycleMarginRatio.toFixed(1)}x the historical average — extreme cycle peak increases valuation uncertainty`);
    checklist.push({ label: "Cycle position", passed: false, detail: `Margins ${cycleMarginRatio.toFixed(1)}x above historical average — extreme peak` });
  } else if (cycleMarginRatio > 1.5) {
    confidence -= 0.10;
    reasons.push(`Current margins are ${cycleMarginRatio.toFixed(1)}x the historical average — above-cycle performance may not be sustainable`);
    checklist.push({ label: "Cycle position", passed: false, detail: `Margins ${cycleMarginRatio.toFixed(1)}x above average — above-cycle` });
  } else {
    checklist.push({ label: "Cycle position", passed: true, detail: "Margins near or below historical average" });
  }

  // Range width
  if (rangeWidth > 0.30) {
    confidence -= 0.15;
    reasons.push(`Fair value range is wide (${(rangeWidth * 100).toFixed(0)}% of midpoint) — methods produce divergent estimates`);
    checklist.push({ label: "Range width", passed: false, detail: `${(rangeWidth * 100).toFixed(0)}% of midpoint (target: <30%)` });
  } else if (rangeWidth > 0.20) {
    confidence -= 0.05;
    checklist.push({ label: "Range width", passed: true, detail: `${(rangeWidth * 100).toFixed(0)}% — moderate spread` });
  } else {
    checklist.push({ label: "Range width", passed: true, detail: `${(rangeWidth * 100).toFixed(0)}% — tight range` });
  }

  // Contributing method disagreement
  if (primaryDisagreement > 0.20) {
    confidence -= 0.15;
    reasons.push(`Contributing valuation methods disagree by ${(primaryDisagreement * 100).toFixed(0)}% — normalized economics, peer comparisons, and historical analysis produce different estimates`);
    checklist.push({ label: "Method agreement", passed: false, detail: `${(primaryDisagreement * 100).toFixed(0)}% disagreement (target: <20%)` });
  } else if (primaryDisagreement > 0.10) {
    confidence -= 0.05;
    checklist.push({ label: "Method agreement", passed: true, detail: `${(primaryDisagreement * 100).toFixed(0)}% — moderate agreement` });
  } else {
    checklist.push({ label: "Method agreement", passed: true, detail: `${(primaryDisagreement * 100).toFixed(0)}% — strong agreement` });
  }

  // History depth
  if (historyDepth <= 5) {
    confidence -= 0.10;
    reasons.push(`Only ${historyDepth} years of history available — minimum for cyclical normalization`);
    checklist.push({ label: "History depth", passed: false, detail: `${historyDepth} years (target: >5 for cycle analysis)` });
  } else {
    checklist.push({ label: "History depth", passed: true, detail: `${historyDepth} years of data` });
  }

  // Methods with null values reduce confidence
  const methodLabels: Record<string, string> = {
    normalized_dcf: "DCF valuation",
    reverse_dcf: "Reverse DCF",
    relative_valuation: "Peer comparison",
    self_history: "Self-history",
  };
  const methodExplanations: Record<string, string> = {
    normalized_dcf: "Negative or missing free cash flow data",
    reverse_dcf: "Missing enterprise value or operating data",
    relative_valuation: "No peers with comparable multiples (P/E or P/B)",
    self_history: "Requires 3+ years of margin data (unavailable for this accounting framework)",
  };
  for (const m of methods) {
    if (m.weight === 0) continue; // skip diagnostic-only methods like reverse DCF
    const label = methodLabels[m.method] ?? m.method;
    if (m.perShareValue === null) {
      confidence -= 0.10;
      reasons.push(`${label} could not run: ${methodExplanations[m.method] ?? "unknown reason"}`);
      checklist.push({ label, passed: false, detail: methodExplanations[m.method] ?? "Could not produce a result" });
    } else {
      checklist.push({ label, passed: true, detail: `$${m.perShareValue.toFixed(0)}/share (${(m.effectiveWeight * 100).toFixed(0)}% weight)` });
    }
  }

  const score = Math.max(0, Math.min(1, confidence));
  const rating: ConfidenceRating = score >= 0.70 ? "HIGH" : score >= 0.50 ? "MEDIUM" : "LOW";

  if (reasons.length === 0) {
    reasons.push("All valuation inputs are strong — high confidence in fair value estimate");
  }

  return { score, rating, reasons, checklist };
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

export function synthesizeFairValue(opts: {
  dcf: DcfOutputs | null;
  reverseDcf: ReverseDcfOutputs | null;
  relativeValuation: RelativeValuationResult | null;
  selfHistory: SelfHistoryResult | null;
  currentPrice: number;
  cycleMarginRatio: number;
  historyDepth: number;
}): FairValueSynthesis {
  const { dcf, reverseDcf, relativeValuation, selfHistory, currentPrice, cycleMarginRatio, historyDepth } = opts;

  // Build method contributions
  const methods: MethodContribution[] = [];

  // 1. Normalized FCFF DCF
  const dcfValue = dcf?.perShareValue ?? null;
  const dcfConfidence = dcf ? (dcf.normalized ? 0.80 : 0.70) : 0;
  methods.push({
    method: "normalized_dcf",
    perShareValue: dcfValue,
    weight: DEFAULT_WEIGHTS.normalized_dcf,
    confidence: dcfConfidence,
    effectiveWeight: 0, // computed below
  });

  // 2. Reverse DCF
  // Reverse DCF gives implied margin, not a per-share value directly.
  // We use it as a sanity check and derive an implied fair value:
  // If implied FCF margin is much higher than historical, it means the market
  // is pricing in optimistic assumptions → current price may be expensive.
  let reverseDcfValue: number | null = null;
  if (reverseDcf?.impliedOperatingMargin !== null && reverseDcf) {
    // The reverse DCF implies what the market expects. If the implied margin
    // is reasonable vs history, the current price IS the implied fair value.
    // If it's extreme, we adjust.
    const impliedMargin = reverseDcf.impliedOperatingMargin;
    // Use the current price as the base, adjusted by how extreme the implied margin is
    reverseDcfValue = currentPrice; // starts at current price
    if (impliedMargin > 0.30) {
      // Market implies very high margins — likely overpriced
      reverseDcfValue = currentPrice * 0.85;
    } else if (impliedMargin < 0.05) {
      // Market implies very low margins — may be underpriced
      reverseDcfValue = currentPrice * 1.15;
    }
  }
  methods.push({
    method: "reverse_dcf",
    perShareValue: reverseDcfValue,
    weight: DEFAULT_WEIGHTS.reverse_dcf,
    confidence: reverseDcf ? 0.65 : 0,
    effectiveWeight: 0,
  });

  // 3. Relative valuation
  const relValue = relativeValuation?.weightedPerShare ?? null;
  const relConfidence = relativeValuation?.confidence ?? 0;
  methods.push({
    method: "relative_valuation",
    perShareValue: relValue,
    weight: DEFAULT_WEIGHTS.relative_valuation,
    confidence: relConfidence,
    effectiveWeight: 0,
  });

  // 4. Self-history
  const selfValue = selfHistory?.impliedPerShare ?? null;
  const selfConfidence = selfHistory?.confidence ?? 0;
  methods.push({
    method: "self_history",
    perShareValue: selfValue,
    weight: DEFAULT_WEIGHTS.self_history,
    confidence: selfConfidence,
    effectiveWeight: 0,
  });

  // Compute effective weights (weight × confidence, renormalized)
  const validMethods = methods.filter(m => m.perShareValue !== null && m.perShareValue > 0 && m.confidence > 0);
  const totalRawWeight = validMethods.reduce((s, m) => s + m.weight * m.confidence, 0);

  for (const m of methods) {
    if (m.perShareValue !== null && m.perShareValue > 0 && m.confidence > 0 && totalRawWeight > 0) {
      m.effectiveWeight = (m.weight * m.confidence) / totalRawWeight;
    }
  }

  // Compute weighted mid value
  let mid = 0;
  for (const m of validMethods) {
    mid += m.perShareValue! * m.effectiveWeight;
  }

  // Compute range from contributing method spread + DCF sensitivity
  const contributingValues = validMethods.filter(m => m.weight > 0).map(m => m.perShareValue!);
  const minMethod = contributingValues.length > 0 ? Math.min(...contributingValues) : mid;
  const maxMethod = contributingValues.length > 0 ? Math.max(...contributingValues) : mid;

  // Use DCF sensitivity grid for additional range info
  let dcfLow = dcfValue ?? mid;
  let dcfHigh = dcfValue ?? mid;
  if (dcf?.sensitivityGrid && dcf.sensitivityGrid.length > 0) {
    const gridValues = dcf.sensitivityGrid.map(s => s.perShareValue);
    dcfLow = Math.min(...gridValues);
    dcfHigh = Math.max(...gridValues);
  }

  // Self-history range
  const selfLow = selfHistory?.historicalRange?.low ?? mid;
  const selfHigh = selfHistory?.historicalRange?.high ?? mid;

  // Blend ranges
  const low = Math.max(0, Math.min(minMethod, dcfLow, selfLow) * 0.95);
  const high = Math.max(maxMethod, dcfHigh, selfHigh) * 1.05;
  const rangeWidth = mid > 0 ? (high - low) / mid : 999;

  // Method disagreement — compare contributing methods (those with weight > 0)
  const contributingMethods = validMethods.filter(m => m.weight > 0 && m.perShareValue !== null);
  let primaryDisagreement = 0;
  if (contributingMethods.length >= 2) {
    const vals = contributingMethods.map(m => m.perShareValue!);
    const maxVal = Math.max(...vals);
    const minVal = Math.min(...vals);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    primaryDisagreement = avg > 0 ? (maxVal - minVal) / avg : 0;
  }

  // Peer quality assessment
  const peerQuality: "strong" | "medium" | "weak" = relativeValuation
    ? (relativeValuation.confidence >= 0.7 ? "strong" : relativeValuation.confidence >= 0.4 ? "medium" : "weak")
    : "weak";

  // Overall confidence with rating and explanations
  const confidenceResult = computeValuationConfidence(
    methods, rangeWidth, primaryDisagreement, peerQuality, cycleMarginRatio, historyDepth
  );
  const valuationConfidence = confidenceResult.score;

  // Derive label
  let label: ValuationLabel = "FAIR";
  const priceVsMid = mid > 0 ? (currentPrice - mid) / mid : 0;

  if (currentPrice < low) {
    label = "CHEAP";
    if (currentPrice < low * 0.85) label = "DEEP_CHEAP";
  } else if (currentPrice > high) {
    label = "EXPENSIVE";
    if (currentPrice > high * 1.15) label = "DEEP_EXPENSIVE";
  }

  // LABEL-001: De-intensify DEEP labels when confidence is very low
  if (valuationConfidence < 0.35) {
    if (label === "DEEP_CHEAP") label = "CHEAP";
    if (label === "DEEP_EXPENSIVE") label = "EXPENSIVE";
  }

  // Build reasons
  const valuationReasons: string[] = [];
  if (label === "CHEAP" || label === "DEEP_CHEAP") {
    valuationReasons.push(`Price ($${currentPrice.toFixed(2)}) is below fair value range low ($${low.toFixed(2)})`);
  } else if (label === "EXPENSIVE" || label === "DEEP_EXPENSIVE") {
    valuationReasons.push(`Price ($${currentPrice.toFixed(2)}) is above fair value range high ($${high.toFixed(2)})`);
  } else {
    valuationReasons.push(`Price ($${currentPrice.toFixed(2)}) is within fair value range ($${low.toFixed(2)} - $${high.toFixed(2)})`);
  }

  const keyAssumptions: string[] = [];
  if (dcf) {
    keyAssumptions.push(`DCF uses ${dcf.normalized ? "normalized" : "reported"} FCF of $${(dcf.baseYearFCF / 1e9).toFixed(2)}B, WACC ${(dcf.wacc * 100).toFixed(1)}%`);
  }
  if (relativeValuation) {
    keyAssumptions.push(`Relative valuation from ${relativeValuation.perShareValues.length} peer data points`);
  }
  if (selfHistory) {
    keyAssumptions.push(`Self-history uses ${selfHistory.details.yearsOfHistory}Y median margins (GM ${(selfHistory.details.medianGrossMargin * 100).toFixed(1)}%, OM ${(selfHistory.details.medianOperatingMargin * 100).toFixed(1)}%)`);
  }

  return {
    range: { low, mid, high, currency: "USD" },
    rangeWidth,
    label,
    currentPrice,
    priceVsMid,
    methods,
    primaryMethodDisagreement: primaryDisagreement,
    valuationConfidence,
    confidenceRating: confidenceResult.rating,
    confidenceReasons: confidenceResult.reasons,
    confidenceChecklist: confidenceResult.checklist,
    keyAssumptions,
    valuationReasons,
  };
}

// ---------------------------------------------------------------------------
// Value gate
// ---------------------------------------------------------------------------

export function evaluateValueGate(synthesis: FairValueSynthesis): ValueGateDecision {
  const reasons: string[] = [];

  // Hard block: must have at least 1 valid method
  const validMethods = synthesis.methods.filter(m => m.perShareValue !== null && m.effectiveWeight > 0);
  if (validMethods.length < 1) {
    reasons.push("No valid valuation methods produced a result");
  }

  // Hard block: mid value must be positive
  if (synthesis.range.mid <= 0) {
    reasons.push("Fair value midpoint is non-positive");
  }

  // Everything else is a confidence concern, not a hard block.
  // The system always publishes value when methods produce results,
  // but with explicit LOW/MEDIUM/HIGH confidence rating and explanations.

  return {
    valuePublishable: reasons.length === 0,
    status: reasons.length === 0 ? "PUBLISH_FACTS_PLUS_VALUE" : "PUBLISH_FACTS_ONLY",
    withholdReasons: reasons,
  };
}
