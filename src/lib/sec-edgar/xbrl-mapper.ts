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
const SHORT_TERM_INVESTMENTS_TAGS = ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"];
const CURRENT_DEBT_TAGS = ["ShortTermBorrowings", "LongTermDebtCurrent", "DebtCurrent"];
const LONG_TERM_DEBT_TAGS = ["LongTermDebtNoncurrent", "LongTermDebt"];
const TOTAL_EQUITY_TAGS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const GOODWILL_TAGS = ["Goodwill"];
const INVENTORY_TAGS = ["InventoryNet"];
const RECEIVABLES_TAGS = ["AccountsReceivableNetCurrent", "AccountsReceivableNet", "ReceivablesNetCurrent"];
const SHARES_OUTSTANDING_TAGS = ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"];
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
 * Get the value for a specific fiscal period from XBRL units.
 * For duration facts (income statement, cash flow): match on fp + fy.
 * For instant facts (balance sheet): match on frame or end date.
 */
export function getValueForPeriod(
  units: XbrlUnit[],
  fiscalYear: number,
  fiscalPeriod: string, // "Q1", "Q2", "Q3", "FY"
  periodType: PeriodFilter = "duration",
  formFilter?: string
): number | null {
  // Filter to 10-K and 10-Q forms to avoid duplicates from earnings releases
  const filtered = units.filter((u) => {
    if (formFilter) return u.form === formFilter;
    return u.form === "10-K" || u.form === "10-Q";
  });

  for (const u of filtered) {
    if (u.fy === fiscalYear && u.fp === fiscalPeriod) {
      if (periodType === "instant" && u.instant) return u.val;
      if (periodType === "duration" && u.start && u.end) return u.val;
    }
  }

  // Fallback: try without form filter
  for (const u of units) {
    if (u.fy === fiscalYear && u.fp === fiscalPeriod) {
      if (periodType === "instant" && u.instant) return u.val;
      if (periodType === "duration" && u.start && u.end) return u.val;
    }
  }

  return null;
}

/**
 * Get the most recent instant value (balance sheet item).
 */
export function getLatestInstantValue(units: XbrlUnit[]): { value: number; date: string; accession: string } | null {
  const instants = units
    .filter((u) => u.instant && (u.form === "10-K" || u.form === "10-Q"))
    .sort((a, b) => (b.instant! > a.instant! ? 1 : -1));

  if (instants.length === 0) return null;
  return { value: instants[0].val, date: instants[0].instant!, accession: instants[0].accn };
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
