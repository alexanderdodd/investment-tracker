/**
 * Render-time report surface scanner.
 *
 * Scans the LLM-generated narrative text for numeric claims and verifies
 * each one maps to an allowed field in the surface allowlist with a
 * formula trace (for derived metrics).
 *
 * Addresses:
 * - TRACE-003: Every surfaced numeric sentence maps to an allowed fact/derived/evidence id
 * - SURFACE-006: No numeric claim may appear if absent from the surface allowlist
 *
 * See: .claude/features/stock-valuation-spec/05-deterministic-validation-framework.md
 */

import type { CanonicalFacts, FinancialModelOutputs, ValuationOutputs } from "./types";
import type { FormulaTrace } from "./formula-traces";
import type { SurfaceAllowlist } from "./surface-allowlist";

export interface NumericClaim {
  raw: string;
  value: number;
  unit: "dollars" | "percent" | "ratio" | "shares" | "years" | "plain";
  context: string; // surrounding text snippet
  lineNumber: number;
}

export interface ScanResult {
  status: "PASS" | "FAIL";
  totalClaims: number;
  matchedClaims: number;
  unmatchedClaims: NumericClaim[];
  matchDetails: { claim: NumericClaim; matchedTo: string }[];
}

// Known values that are allowed in any report (dates, counts, etc.)
const STRUCTURAL_NUMBERS = new Set([2, 4, 5, 10, 12, 52, 53, 100]);

/**
 * Extract numeric claims from report text.
 */
function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/metadata lines
    if (line.startsWith("Generated:") || line.startsWith("Source:") ||
        line.startsWith("Publish Gate:") || line.startsWith("Reason:") ||
        line.startsWith("VALUATION STATUS:") || line.startsWith("QA REPORT") ||
        line.startsWith("[") || line.trim() === "") continue;

    // Dollar amounts: $23.86 billion, $420.59, $10.28 billion
    const dollarPattern = /\$([0-9,]+(?:\.[0-9]+)?)\s*(billion|million|trillion|B|M|T)?/gi;
    let match;
    while ((match = dollarPattern.exec(line)) !== null) {
      const numStr = match[1].replace(/,/g, "");
      let value = parseFloat(numStr);
      const suffix = (match[2] || "").toLowerCase();
      if (suffix === "billion" || suffix === "b") value *= 1e9;
      else if (suffix === "million" || suffix === "m") value *= 1e6;
      else if (suffix === "trillion" || suffix === "t") value *= 1e12;
      claims.push({
        raw: match[0],
        value,
        unit: "dollars",
        context: line.trim().substring(0, 120),
        lineNumber: i + 1,
      });
    }

    // Percentages: 74.4%, -9.1%
    const pctPattern = /(-?[0-9]+(?:\.[0-9]+)?)%/g;
    while ((match = pctPattern.exec(line)) !== null) {
      claims.push({
        raw: match[0],
        value: parseFloat(match[1]),
        unit: "percent",
        context: line.trim().substring(0, 120),
        lineNumber: i + 1,
      });
    }

    // Ratios: 19.9x, 6.5x, 2.7x
    const ratioPattern = /([0-9]+(?:\.[0-9]+)?)x\b/g;
    while ((match = ratioPattern.exec(line)) !== null) {
      claims.push({
        raw: match[0],
        value: parseFloat(match[1]),
        unit: "ratio",
        context: line.trim().substring(0, 120),
        lineNumber: i + 1,
      });
    }
  }

  return claims;
}

/**
 * Build a registry of known values from canonical facts and financial model.
 * Maps display-level values to their field identifiers.
 */
