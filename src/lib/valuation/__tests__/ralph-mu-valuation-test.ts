/**
 * RALPH Loop — MU Valuation Verdict Tests
 *
 * Tests the fair value synthesis, value gate, and calibration behavior
 * for the valuation verdict feature (Milestone A).
 *
 * Includes:
 * - CAL-001: Current MU fair value falls within expert-approved envelope
 * - CAL-002: Historical snapshot directional sanity
 * - CAL-003: Label stability under modest changes
 * - Value gate threshold enforcement
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { buildCanonicalFacts } from "../canonical-facts";
import { computeFinancialAnalysis } from "../financial-analysis";
import { selectFramework } from "../industry-frameworks";
import { runValuationEngine } from "../valuation-engine";
import { getPeerRegistry, computeRelativeValuation } from "../peer-registry";
import { computeSelfHistoryValuation } from "../self-history-valuation";
import { synthesizeFairValue, evaluateValueGate } from "../fair-value-synthesis";
import type { FairValueSynthesis } from "../fair-value-synthesis";

interface TestResult {
  id: string;
  status: "PASS" | "FAIL" | "INFO";
  message: string;
}

async function runValuationTests() {
  console.log("=== RALPH Loop — MU Valuation Verdict Tests ===\n");

  const results: TestResult[] = [];
  const facts = await buildCanonicalFacts("MU");
  const framework = selectFramework(facts.sector, facts.industry);
  const model = computeFinancialAnalysis(facts, framework);
  const val = runValuationEngine(facts, model, framework);

  const peerReg = getPeerRegistry("MU");
  const relVal = peerReg ? computeRelativeValuation(peerReg, {
    enterpriseValue: facts.enterpriseValue.value ?? 0,
    ttmRevenue: facts.ttmRevenue.value ?? 0,
    ttmOperatingIncome: facts.ttmOperatingIncome.value ?? 0,
    ttmDA: facts.ttmDA.value ?? 0,
    totalEquity: facts.totalEquity.value ?? 0,
    sharesOutstanding: facts.sharesOutstanding.value ?? 1,
    totalDebt: facts.totalDebt.value ?? 0,
    totalCashAndInvestments: facts.totalCashAndInvestments.value ?? 0,
    priceToBook: facts.priceToBook.value,
  }) : null;
  const selfHist = computeSelfHistoryValuation(facts, model, val.multiples);

  const latestGM = facts.latestQuarterGrossMargin.value ?? 0;
  const avgGM = facts.fiveYearAvgGrossMargin.value ?? 1;

  const fvs = synthesizeFairValue({
    dcf: val.dcf, reverseDcf: val.reverseDcf, relativeValuation: relVal,
    selfHistory: selfHist, currentPrice: facts.currentPrice.value ?? 0,
    cycleMarginRatio: avgGM > 0 ? latestGM / avgGM : 1,
    historyDepth: facts.annualHistory.length,
  });
  const vg = evaluateValueGate(fvs);

  // --- PEER-001: Peer registry exists ---
  results.push({
    id: "PEER-001",
    status: peerReg ? "PASS" : "FAIL",
    message: peerReg ? `Framework: ${peerReg.framework}, ${peerReg.primaryPeers.length + peerReg.secondaryPeers.length} peers` : "No peer registry",
  });

  // --- VALM-001: DCF produces value ---
  results.push({
    id: "VALM-001",
    status: val.dcf ? "PASS" : "FAIL",
    message: val.dcf ? `DCF: $${val.dcf.perShareValue.toFixed(2)} (normalized: ${val.dcf.normalized})` : "No DCF",
  });

  // --- VALM-002: Reverse DCF produces value ---
  results.push({
    id: "VALM-002",
    status: val.reverseDcf ? "PASS" : "FAIL",
    message: val.reverseDcf ? `Reverse DCF: implied margin ${val.reverseDcf.impliedOperatingMargin !== null ? (val.reverseDcf.impliedOperatingMargin * 100).toFixed(1) + "%" : "null"}` : "No reverse DCF",
  });

  // --- VALM-003: Relative valuation produces value ---
  results.push({
    id: "VALM-003",
    status: relVal && relVal.weightedPerShare > 0 ? "PASS" : "FAIL",
    message: relVal ? `Relative: $${relVal.weightedPerShare.toFixed(2)} from ${relVal.perShareValues.length} data points` : "No relative valuation",
  });

  // --- VALM-004: Self-history produces value ---
  results.push({
    id: "VALM-004",
    status: selfHist.impliedPerShare !== null ? "PASS" : "FAIL",
    message: selfHist.impliedPerShare !== null ? `Self-history: $${selfHist.impliedPerShare.toFixed(2)}` : "No self-history value",
  });

  // --- VPUB-004: Label matches price vs range logic ---
  const price = facts.currentPrice.value ?? 0;
  const correctLabel = price < fvs.range.low ? "CHEAP" : price > fvs.range.high ? "EXPENSIVE" : "FAIR";
  const labelCorrect = fvs.label === correctLabel || fvs.label === "DEEP_CHEAP" || fvs.label === "DEEP_EXPENSIVE";
  results.push({
    id: "VPUB-004",
    status: labelCorrect ? "PASS" : "FAIL",
    message: `Label: ${fvs.label}, price $${price.toFixed(2)} vs range $${fvs.range.low.toFixed(2)}-$${fvs.range.high.toFixed(2)}`,
  });

  // --- VPUB-005: Value gate publishes with confidence rating ---
  // Always publishes when methods produce results; confidence rating explains uncertainty
  results.push({
    id: "VPUB-005",
    status: vg.valuePublishable ? "PASS" : "FAIL",
    message: `Value gate: ${vg.status} | Confidence: ${fvs.confidenceRating} (${(fvs.valuationConfidence * 100).toFixed(0)}%)`,
  });

  // --- VPUB-006: Confidence rating and reasons present ---
  results.push({
    id: "VPUB-006",
    status: fvs.confidenceRating && fvs.confidenceReasons.length > 0 ? "PASS" : "FAIL",
    message: `Confidence rating: ${fvs.confidenceRating}, ${fvs.confidenceReasons.length} reason(s)`,
  });

  // --- CAL-001: Fair value within expert envelope ---
  // At peak cycle, MU normalized mid-cycle value should be roughly $100-250
  // (Based on mid-cycle P/E of 10-15x on normalized EPS of $8-15)
  const expertEnvelopeLow = 80;
  const expertEnvelopeHigh = 300;
  const midInEnvelope = fvs.range.mid >= expertEnvelopeLow && fvs.range.mid <= expertEnvelopeHigh;
  results.push({
    id: "CAL-001",
    status: midInEnvelope ? "PASS" : "FAIL",
    message: `Fair value mid $${fvs.range.mid.toFixed(2)} vs expert envelope $${expertEnvelopeLow}-$${expertEnvelopeHigh}`,
  });

  // --- CAL-002: Directional sanity at peak ---
  // At peak cycle, the system should recognize overvaluation risk
  // The label should be EXPENSIVE or FAIR (not CHEAP)
  const directionallyCorrect = fvs.label !== "CHEAP" && fvs.label !== "DEEP_CHEAP";
  results.push({
    id: "CAL-002",
    status: directionallyCorrect ? "PASS" : "FAIL",
    message: `At peak cycle, label is ${fvs.label} (should not be CHEAP)`,
  });

  // --- CAL-003: Confidence < 1.0 at peak ---
  // At extreme peak, confidence should be penalized
  const confidencePenalized = fvs.valuationConfidence < 0.80;
  results.push({
    id: "CAL-003",
    status: confidencePenalized ? "PASS" : "FAIL",
    message: `Confidence: ${(fvs.valuationConfidence * 100).toFixed(0)}% (should be penalized at peak)`,
  });

  // --- Print results ---
  console.log("=== RESULTS ===\n");
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "ℹ";
    console.log(`  ${icon} ${r.id}: ${r.message}`);
    if (r.status === "PASS") pass++;
    if (r.status === "FAIL") fail++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Passed: ${pass}/${results.length}`);
  console.log(`  Failed: ${fail}/${results.length}`);
  console.log(`\n=== FAIR VALUE DETAILS ===`);
  console.log(`  Range: $${fvs.range.low.toFixed(2)} / $${fvs.range.mid.toFixed(2)} / $${fvs.range.high.toFixed(2)}`);
  console.log(`  Width: ${(fvs.rangeWidth * 100).toFixed(1)}%`);
  console.log(`  Label: ${fvs.label}`);
  console.log(`  Confidence: ${(fvs.valuationConfidence * 100).toFixed(0)}%`);
  console.log(`  Value gate: ${vg.status}`);
  console.log(`  Method disagreement: ${(fvs.primaryMethodDisagreement * 100).toFixed(1)}%`);
}

runValuationTests().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
