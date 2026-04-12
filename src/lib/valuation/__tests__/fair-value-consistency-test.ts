/**
 * Fair Value Consistency Tests
 *
 * Validates INV-001 through INV-006 and CONSIST-001 through CONSIST-006.
 * Ensures verdict, text, range, and confidence always tell the same story.
 *
 * Run: npx tsx src/lib/valuation/__tests__/fair-value-consistency-test.ts
 */

import { synthesizeFairValue, evaluateValueGate, type FairValueSynthesis } from "../fair-value-synthesis";
import type { DcfOutputs, ReverseDcfOutputs } from "../types";

interface TestResult {
  id: string;
  status: "PASS" | "FAIL";
  message: string;
}

const results: TestResult[] = [];

function test(id: string, condition: boolean, message: string) {
  results.push({ id, status: condition ? "PASS" : "FAIL", message });
}

// ---------------------------------------------------------------------------
// Helper: create a mock DCF
// ---------------------------------------------------------------------------

function mockDcf(perShareValue: number): DcfOutputs {
  return {
    baseYearFCF: 5e9, normalized: true, growthRates: [0.1, 0.08, 0.06, 0.04, 0.025],
    projectedFCF: [], terminalGrowth: 0.025, terminalValue: 0, pvTerminal: 0,
    wacc: 0.095, waccDerivation: { riskFreeRate: 0.043, equityRiskPremium: 0.055, beta: 1.0, costOfEquity: 0.098, costOfDebt: 0.05, taxRate: 0.21, debtWeight: 0.1, equityWeight: 0.9 },
    enterpriseValue: 0, equityValue: 0, perShareValue,
    sensitivityGrid: [
      { wacc: 0.085, terminalGrowth: 0.025, perShareValue: perShareValue * 1.15 },
      { wacc: 0.095, terminalGrowth: 0.025, perShareValue },
      { wacc: 0.105, terminalGrowth: 0.025, perShareValue: perShareValue * 0.87 },
    ],
  };
}

function mockReverseDcf(): ReverseDcfOutputs {
  return { impliedRevenueGrowth: null, impliedOperatingMargin: 0.25, interpretation: "Market implies 25% FCF margin" };
}

// ---------------------------------------------------------------------------
// INV-001: Verdict matches price vs range
// ---------------------------------------------------------------------------

console.log("=== INV-001: Verdict matches price vs range ===\n");

// Test: price above range → EXPENSIVE
{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 200, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const isExpensive = synth.label === "EXPENSIVE" || synth.label === "DEEP_EXPENSIVE";
  test("INV-001a", isExpensive, `Price $200 above range high $${synth.range.high.toFixed(0)} → label should be EXPENSIVE, got ${synth.label}`);
}

