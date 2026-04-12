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
  normalized_dcf: 0.45,
  reverse_dcf: 0.20,
  relative_valuation: 0.25,
  self_history: 0.10,
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
): number {
  let confidence = 1.0;

  // Peer set quality
  if (peerQuality === "medium") confidence -= 0.15;
  if (peerQuality === "weak") confidence -= 0.25;

  // Cycle divergence (current margins vs historical)
  if (cycleMarginRatio > 2.5) confidence -= 0.20;
  else if (cycleMarginRatio > 1.5) confidence -= 0.10;

  // Range width
  if (rangeWidth > 0.30) confidence -= 0.15;
  else if (rangeWidth > 0.20) confidence -= 0.05;

  // Primary method disagreement
  if (primaryDisagreement > 0.20) confidence -= 0.15;
  else if (primaryDisagreement > 0.10) confidence -= 0.05;

  // History depth
  if (historyDepth <= 5) confidence -= 0.10;

  // Methods with null values reduce confidence
  const nullMethods = methods.filter(m => m.perShareValue === null).length;
  confidence -= nullMethods * 0.10;

  return Math.max(0, Math.min(1, confidence));
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

  // Compute range from method spread + DCF sensitivity
  const values = validMethods.map(m => m.perShareValue!);
  const minMethod = Math.min(...values);
  const maxMethod = Math.max(...values);

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

  // Primary method disagreement
  const primaryMethods = validMethods.filter(m => m.method === "normalized_dcf" || m.method === "reverse_dcf");
  let primaryDisagreement = 0;
  if (primaryMethods.length === 2 && primaryMethods[0].perShareValue && primaryMethods[1].perShareValue) {
    const avg = (primaryMethods[0].perShareValue + primaryMethods[1].perShareValue) / 2;
    primaryDisagreement = avg > 0 ? Math.abs(primaryMethods[0].perShareValue - primaryMethods[1].perShareValue) / avg : 0;
  }

  // Peer quality assessment
  const peerQuality: "strong" | "medium" | "weak" = relativeValuation
    ? (relativeValuation.confidence >= 0.7 ? "strong" : relativeValuation.confidence >= 0.4 ? "medium" : "weak")
    : "weak";

  // Overall confidence
  const valuationConfidence = computeValuationConfidence(
    methods, rangeWidth, primaryDisagreement, peerQuality, cycleMarginRatio, historyDepth
  );

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
    keyAssumptions,
    valuationReasons,
  };
}

// ---------------------------------------------------------------------------
// Value gate
// ---------------------------------------------------------------------------

export function evaluateValueGate(synthesis: FairValueSynthesis): ValueGateDecision {
  const reasons: string[] = [];

  // Range width > 40% → withhold
  if (synthesis.rangeWidth > 0.40) {
    reasons.push(`Range width ${(synthesis.rangeWidth * 100).toFixed(1)}% exceeds 40% threshold`);
  }

  // Primary method disagreement > 25% → withhold
  if (synthesis.primaryMethodDisagreement > 0.25) {
    reasons.push(`Primary method disagreement ${(synthesis.primaryMethodDisagreement * 100).toFixed(1)}% exceeds 25% threshold`);
  }

  // Valuation confidence < 0.70 → withhold
  if (synthesis.valuationConfidence < 0.70) {
    reasons.push(`Valuation confidence ${(synthesis.valuationConfidence * 100).toFixed(0)}% below 70% threshold`);
  }

  // No valid methods → withhold
  const validMethods = synthesis.methods.filter(m => m.perShareValue !== null && m.effectiveWeight > 0);
  if (validMethods.length < 2) {
    reasons.push(`Only ${validMethods.length} valid methods (need at least 2)`);
  }

  return {
    valuePublishable: reasons.length === 0,
    status: reasons.length === 0 ? "PUBLISH_FACTS_PLUS_VALUE" : "PUBLISH_FACTS_ONLY",
    withholdReasons: reasons,
  };
}