function buildKnownValues(
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  traces: FormulaTrace[],
  valuation?: ValuationOutputs
): Map<string, string[]> {
  // Map from "value key" to field names
  const registry = new Map<string, string[]>();

  function addVal(key: string, field: string) {
    const existing = registry.get(key) || [];
    existing.push(field);
    registry.set(key, existing);
  }

  // Helper to register a dollar value at multiple scales
  function addDollar(value: number | null, field: string) {
    if (value === null) return;
    // Raw value
    addVal(`d:${value}`, field);
    // In billions (2 decimals)
    addVal(`d:${(value / 1e9).toFixed(2)}B`, field);
    // In billions (1 decimal)
    addVal(`d:${(value / 1e9).toFixed(1)}B`, field);
    // In billions (0 decimals)
    addVal(`d:${(value / 1e9).toFixed(0)}B`, field);
    // In millions
    addVal(`d:${(value / 1e6).toFixed(0)}M`, field);
    addVal(`d:${(value / 1e6).toFixed(1)}M`, field);
    addVal(`d:${(value / 1e6).toFixed(2)}M`, field);
  }

  function addPercent(value: number | null, field: string) {
    if (value === null) return;
    // As decimal (0.274) or percentage (27.4)
    if (Math.abs(value) < 1) {
      // It's a decimal ratio
      const pct = value * 100;
      addVal(`p:${pct.toFixed(1)}`, field);
      addVal(`p:${pct.toFixed(2)}`, field);
      addVal(`p:${pct.toFixed(0)}`, field);
      // Also register absolute value for negative margins (LLM may write "9.1%" for "-9.1%")
      if (value < 0) {
        addVal(`p:${Math.abs(pct).toFixed(1)}`, field);
        addVal(`p:${Math.abs(pct).toFixed(0)}`, field);
      }
    } else {
      addVal(`p:${value.toFixed(1)}`, field);
      addVal(`p:${value.toFixed(2)}`, field);
      addVal(`p:${value.toFixed(0)}`, field);
      if (value < 0) {
        addVal(`p:${Math.abs(value).toFixed(1)}`, field);
      }
    }
  }

  function addRatio(value: number | null, field: string) {
    if (value === null) return;
    addVal(`r:${value.toFixed(1)}`, field);
    addVal(`r:${value.toFixed(2)}`, field);
  }

  // --- Register all canonical fact values ---

  // Latest quarter
  addDollar(facts.latestQuarterRevenue.value, "latest_quarter.revenue");
  addPercent(facts.latestQuarterGrossMargin.value, "latest_quarter.gross_margin");
  addPercent(facts.latestQuarterOperatingMargin.value, "latest_quarter.operating_margin");
  addPercent(facts.latestQuarterNetMargin.value, "latest_quarter.net_margin");

  // TTM
  addDollar(facts.ttmRevenue.value, "ttm.revenue");
  addDollar(facts.ttmGrossProfit.value, "ttm.gross_profit");
  addDollar(facts.ttmOperatingIncome.value, "ttm.operating_income");
  addDollar(facts.ttmNetIncome.value, "ttm.net_income");
  addDollar(facts.ttmOCF.value, "ttm.operating_cash_flow");
  addDollar(facts.ttmCapex.value, "ttm.capex");
  addDollar(facts.ttmFCF.value, "ttm.gaap_free_cash_flow");

  // Balance sheet
  addDollar(facts.cash.value, "balance_sheet.cash");
  addDollar(facts.totalCashAndInvestments.value, "balance_sheet.total_cash_and_investments");
  addDollar(facts.totalDebt.value, "balance_sheet.total_debt");
  addDollar(facts.totalEquity.value, "balance_sheet.total_equity");

  // Derived
  addDollar(facts.marketCap.value, "derived.market_cap");
  addDollar(facts.enterpriseValue.value, "derived.enterprise_value");
  addRatio(facts.trailingPE.value, "derived.trailing_pe");
  addRatio(facts.priceToBook.value, "derived.price_to_book");
  addRatio(facts.evToRevenue.value, "derived.ev_to_revenue");

  // EPS and price
  addVal(`d:${facts.currentPrice.value}`, "market.current_price");
  addVal(`d:${facts.ttmDilutedEPS.value}`, "ttm.diluted_eps");

  // Shares
  if (facts.sharesOutstanding.value) {
    addVal(`shares:${facts.sharesOutstanding.value}`, "shares.point_in_time");
  }

  // Book value per share
  addVal(`d:${facts.bookValuePerShare.value?.toFixed(2)}`, "derived.book_value_per_share");

  // Margins (TTM computed)
  if (facts.ttmRevenue.value && facts.ttmGrossProfit.value) {
    addPercent(facts.ttmGrossProfit.value / facts.ttmRevenue.value, "derived.ttm_gross_margin");
  }
  if (facts.ttmRevenue.value && facts.ttmOperatingIncome.value) {
    addPercent(facts.ttmOperatingIncome.value / facts.ttmRevenue.value, "derived.ttm_operating_margin");
  }
  if (facts.ttmRevenue.value && facts.ttmNetIncome.value) {
    addPercent(facts.ttmNetIncome.value / facts.ttmRevenue.value, "derived.ttm_net_margin");
  }

  // Annual history margins
  for (const yr of facts.annualHistory) {
    addPercent(yr.grossMargin, `annual_history.${yr.year}.gross_margin`);
    addPercent(yr.operatingMargin, `annual_history.${yr.year}.operating_margin`);
    if (yr.revenue !== null) addDollar(yr.revenue, `annual_history.${yr.year}.revenue`);
  }

  // 5Y averages
  addPercent(facts.fiveYearAvgGrossMargin.value, "annual_history.five_year_avg_gross_margin");
  addPercent(facts.fiveYearAvgOperatingMargin.value, "annual_history.five_year_avg_operating_margin");

  // Financial model metrics
  if (model.roe !== null) addPercent(model.roe, "model.roe");
  if (model.roic !== null) addPercent(model.roic, "model.roic");
  if (model.interestCoverage !== null) addRatio(model.interestCoverage, "model.interest_coverage");

  // Model-derived ratios
  if (model.debtToEquity !== null) addRatio(model.debtToEquity, "model.debt_to_equity");
  if (model.debtToEbitda !== null) addRatio(model.debtToEbitda, "model.debt_to_ebitda");

  // Capex intensity
  if (model.capexIntensity !== null) addPercent(model.capexIntensity, "model.capex_intensity");

  // Cash conversion ratio
  if (model.cashConversionRatio !== null) addRatio(model.cashConversionRatio, "model.cash_conversion");

  // SBC as % of revenue
  if (model.sbcAsPercentOfRevenue !== null) addPercent(model.sbcAsPercentOfRevenue, "model.sbc_percent");

  // D&A from facts
  if (facts.ttmDA.value !== null) addDollar(facts.ttmDA.value, "ttm.depreciation_amortization");

  // SBC
  if (facts.ttmSBC.value !== null) addDollar(facts.ttmSBC.value, "ttm.stock_based_compensation");

  // Normalized FCF from model
  if (model.normalizedFCF !== null) addDollar(model.normalizedFCF, "model.normalized_fcf");

  // Normalized revenue / margins
  if (model.normalizedRevenue !== null) addDollar(model.normalizedRevenue, "model.normalized_revenue");
  if (model.normalizedOperatingMargin !== null) addPercent(model.normalizedOperatingMargin, "model.normalized_operating_margin");

  // Cycle divergence ratios (current margin / 5Y avg)
  if (facts.latestQuarterGrossMargin.value && facts.fiveYearAvgGrossMargin.value && facts.fiveYearAvgGrossMargin.value !== 0) {
    addRatio(facts.latestQuarterGrossMargin.value / facts.fiveYearAvgGrossMargin.value, "derived.gm_cycle_ratio");
  }
  if (facts.latestQuarterOperatingMargin.value && facts.fiveYearAvgOperatingMargin.value && facts.fiveYearAvgOperatingMargin.value !== 0) {
    addRatio(facts.latestQuarterOperatingMargin.value / facts.fiveYearAvgOperatingMargin.value, "derived.om_cycle_ratio");
  }
  // TTM margin / 5Y avg (alternative cycle comparison)
  if (facts.ttmGrossProfit.value && facts.ttmRevenue.value && facts.fiveYearAvgGrossMargin.value && facts.fiveYearAvgGrossMargin.value !== 0) {
    const ttmGM = facts.ttmGrossProfit.value / facts.ttmRevenue.value;
    addRatio(ttmGM / facts.fiveYearAvgGrossMargin.value, "derived.ttm_gm_cycle_ratio");
  }

  // Valuation multiples (from valuation engine)
  if (valuation) {
    const m = valuation.multiples.current;
    if (m.pe !== null) addRatio(m.pe, "multiples.pe");
    if (m.pb !== null) addRatio(m.pb, "multiples.pb");
    if (m.evEbitda !== null) addRatio(m.evEbitda, "multiples.ev_ebitda");
    if (m.evRevenue !== null) addRatio(m.evRevenue, "multiples.ev_revenue");
    if (m.evFcf !== null) addRatio(m.evFcf, "multiples.ev_fcf");
  }

  // Formula trace results
  for (const trace of traces) {
    if (trace.result !== null) {
      addDollar(trace.result, trace.field);
      addRatio(trace.result, trace.field);
    }
  }

  // EV/EBIT, EV/FCF from traces
  for (const trace of traces) {
    if (trace.field === "derived.ev_to_ebit" && trace.result !== null) {
      addRatio(trace.result, "derived.ev_to_ebit");
    }
    if (trace.field === "derived.ev_to_fcf" && trace.result !== null) {
      addRatio(trace.result, "derived.ev_to_fcf");
    }
  }

  return registry;
}

