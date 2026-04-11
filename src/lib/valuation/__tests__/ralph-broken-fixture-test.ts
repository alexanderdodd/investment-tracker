/**
 * RALPH Loop — Broken Fixture Test (BROKEN-FIX-001)
 *
 * Verifies that intentionally corrupted facts trigger WITHHOLD_ALL
 * from the two-stage publish gate. This is the safety net: if facts
 * are broken, the system must refuse to publish anything.
 */

import { runQaValidation } from "../qa-validators";
import { pv } from "../types";
import type { CanonicalFacts, FinancialModelOutputs, ValuationOutputs } from "../types";

// ---------------------------------------------------------------------------
// Minimal valid stubs (based on MU golden fixture)
// ---------------------------------------------------------------------------

function buildValidFacts(): CanonicalFacts {
  const today = "2026-04-11";
  return {
    ticker: "MU",
    companyName: "MICRON TECHNOLOGY INC",
    cik: "0000723125",
    sector: "Semiconductors",
    industry: "Memory",
    fiscalYearEnd: "September",

    latestAnnualFiling: { accession: "0000723125-25-000028", periodEnd: "2025-08-28", filedDate: "2025-10-03" },
    latestQuarterlyFiling: { accession: "0000723125-26-000006", periodEnd: "2026-02-26", filedDate: "2026-03-19" },

    currentPrice: pv(420.59, "USD", "spot", today, "MARKET_DATA", "yahoo", "close"),
    sharesOutstanding: pv(1_128_000_000, "shares", "point-in-time", today, "SEC_XBRL", "cover", "filing"),
    marketCap: pv(474_426_000_000, "USD", "point-in-time", today, "COMPUTED", "price*shares", "multiply"),
    enterpriseValue: pv(467_941_000_000, "USD", "point-in-time", today, "COMPUTED", "mktcap+debt-cash", "formula"),
    beta: pv(1.2, "ratio", "5Y", today, "MARKET_DATA", "yahoo", "beta"),

    ttmRevenue: pv(58_119_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmGrossProfit: pv(33_963_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmOperatingIncome: pv(28_094_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmNetIncome: pv(24_111_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmDilutedEPS: pv(21.18, "USD/share", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmOCF: pv(30_653_000_000, "USD", "TTM", today, "SEC_XBRL", "cumulative", "ttm"),
    ttmCapex: pv(20_372_000_000, "USD", "TTM", today, "SEC_XBRL", "cumulative", "ttm"),
    ttmFCF: pv(10_281_000_000, "USD", "TTM", today, "COMPUTED", "ocf-capex", "subtract"),
    ttmDA: pv(5_000_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmSBC: pv(500_000_000, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmDividendsPaid: pv(0, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmBuybacks: pv(0, "USD", "TTM", today, "SEC_XBRL", "sum4q", "ttm"),
    ttmDilutedShares: pv(1_142_000_000, "shares", "TTM", today, "SEC_XBRL", "avg", "weighted"),
    quartersUsed: "Q3 FY25 + Q4 FY25 + Q1 FY26 + Q2 FY26",

    latestQuarterRevenue: pv(23_860_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "10-Q", "discrete"),
    latestQuarterGrossMargin: pv(0.744, "ratio", "Q2 FY2026", today, "COMPUTED", "gp/rev", "divide"),
    latestQuarterOperatingMargin: pv(0.676, "ratio", "Q2 FY2026", today, "COMPUTED", "oi/rev", "divide"),
    latestQuarterNetMargin: pv(0.578, "ratio", "Q2 FY2026", today, "COMPUTED", "ni/rev", "divide"),

    cash: pv(13_908_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    shortTermInvestments: pv(681_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    totalCashAndInvestments: pv(16_627_000_000, "USD", "Q2 FY2026", today, "COMPUTED", "sum", "add"),
    currentDebt: pv(585_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    longTermDebt: pv(9_557_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    totalDebt: pv(10_142_000_000, "USD", "Q2 FY2026", today, "COMPUTED", "sum", "add"),
    totalEquity: pv(72_459_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    goodwill: pv(1_200_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    inventory: pv(8_267_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    receivables: pv(17_314_000_000, "USD", "Q2 FY2026", today, "SEC_XBRL", "bs", "instant"),
    bookValuePerShare: pv(64.24, "USD/share", "Q2 FY2026", today, "COMPUTED", "equity/shares", "divide"),

    trailingPE: pv(19.86, "ratio", "TTM", today, "COMPUTED", "price/eps", "divide"),
    priceToBook: pv(6.55, "ratio", "point-in-time", today, "COMPUTED", "price/bvps", "divide"),
    evToRevenue: pv(8.05, "ratio", "TTM", today, "COMPUTED", "ev/rev", "divide"),

    annualHistory: [
      { year: 2021, revenue: 27_705_000_000, grossMargin: 0.376, operatingMargin: 0.227 },
      { year: 2022, revenue: 30_758_000_000, grossMargin: 0.452, operatingMargin: 0.315 },
      { year: 2023, revenue: 15_540_000_000, grossMargin: -0.091, operatingMargin: -0.370 },
      { year: 2024, revenue: 25_111_000_000, grossMargin: 0.224, operatingMargin: 0.052 },
      { year: 2025, revenue: 37_378_000_000, grossMargin: 0.398, operatingMargin: 0.261 },
    ],
    fiveYearAvgGrossMargin: pv(0.2718, "ratio", "5Y", today, "COMPUTED", "avg", "average"),
    fiveYearAvgOperatingMargin: pv(0.0970, "ratio", "5Y", today, "COMPUTED", "avg", "average"),

    annualDividendPerShare: pv(0, "USD/share", "TTM", today, "SEC_XBRL", "div", "annual"),
    dividendYield: pv(0, "ratio", "TTM", today, "COMPUTED", "dps/price", "divide"),

    xbrlMatchedTags: {},
    missingFields: [],
    dataQualityNotes: [],
  };
}

function buildMinimalModel(): FinancialModelOutputs {
  return {
    revenueGrowth: [],
    marginTrends: [],
    cashConversionRatio: 1.27,
    roe: 0.333,
    roic: 0.336,
    debtToEquity: 0.14,
    debtToEbitda: 0.28,
    interestCoverage: 50,
    dividendPayoutRatio: 0,
    buybackYield: 0,
    capexIntensity: 0.351,
    sbcAsPercentOfRevenue: 0.01,
    cycleState: "peak",
    cycleConfidence: 1.0,
    normalizedRevenue: 30_000_000_000,
    normalizedOperatingMargin: 0.15,
    normalizedFCF: 14_980_000_000,
  };
}

function buildMinimalValuation(): ValuationOutputs {
  return {
    dcf: null,
    multiples: { current: { pe: 19.86, pb: 6.55, evEbitda: 12.7, evRevenue: 8.05, evFcf: 45.5 }, historicalRange: [] },
    reverseDcf: null,
    scenarios: null,
    verdict: "Fair Value",
    confidenceScore: 0.5,
    intrinsicValueRange: null,
    marginOfSafety: null,
  };
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  corrupt: (facts: CanonicalFacts) => void;
  expectedGate: "WITHHOLD_ALL" | "PUBLISH_FACTS_ONLY";
}

const testCases: TestCase[] = [
  {
    name: "Missing 10-K filing → WITHHOLD_ALL",
    corrupt: (f) => { f.latestAnnualFiling = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Missing 10-Q filing → WITHHOLD_ALL",
    corrupt: (f) => { f.latestQuarterlyFiling = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Null price → WITHHOLD_ALL",
    corrupt: (f) => { f.currentPrice.value = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Zero shares → WITHHOLD_ALL",
    corrupt: (f) => { f.sharesOutstanding.value = 0; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Null TTM revenue → WITHHOLD_ALL",
    corrupt: (f) => { f.ttmRevenue.value = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Null TTM net income → WITHHOLD_ALL",
    corrupt: (f) => { f.ttmNetIncome.value = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "FCF != OCF - CapEx → WITHHOLD_ALL",
    corrupt: (f) => { f.ttmFCF.value = 999_999_999_999; }, // wildly wrong
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Null total equity → WITHHOLD_ALL",
    corrupt: (f) => { f.totalEquity.value = null; },
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "P/E inconsistent with price/EPS → WITHHOLD_ALL",
    corrupt: (f) => { f.trailingPE.value = 999; }, // should be ~19.86
    expectedGate: "WITHHOLD_ALL",
  },
  {
    name: "Valid facts but peak cycle → PUBLISH_FACTS_ONLY (not WITHHOLD_ALL)",
    corrupt: () => {}, // no corruption — valid MU at peak should still be PUBLISH_FACTS_ONLY
    expectedGate: "PUBLISH_FACTS_ONLY",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runBrokenFixtureTests() {
  console.log("=== RALPH Loop — Broken Fixture Test (BROKEN-FIX-001) ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const facts = buildValidFacts();
    tc.corrupt(facts);

    const model = buildMinimalModel();
    const valuation = buildMinimalValuation();
    const qa = runQaValidation(facts, model, valuation);
    const gate = qa.gateDecision;

    const ok = gate.status === tc.expectedGate;
    if (ok) {
      passed++;
      console.log(`  ✓ ${tc.name}`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}`);
      console.log(`    Expected: ${tc.expectedGate}, Got: ${gate.status}`);
      if (gate.factsGateFailures.length > 0) {
        console.log(`    Facts failures: ${gate.factsGateFailures.join("; ")}`);
      }
      if (gate.valuationGateFailures.length > 0) {
        console.log(`    Valuation failures: ${gate.valuationGateFailures.join("; ")}`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Passed: ${passed}/${testCases.length}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log("\n  BROKEN-FIX-001: FAIL — some corrupted inputs did not trigger expected gate.");
    process.exit(1);
  } else {
    console.log("\n  BROKEN-FIX-001: PASS — all corrupted inputs correctly blocked.");
  }
}

runBrokenFixtureTests();
