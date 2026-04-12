/**
 * Maps varying XBRL concept tags to canonical financial fields.
 *
 * Companies use different tags for the same metric. This mapper tries each
 * tag in priority order and returns the first match.
 */

import type { CompanyFacts, XbrlUnit } from "./client";

// ---------------------------------------------------------------------------
// Tag priority lists — first match wins
// ---------------------------------------------------------------------------

/** Revenue */
const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "SalesRevenueServicesNet",
  // Banks / insurance
  "InterestAndDividendIncomeOperating",
  "InterestIncomeExpenseNet",
];

/** Gross profit */
const GROSS_PROFIT_TAGS = ["GrossProfit"];

/** Operating income */
const OPERATING_INCOME_TAGS = [
  "OperatingIncomeLoss",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
];

/** Net income */
const NET_INCOME_TAGS = [
  "NetIncomeLoss",
  "NetIncomeLossAvailableToCommonStockholdersBasic",
  "ProfitLoss",
];

/** EPS diluted */
const EPS_DILUTED_TAGS = [
  "EarningsPerShareDiluted",
];

/** EPS basic */
const EPS_BASIC_TAGS = [
  "EarningsPerShareBasic",
];

/** Operating cash flow */
const OCF_TAGS = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
];

/** Capital expenditures (usually negative in XBRL, we take absolute value) */
const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "CapitalExpenditureDiscontinuedOperations",
];

/** Depreciation & amortization */
const DA_TAGS = [
  "DepreciationDepletionAndAmortization",
  "DepreciationAndAmortization",
  "Depreciation",
];

/** Stock-based compensation */
const SBC_TAGS = [
  "ShareBasedCompensation",
  "AllocatedShareBasedCompensationExpense",
];

/** Dividends paid */
const DIVIDENDS_PAID_TAGS = [
  "PaymentsOfDividendsCommonStock",
  "PaymentsOfDividends",
  "PaymentsOfOrdinaryDividends",
];

/** Buybacks */
const BUYBACK_TAGS = [
  "PaymentsForRepurchaseOfCommonStock",
  "PaymentsForRepurchaseOfEquity",
];