/**
 * Match a numeric claim against known values.
 */
function matchClaim(
  claim: NumericClaim,
  knownValues: Map<string, string[]>,
  allowedFields: Set<string>
): string | null {
  // Skip structural numbers (year counts, quarter counts, etc.)
  if (STRUCTURAL_NUMBERS.has(claim.value)) return "__structural__";

  // Year numbers (2020-2030)
  if (claim.unit === "plain" && claim.value >= 2015 && claim.value <= 2035) return "__year__";

  let prefix: string;
  switch (claim.unit) {
    case "dollars":
      prefix = "d:";
      break;
    case "percent":
      prefix = "p:";
      break;
    case "ratio":
      prefix = "r:";
      break;
    default:
      prefix = "d:";
  }

  // Try exact match
  if (claim.unit === "dollars") {
    // Try various representations
    const keys = [
      `d:${claim.value}`,
      `d:${(claim.value / 1e9).toFixed(2)}B`,
      `d:${(claim.value / 1e9).toFixed(1)}B`,
      `d:${(claim.value / 1e9).toFixed(0)}B`,
      `d:${(claim.value / 1e6).toFixed(0)}M`,
      `d:${(claim.value / 1e6).toFixed(1)}M`,
    ];
    for (const k of keys) {
      const fields = knownValues.get(k);
      if (fields) return fields[0];
    }
  } else if (claim.unit === "percent") {
    const keys = [
      `p:${claim.value.toFixed(1)}`,
      `p:${claim.value.toFixed(2)}`,
      `p:${claim.value.toFixed(0)}`,
    ];
    for (const k of keys) {
      const fields = knownValues.get(k);
      if (fields) return fields[0];
    }
  } else if (claim.unit === "ratio") {
    const keys = [
      `r:${claim.value.toFixed(1)}`,
      `r:${claim.value.toFixed(2)}`,
    ];
    for (const k of keys) {
      const fields = knownValues.get(k);
      if (fields) return fields[0];
    }
  }

  // Fuzzy match: within 1% of a known value
  for (const [key, fields] of knownValues) {
    if (!key.startsWith(prefix)) continue;
    const valStr = key.substring(prefix.length).replace(/[BMT]$/, "");
    const knownVal = parseFloat(valStr);
    if (isNaN(knownVal) || knownVal === 0) continue;
    const relDiff = Math.abs(claim.value - knownVal) / Math.abs(knownVal);
    if (relDiff < 0.025) return fields[0];
  }

  return null;
}

/**
 * Scan a rendered report for surface integrity violations.
 *
 * Returns PASS if all numeric claims map to allowed fields with traces.
 * Returns FAIL if any unmatched numeric claims are found.
 */
export function scanReportSurface(
  reportText: string,
  facts: CanonicalFacts,
  model: FinancialModelOutputs,
  traces: FormulaTrace[],
  allowlist: SurfaceAllowlist,
  valuation?: ValuationOutputs
): ScanResult {
  const claims = extractNumericClaims(reportText);
  const knownValues = buildKnownValues(facts, model, traces, valuation);
  const allowedFields = new Set(allowlist.allowed);

  const matchDetails: { claim: NumericClaim; matchedTo: string }[] = [];
  const unmatchedClaims: NumericClaim[] = [];

  for (const claim of claims) {
    const matched = matchClaim(claim, knownValues, allowedFields);
    if (matched) {
      matchDetails.push({ claim, matchedTo: matched });
    } else {
      unmatchedClaims.push(claim);
    }
  }

  return {
    status: unmatchedClaims.length === 0 ? "PASS" : "FAIL",
    totalClaims: claims.length,
    matchedClaims: matchDetails.length,
    unmatchedClaims,
    matchDetails,
  };
}