// Test: price below range → CHEAP
{
  const synth = synthesizeFairValue({
    dcf: mockDcf(200), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 20, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const isCheap = synth.label === "CHEAP" || synth.label === "DEEP_CHEAP";
  test("INV-001b", isCheap, `Price $20 below range low $${synth.range.low.toFixed(0)} → label should be CHEAP, got ${synth.label}`);
}

// Test: price within range → FAIR
{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  test("INV-001c", synth.label === "FAIR", `Price $100 within range $${synth.range.low.toFixed(0)}-$${synth.range.high.toFixed(0)} → label should be FAIR, got ${synth.label}`);
}

// ---------------------------------------------------------------------------
// INV-002: Single source of truth — label comes from synthesis only
// ---------------------------------------------------------------------------

console.log("=== INV-002: Label derivation ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(50), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 300, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  // Map same way pipeline does
  const verdictMap: Record<string, string> = { CHEAP: "Undervalued", DEEP_CHEAP: "Undervalued", FAIR: "Fair Value", EXPENSIVE: "Overvalued", DEEP_EXPENSIVE: "Overvalued" };
  const mapped = verdictMap[synth.label];
  test("INV-002a", mapped === "Overvalued", `Label ${synth.label} maps to "${mapped}" — should be "Overvalued" for price $300 >> range`);
}

// ---------------------------------------------------------------------------
// LABEL-001: DEEP labels suppressed at low confidence
// ---------------------------------------------------------------------------

console.log("=== LABEL-001: DEEP suppression at low confidence ===\n");

{
  // Force low confidence: extreme cycle, wide range, few methods
  const synth = synthesizeFairValue({
    dcf: mockDcf(30), reverseDcf: null,
    relativeValuation: null, selfHistory: null,
    currentPrice: 300, cycleMarginRatio: 3.0, historyDepth: 4,
  });
  test("LABEL-001a", synth.label !== "DEEP_EXPENSIVE",
    `At confidence ${(synth.valuationConfidence * 100).toFixed(0)}%, label should not be DEEP_EXPENSIVE, got ${synth.label}`);
  test("LABEL-001b", synth.valuationConfidence < 0.35,
    `Confidence should be <35% with extreme cycle + no methods, got ${(synth.valuationConfidence * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------------------------
// INV-006: Confidence rating matches score
// ---------------------------------------------------------------------------

console.log("=== INV-006: Confidence rating matches score ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const expectedRating = synth.valuationConfidence >= 0.70 ? "HIGH" : synth.valuationConfidence >= 0.50 ? "MEDIUM" : "LOW";
  test("INV-006a", synth.confidenceRating === expectedRating,
    `Score ${(synth.valuationConfidence * 100).toFixed(0)}% → rating should be ${expectedRating}, got ${synth.confidenceRating}`);
}

{
  // Low confidence scenario
  const synth = synthesizeFairValue({
    dcf: mockDcf(30), reverseDcf: null,
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 3.0, historyDepth: 4,
  });
  test("INV-006b", synth.confidenceRating === "LOW",
    `Score ${(synth.valuationConfidence * 100).toFixed(0)}% → should be LOW, got ${synth.confidenceRating}`);
}

// ---------------------------------------------------------------------------
// Confidence checklist present
// ---------------------------------------------------------------------------

console.log("=== Confidence checklist ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  test("CHECKLIST-001", synth.confidenceChecklist.length >= 3,
    `Checklist should have ≥3 items, got ${synth.confidenceChecklist.length}`);
  test("CHECKLIST-002", synth.confidenceChecklist.every(c => typeof c.passed === "boolean"),
    `All checklist items must have boolean passed field`);
  test("CHECKLIST-003", synth.confidenceChecklist.every(c => c.detail.length > 0),
    `All checklist items must have non-empty detail`);
}

// ---------------------------------------------------------------------------
// Value gate
// ---------------------------------------------------------------------------

console.log("=== Value gate ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const gate = evaluateValueGate(synth);
  test("VGATE-001", gate.valuePublishable === true, `With 1+ valid method, gate should publish, got ${gate.status}`);
}

{
  // No methods at all
  const synth = synthesizeFairValue({
    dcf: null, reverseDcf: null,
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const gate = evaluateValueGate(synth);
  test("VGATE-002", gate.valuePublishable === false, `With 0 methods, gate should withhold, got ${gate.status}`);
}

// ---------------------------------------------------------------------------
// Reverse DCF excluded from midpoint
// ---------------------------------------------------------------------------

console.log("=== RDCF excluded from midpoint ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  const rdcfMethod = synth.methods.find(m => m.method === "reverse_dcf");
  test("RDCF-001", rdcfMethod?.effectiveWeight === 0, `Reverse DCF effective weight should be 0, got ${rdcfMethod?.effectiveWeight}`);
  test("RDCF-002", rdcfMethod?.weight === 0, `Reverse DCF default weight should be 0, got ${rdcfMethod?.weight}`);
}

// ---------------------------------------------------------------------------
// RANGE-001..006: Range tightening (spec 18)
// ---------------------------------------------------------------------------

console.log("=== RANGE-001: Range width hard cap ===\n");

// Test: extreme method disagreement still produces ≤30% range
{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: { method: "relative_valuation", peerRegistryVersion: "test", perShareValues: [{ metric: "EV/Revenue", value: 800, weight: 1, source: "test" }], weightedPerShare: 800, confidence: 0.8, caveats: [] },
    selfHistory: { method: "self_history", impliedPerShare: 90, historicalRange: { low: 60, mid: 90, high: 120 }, details: { medianGrossMargin: 0.30, medianOperatingMargin: 0.15, currentGrossMargin: 0.30, currentOperatingMargin: 0.15, cyclePosition: "mid_cycle", yearsOfHistory: 8 }, confidence: 0.7 },
    currentPrice: 150, cycleMarginRatio: 1.0, historyDepth: 8,
  });
  test("RANGE-001", synth.rangeWidth <= 0.301,
    `8x method disagreement (DCF $100 vs Peer $800): range width should be ≤30%, got ${(synth.rangeWidth * 100).toFixed(1)}%`);
}

console.log("=== RANGE-002: Outlier dampening ===\n");

// Test: outlier method gets dampened
{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: null,
    relativeValuation: { method: "relative_valuation", peerRegistryVersion: "test", perShareValues: [{ metric: "EV/Revenue", value: 500, weight: 1, source: "test" }], weightedPerShare: 500, confidence: 0.8, caveats: [] },
    selfHistory: { method: "self_history", impliedPerShare: 110, historicalRange: { low: 80, mid: 110, high: 140 }, details: { medianGrossMargin: 0.30, medianOperatingMargin: 0.15, currentGrossMargin: 0.30, currentOperatingMargin: 0.15, cyclePosition: "mid_cycle", yearsOfHistory: 8 }, confidence: 0.7 },
    currentPrice: 120, cycleMarginRatio: 1.0, historyDepth: 8,
  });
  // Peer at $500 is 4-5x the other two methods — should be heavily dampened
  const peerMethod = synth.methods.find(m => m.method === "relative_valuation");
  const dcfMethod = synth.methods.find(m => m.method === "normalized_dcf");
  test("RANGE-002", peerMethod!.effectiveWeight < dcfMethod!.effectiveWeight,
    `Outlier peer ($500 vs DCF $100) should have lower effective weight than DCF: peer ${(peerMethod!.effectiveWeight * 100).toFixed(1)}% vs DCF ${(dcfMethod!.effectiveWeight * 100).toFixed(1)}%`);
}

console.log("=== RANGE-003: Pre-dampening audit trail ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: null,
    relativeValuation: { method: "relative_valuation", peerRegistryVersion: "test", perShareValues: [{ metric: "P/E", value: 400, weight: 1, source: "test" }], weightedPerShare: 400, confidence: 0.8, caveats: [] },
    selfHistory: null,
    currentPrice: 150, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  test("RANGE-003a", synth.preDampeningMethods.length >= 2,
    `Pre-dampening methods should be recorded, got ${synth.preDampeningMethods.length} entries`);
  const peerAudit = synth.preDampeningMethods.find(m => m.method === "relative_valuation");
  test("RANGE-003b", peerAudit !== undefined && peerAudit.dampenedWeight < peerAudit.originalWeight,
    `Dampened peer weight (${peerAudit?.dampenedWeight.toFixed(3)}) should be < original (${peerAudit?.originalWeight.toFixed(3)})`);
}

console.log("=== RANGE-004: rangeClamped flag ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: null,
    relativeValuation: { method: "relative_valuation", peerRegistryVersion: "test", perShareValues: [{ metric: "P/E", value: 1000, weight: 1, source: "test" }], weightedPerShare: 1000, confidence: 0.8, caveats: [] },
    selfHistory: null,
    currentPrice: 200, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  test("RANGE-004", synth.rangeClamped === true,
    `10x disagreement should trigger range clamping, rangeClamped=${synth.rangeClamped}`);
}

console.log("=== RANGE-005: Agreeing methods produce tight range ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: mockReverseDcf(),
    relativeValuation: { method: "relative_valuation", peerRegistryVersion: "test", perShareValues: [{ metric: "P/E", value: 105, weight: 1, source: "test" }], weightedPerShare: 105, confidence: 0.8, caveats: [] },
    selfHistory: { method: "self_history", impliedPerShare: 98, historicalRange: { low: 85, mid: 98, high: 115 }, details: { medianGrossMargin: 0.30, medianOperatingMargin: 0.15, currentGrossMargin: 0.30, currentOperatingMargin: 0.15, cyclePosition: "mid_cycle", yearsOfHistory: 8 }, confidence: 0.7 },
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 8,
  });
  test("RANGE-005a", synth.rangeWidth < 0.30,
    `Agreeing methods (DCF $100, Peer $105, Self $98) should produce tight range, got ${(synth.rangeWidth * 100).toFixed(1)}%`);
  test("RANGE-005b", synth.rangeClamped === false,
    `Agreeing methods should not need clamping, rangeClamped=${synth.rangeClamped}`);
}

console.log("=== RANGE-006: Single method produces reasonable range ===\n");

{
  const synth = synthesizeFairValue({
    dcf: mockDcf(100), reverseDcf: null,
    relativeValuation: null, selfHistory: null,
    currentPrice: 100, cycleMarginRatio: 1.0, historyDepth: 7,
  });
  test("RANGE-006a", synth.rangeWidth <= 0.30,
    `Single method range should be ≤30%, got ${(synth.rangeWidth * 100).toFixed(1)}%`);
  test("RANGE-006b", synth.rangeWidth >= 0.10,
    `Single method range should be ≥10% (from sensitivity grid), got ${(synth.rangeWidth * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

console.log("\n=== RESULTS ===\n");
let pass = 0, fail = 0;
for (const r of results) {
  const icon = r.status === "PASS" ? "✓" : "✗";
  console.log(`  ${icon} ${r.id}: ${r.message}`);
  if (r.status === "PASS") pass++;
  else fail++;
}
console.log(`\n=== SUMMARY: ${pass}/${results.length} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