// Balance sheet tags (instant values)
const CASH_TAGS = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments", "Cash"];
const SHORT_TERM_INVESTMENTS_TAGS = ["AvailableForSaleSecuritiesDebtSecuritiesCurrent", "ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"];
const LT_INVESTMENTS_TAGS = ["AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "MarketableSecuritiesNoncurrent", "LongTermInvestments"];
const CURRENT_DEBT_TAGS = ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"];
const LONG_TERM_DEBT_TAGS = ["LongTermDebtAndCapitalLeaseObligations", "LongTermDebtNoncurrent", "LongTermDebt"];
const TOTAL_EQUITY_TAGS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const GOODWILL_TAGS = ["Goodwill"];
const INVENTORY_TAGS = ["InventoryNet"];
const RECEIVABLES_TAGS = ["AccountsReceivableNetCurrent", "AccountsReceivableNet", "ReceivablesNetCurrent"];
// Prefer DEI cover-page shares (exact integer from filing cover) over
// us-gaap balance-sheet shares (often rounded to millions)
const SHARES_OUTSTANDING_TAGS = ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"];
const DILUTED_SHARES_TAGS = ["WeightedAverageNumberOfDilutedSharesOutstanding"];

// ---------------------------------------------------------------------------
// Core extraction logic
// ---------------------------------------------------------------------------

type PeriodFilter = "duration" | "instant";

/**
 * Extract XBRL fact units for a given set of tag candidates.
 * Returns the units array for the first tag that has data, or null.
 */
function findConceptUnits(
  facts: CompanyFacts,
  tags: string[],
  unitKey = "USD"
): XbrlUnit[] | null {
  const usGaap = facts.facts["us-gaap"];
  const dei = facts.facts["dei"];

  for (const tag of tags) {
    const concept = usGaap?.[tag] ?? dei?.[tag];
    if (!concept) continue;

    const units = concept.units[unitKey];
    if (units && units.length > 0) return units;
  }
  return null;
}

/**
 * Get the discrete quarter value for a specific fiscal period from XBRL units.
 *
 * CRITICAL: SEC EDGAR stores BOTH cumulative (YTD) and discrete (single quarter)
 * entries for the same fp/fy. For quarterly income statement and cash flow items,
 * we must select the DISCRETE quarter (shortest duration), not the cumulative.
 *
 * For FY entries, we want the full-year duration.
 * For instant (balance sheet) entries, we match on instant or end-without-start.
 */
export function getValueForPeriod(
  units: XbrlUnit[],
  fiscalYear: number,
  fiscalPeriod: string, // "Q1", "Q2", "Q3", "FY"
  periodType: PeriodFilter = "duration",
  formFilter?: string
): number | null {
  // Filter to 10-K and 10-Q forms
  const filtered = units.filter((u) => {
    if (formFilter) return u.form === formFilter;
    return u.form === "10-K" || u.form === "10-Q";
  });

  if (periodType === "instant") {
    // For balance sheet items, match instant or end-without-start
    for (const u of filtered) {
      if (u.fy === fiscalYear && u.fp === fiscalPeriod) {
        if (u.instant || (u.end && !u.start)) return u.val;
      }
    }
    return null;
  }

  // For duration items (income statement, cash flow)
  if (fiscalPeriod === "FY") {
    // For annual: take the full-year entry (longest duration for this fy)
    const candidates = filtered.filter(u => u.fy === fiscalYear && u.fp === "FY" && u.start && u.end);
    if (candidates.length > 0) {
      // Pick the one with the longest duration (full year)
      candidates.sort((a, b) => {
        const durA = new Date(a.end!).getTime() - new Date(a.start!).getTime();
        const durB = new Date(b.end!).getTime() - new Date(b.start!).getTime();
        return durB - durA;
      });
      return candidates[0].val;
    }
    return null;
  }

  // For quarterly items: we need the DISCRETE quarter value.
  //
  // SEC XBRL has two patterns:
  // Pattern A (income statement): both discrete and cumulative entries exist.
  //   Discrete entries have 'frame' fields (e.g., CY2026Q1) and ~90 day duration.
  // Pattern B (cash flow statement): only cumulative (YTD) entries exist for Q2/Q3.
  //   Q1 is discrete (~90 days), but Q2 is 6-month cumulative, Q3 is 9-month.
  //   For these, derive discrete = cumulative(Qn) - cumulative(Qn-1).

  const candidates = filtered.filter(u =>
    u.fy === fiscalYear && u.fp === fiscalPeriod && u.start && u.end
  );

  // Also check without form filter
  const allCandidates = candidates.length > 0 ? candidates : units.filter(u =>
    u.fy === fiscalYear && u.fp === fiscalPeriod && u.start && u.end
  );

  if (allCandidates.length === 0) return null;

  // Prefer entries with a 'frame' field (always discrete for income statement items)
  const framed = allCandidates.filter(u => u.frame);
  if (framed.length > 0) {
    return framed[0].val;
  }

  // Pick the shortest duration
  const sorted = [...allCandidates].sort((a, b) => {
    const durA = new Date(a.end!).getTime() - new Date(a.start!).getTime();
    const durB = new Date(b.end!).getTime() - new Date(b.start!).getTime();
    return durA - durB;
  });

  const shortest = sorted[0];
  const durationDays = (new Date(shortest.end!).getTime() - new Date(shortest.start!).getTime()) / (1000 * 60 * 60 * 24);

  // If the shortest entry is ~90 days, it's discrete — return directly
  if (durationDays < 120) {
    return shortest.val;
  }

  // Otherwise it's cumulative. Derive discrete by subtracting the prior period.
  // For Q2: discrete = Q2_cumulative - Q1_value
  // For Q3: discrete = Q3_cumulative - Q2_cumulative
  if (fiscalPeriod === "Q2") {
    const q1Val = getValueForPeriod(units, fiscalYear, "Q1", "duration", formFilter);
    if (q1Val !== null) return shortest.val - q1Val;
  } else if (fiscalPeriod === "Q3") {
    // Q3 cumulative = Q1+Q2+Q3. We need Q2 cumulative (Q1+Q2).
    const q2Cumulative = allCandidates.length > 0 ? null : null; // We need to find Q2 cumulative
    // Find the Q2 cumulative entry (6-month duration)
    const q2Entries = filtered.filter(u =>
      u.fy === fiscalYear && u.fp === "Q2" && u.start && u.end
    );
    if (q2Entries.length > 0) {
      // Get the longest Q2 entry (cumulative)
      q2Entries.sort((a, b) => {
        const durA = new Date(a.end!).getTime() - new Date(a.start!).getTime();
        const durB = new Date(b.end!).getTime() - new Date(b.start!).getTime();
        return durB - durA;
      });
      return shortest.val - q2Entries[0].val;
    }
  }

  // Fallback: return the value as-is (may be cumulative — caller should verify)
  return shortest.val;
}

/**
 * Get the most recent instant/point-in-time value (balance sheet item).
 *
 * SEC EDGAR represents balance sheet items in two ways:
 * - Some have an `instant` field (point-in-time date)
 * - Others have only an `end` field without a `start` field
 * We check both patterns.
 */
export function getLatestInstantValue(units: XbrlUnit[]): { value: number; date: string; accession: string } | null {
  // Find entries that are point-in-time: either instant field exists, or end exists without start
  const instants = units
    .filter((u) => (u.form === "10-K" || u.form === "10-Q") && (u.instant || (u.end && !u.start)))
    .map((u) => ({ val: u.val, date: (u.instant ?? u.end)!, accn: u.accn }))
    .sort((a, b) => (b.date > a.date ? 1 : -1));

  if (instants.length === 0) return null;
  return { value: instants[0].val, date: instants[0].date, accession: instants[0].accn };
}

// ---------------------------------------------------------------------------
// Public API: extract all canonical fields from CompanyFacts
// ---------------------------------------------------------------------------

export interface XbrlExtraction {
  // Duration-based lookups (income statement / cash flow)
  revenueUnits: XbrlUnit[] | null;
  grossProfitUnits: XbrlUnit[] | null;
  operatingIncomeUnits: XbrlUnit[] | null;
  netIncomeUnits: XbrlUnit[] | null;
  epsDilutedUnits: XbrlUnit[] | null;
  epsBasicUnits: XbrlUnit[] | null;
  ocfUnits: XbrlUnit[] | null;
  capexUnits: XbrlUnit[] | null;
  daUnits: XbrlUnit[] | null;
  sbcUnits: XbrlUnit[] | null;
  dividendsPaidUnits: XbrlUnit[] | null;
  buybackUnits: XbrlUnit[] | null;
  dilutedSharesUnits: XbrlUnit[] | null;

  // Instant-based lookups (balance sheet)
  cashUnits: XbrlUnit[] | null;
  shortTermInvestmentsUnits: XbrlUnit[] | null;
  ltInvestmentsUnits: XbrlUnit[] | null;
  currentDebtUnits: XbrlUnit[] | null;
  longTermDebtUnits: XbrlUnit[] | null;
  totalEquityUnits: XbrlUnit[] | null;
  goodwillUnits: XbrlUnit[] | null;
  inventoryUnits: XbrlUnit[] | null;
  receivablesUnits: XbrlUnit[] | null;
  sharesOutstandingUnits: XbrlUnit[] | null;

  // Tags that matched (for provenance)
  matchedTags: Record<string, string>;
  missingFields: string[];
}

export function extractAllXbrl(facts: CompanyFacts): XbrlExtraction {
  const matchedTags: Record<string, string> = {};
  const missingFields: string[] = [];

  function extract(name: string, tags: string[], unitKey = "USD"): XbrlUnit[] | null {
    for (const tag of tags) {
      const concept = facts.facts["us-gaap"]?.[tag] ?? facts.facts["dei"]?.[tag];
      if (!concept) continue;
      const units = concept.units[unitKey];
      if (units && units.length > 0) {
        matchedTags[name] = tag;
        return units;
      }
    }
    missingFields.push(name);
    return null;
  }

  return {
    revenueUnits: extract("revenue", REVENUE_TAGS),
    grossProfitUnits: extract("grossProfit", GROSS_PROFIT_TAGS),
    operatingIncomeUnits: extract("operatingIncome", OPERATING_INCOME_TAGS),
    netIncomeUnits: extract("netIncome", NET_INCOME_TAGS),
    epsDilutedUnits: extract("epsDiluted", EPS_DILUTED_TAGS, "USD/shares"),
    epsBasicUnits: extract("epsBasic", EPS_BASIC_TAGS, "USD/shares"),
    ocfUnits: extract("ocf", OCF_TAGS),
    capexUnits: extract("capex", CAPEX_TAGS),
    daUnits: extract("da", DA_TAGS),
    sbcUnits: extract("sbc", SBC_TAGS),
    dividendsPaidUnits: extract("dividendsPaid", DIVIDENDS_PAID_TAGS),
    buybackUnits: extract("buyback", BUYBACK_TAGS),
    dilutedSharesUnits: extract("dilutedShares", DILUTED_SHARES_TAGS, "shares"),

    cashUnits: extract("cash", CASH_TAGS),
    shortTermInvestmentsUnits: extract("shortTermInvestments", SHORT_TERM_INVESTMENTS_TAGS),
    ltInvestmentsUnits: extract("ltInvestments", LT_INVESTMENTS_TAGS),
    currentDebtUnits: extract("currentDebt", CURRENT_DEBT_TAGS),
    longTermDebtUnits: extract("longTermDebt", LONG_TERM_DEBT_TAGS),
    totalEquityUnits: extract("totalEquity", TOTAL_EQUITY_TAGS),
    goodwillUnits: extract("goodwill", GOODWILL_TAGS),
    inventoryUnits: extract("inventory", INVENTORY_TAGS),
    receivablesUnits: extract("receivables", RECEIVABLES_TAGS),
    sharesOutstandingUnits: extract("sharesOutstanding", SHARES_OUTSTANDING_TAGS, "shares"),

    matchedTags,
    missingFields,
  };
}
