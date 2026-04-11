/**
 * RALPH Loop — Micron Golden Fixture Test
 *
 * Runs the current extraction pipeline against the frozen MU golden
 * fixture and reports all failures with root-cause signatures.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { buildCanonicalFacts } from "../canonical-facts";
import goldenMU from "./fixtures/golden-mu.json";

interface RuleResult {
  ruleId: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "PASS" | "FAIL";
  field: string;
  expected: number | string | null;
  actual: number | string | null;
  message: string;
}

function withinTolerance(actual: number | null, expected: number, toleranceAbs = 1, toleranceRelPct = 0.1): boolean {
  if (actual === null) return false;
  const absDiff = Math.abs(actual - expected);
  const relDiff = expected !== 0 ? (absDiff / Math.abs(expected)) * 100 : absDiff;
  return absDiff <= toleranceAbs || relDiff <= toleranceRelPct;
}

// Values in the golden fixture are in millions; canonical facts are in raw dollars
const M = 1e6;

async function runRalphTest() {
  console.log("=== RALPH Loop — Micron Golden Fixture Test ===\n");
  console.log("Building canonical facts for MU...\n");

  let facts;
  try {
    facts = await buildCanonicalFacts("MU");
  } catch (err) {
    console.error("FATAL: Failed to build canonical facts:", err);
    process.exit(1);
  }

  const results: RuleResult[] = [];

  function check(ruleId: string, severity: "HIGH" | "MEDIUM" | "LOW", field: string, actual: number | null, expected: number, toleranceAbs = 1 * M, toleranceRelPct = 0.1) {
    const pass = withinTolerance(actual, expected * M, toleranceAbs, toleranceRelPct);
    results.push({
      ruleId,
      severity,
      status: pass ? "PASS" : "FAIL",
      field,
      expected: expected * M,
      actual,
      message: pass
        ? `OK: ${(actual! / M).toFixed(0)}M vs expected ${expected}M`
        : `MISMATCH: got ${actual !== null ? (actual / M).toFixed(0) + "M" : "NULL"}, expected ${expected}M`,
    });
  }

  function checkExact(ruleId: string, severity: "HIGH" | "MEDIUM" | "LOW", field: string, actual: number | null, expected: number, tolerance = 0.5) {
    const pass = actual !== null && Math.abs(actual - expected) <= tolerance;
    results.push({
      ruleId,
      severity,
      status: pass ? "PASS" : "FAIL",
      field,
      expected,
      actual,
      message: pass
        ? `OK: ${actual!.toFixed(2)} vs expected ${expected}`
        : `MISMATCH: got ${actual?.toFixed(2) ?? "NULL"}, expected ${expected}`,
    });
  }

  // --- Latest Quarter ---
  const g = goldenMU;

  check("PERIOD-001", "HIGH", "latest_quarter.revenue", facts.latestQuarterRevenue.value, g.latestQuarter.revenue);

  // --- TTM ---
  check("TTM-001", "HIGH", "ttm.revenue", facts.ttmRevenue.value, g.ttm.revenue);
  check("TTM-003", "HIGH", "ttm.operating_income", facts.ttmOperatingIncome.value, g.ttm.operatingIncome);
  check("TTM-004", "HIGH", "ttm.net_income", facts.ttmNetIncome.value, g.ttm.netIncome);
  check("TTM-006", "HIGH", "ttm.ocf", facts.ttmOCF.value, g.ttm.operatingCashFlow);
  check("TTM-007", "HIGH", "ttm.capex", facts.ttmCapex.value, g.ttm.capex);
  check("TTM-008", "HIGH", "ttm.fcf", facts.ttmFCF.value, g.ttm.gaapFreeCashFlow);

  // --- Balance Sheet ---
  check("BS-001a", "HIGH", "balance_sheet.cash", facts.cash.value, g.balanceSheet.cashAndEquivalents);
  check("BS-001b", "HIGH", "balance_sheet.total_cash", facts.totalCashAndInvestments.value, g.balanceSheet.totalCashAndInvestments);
  check("BS-002a", "HIGH", "balance_sheet.total_debt", facts.totalDebt.value, g.balanceSheet.totalDebt);
  check("BS-002b", "HIGH", "balance_sheet.total_equity", facts.totalEquity.value, g.balanceSheet.totalEquity);

  // --- Shares ---
  const sharesActual = facts.sharesOutstanding.value;
  const sharesExpected = g.balanceSheet.pointInTimeShares;
  results.push({
    ruleId: "SHARES-001",
    severity: "HIGH",
    status: sharesActual !== null && Math.abs(sharesActual - sharesExpected) < sharesExpected * 0.01 ? "PASS" : "FAIL",
    field: "shares.point_in_time",
    expected: sharesExpected,
    actual: sharesActual,
    message: `Shares: got ${sharesActual?.toLocaleString() ?? "NULL"}, expected ${sharesExpected.toLocaleString()}`,
  });

  // --- Derived Metrics ---
  checkExact("MULT-001", "HIGH", "trailing_pe", facts.trailingPE.value, g.derived.trailingPE, 1.0);
  checkExact("MULT-002", "HIGH", "price_to_book", facts.priceToBook.value, g.derived.priceToBook, 0.5);

  // --- TTM EPS ---
  checkExact("TTM-005", "HIGH", "ttm.diluted_eps", facts.ttmDilutedEPS.value, g.ttm.dilutedEPS, 0.5);

  // --- Annual History ---
  const historyCount = facts.annualHistory.length;
  results.push({
    ruleId: "HIST-001",
    severity: "MEDIUM",
    status: historyCount >= 5 ? "PASS" : "FAIL",
    field: "annual_history.count",
    expected: 5,
    actual: historyCount,
    message: `Annual history: ${historyCount} years (need ≥5 for cyclical normalization)`,
  });

  // --- Report ---
  console.log("=== VALIDATION RESULTS ===\n");

  const highFails = results.filter(r => r.status === "FAIL" && r.severity === "HIGH");
  const medFails = results.filter(r => r.status === "FAIL" && r.severity === "MEDIUM");
  const passes = results.filter(r => r.status === "PASS");

  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    const color = r.status === "PASS" ? "" : ` [${r.severity}]`;
    console.log(`  ${icon} ${r.ruleId}${color}: ${r.message}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Passed: ${passes.length}/${results.length}`);
  console.log(`  HIGH failures: ${highFails.length}`);
  console.log(`  MEDIUM failures: ${medFails.length}`);

  if (highFails.length > 0) {
    console.log(`\n=== GATE DECISION: WITHHOLD_ALL ===`);
    console.log(`  ${highFails.length} critical fact failures detected.`);
    console.log(`  Root-cause diagnosis needed before next iteration.\n`);

    console.log("=== ROOT-CAUSE SIGNATURES ===");
    for (const f of highFails) {
      console.log(`  ${f.ruleId} ${f.field}: ${f.message}`);
    }
  } else if (medFails.length > 0) {
    console.log(`\n=== GATE DECISION: PUBLISH_FACTS_ONLY ===`);
  } else {
    console.log(`\n=== GATE DECISION: FACTS_PUBLISHABLE ===`);
  }

  // Check quarters used
  console.log(`\n=== DEBUG INFO ===`);
  console.log(`  Quarters used: ${facts.quartersUsed}`);
  console.log(`  Company: ${facts.companyName}`);
  console.log(`  CIK: ${facts.cik}`);
  console.log(`  Sector: ${facts.sector}`);
  console.log(`  FY End: ${facts.fiscalYearEnd}`);
  console.log(`  Price: $${facts.currentPrice.value} (${facts.currentPrice.asOf})`);
  console.log(`  XBRL matched tags: ${JSON.stringify(facts.xbrlMatchedTags)}`);
  console.log(`  Missing fields: ${facts.missingFields.join(", ") || "none"}`);
}

runRalphTest().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
