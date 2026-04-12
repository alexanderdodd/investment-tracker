/**
 * Core types for the v2 deterministic valuation pipeline.
 */

export interface ProvenancedValue {
  value: number | null;
  unit: string;
  period: string;
  asOf: string;
  sourceType: "SEC_XBRL" | "MARKET_DATA" | "COMPUTED" | "FILING_TEXT" | "LLM_EXTRACTED";
  sourceRef: string;
  method: string;
}

export function pv(
  value: number | null,
  unit: string,
  period: string,
  asOf: string,
  sourceType: ProvenancedValue["sourceType"],
  sourceRef: string,
  method: string
): ProvenancedValue {
  return { value, unit, period, asOf, sourceType, sourceRef, method };
}

export interface CanonicalFacts {
  ticker: string;
  companyName: string;
  cik: string;
  sic: string;
  sector: string;
  industry: string;
  fiscalYearEnd: string;

  latestAnnualFiling: { accession: string; periodEnd: string; filedDate: string } | null;
  latestQuarterlyFiling: { accession: string; periodEnd: string; filedDate: string } | null;

  // Market data
  currentPrice: ProvenancedValue;
  sharesOutstanding: ProvenancedValue;
  marketCap: ProvenancedValue;
  enterpriseValue: ProvenancedValue;
  beta: ProvenancedValue;

  // TTM financials
  ttmRevenue: ProvenancedValue;
  ttmGrossProfit: ProvenancedValue;
  ttmOperatingIncome: ProvenancedValue;
  ttmNetIncome: ProvenancedValue;
  ttmDilutedEPS: ProvenancedValue;
  ttmOCF: ProvenancedValue;
  ttmCapex: ProvenancedValue;
  ttmFCF: ProvenancedValue;
  ttmDA: ProvenancedValue;
  ttmSBC: ProvenancedValue;
  ttmDividendsPaid: ProvenancedValue;
  ttmBuybacks: ProvenancedValue;
  ttmDilutedShares: ProvenancedValue;
  quartersUsed: string;

  // Latest quarter
  latestQuarterRevenue: ProvenancedValue;
  latestQuarterGrossMargin: ProvenancedValue;
  latestQuarterOperatingMargin: ProvenancedValue;
  latestQuarterNetMargin: ProvenancedValue;

  // Balance sheet
  cash: ProvenancedValue;
  shortTermInvestments: ProvenancedValue;
  totalCashAndInvestments: ProvenancedValue;
  currentDebt: ProvenancedValue;
  longTermDebt: ProvenancedValue;
  totalDebt: ProvenancedValue;
  totalEquity: ProvenancedValue;
  goodwill: ProvenancedValue;
  inventory: ProvenancedValue;
  receivables: ProvenancedValue;
  bookValuePerShare: ProvenancedValue;

  // Derived valuation metrics
  trailingPE: ProvenancedValue;
  priceToBook: ProvenancedValue;
  evToRevenue: ProvenancedValue;

  // Historical context
  annualHistory: {
    year: number;
    revenue: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
  }[];
  fiveYearAvgGrossMargin: ProvenancedValue;
  fiveYearAvgOperatingMargin: ProvenancedValue;

  // Dividend
  annualDividendPerShare: ProvenancedValue;
  dividendYield: ProvenancedValue;

  // Data quality
  xbrlMatchedTags: Record<string, string>;
  missingFields: string[];
  dataQualityNotes: string[];
}

// ---------------------------------------------------------------------------
// Financial analysis outputs (Phase 3)
// ---------------------------------------------------------------------------

export interface FinancialModelOutputs {
  revenueGrowth: { period: string; value: number }[];
  marginTrends: { period: string; gross: number | null; operating: number | null; net: number | null }[];
  cashConversionRatio: number | null;
  roe: number | null;
  roic: number | null;
  debtToEquity: number | null;
  debtToEbitda: number | null;
  interestCoverage: number | null;
  dividendPayoutRatio: number | null;
  buybackYield: number | null;
  capexIntensity: number | null;
  sbcAsPercentOfRevenue: number | null;
  cycleState: "trough" | "below_mid" | "mid_cycle" | "above_mid" | "peak" | "unknown";
  cycleConfidence: number;
  normalizedRevenue: number | null;
  normalizedOperatingMargin: number | null;
  normalizedFCF: number | null;
}

// ---------------------------------------------------------------------------
// Valuation outputs (Phase 4)
// ---------------------------------------------------------------------------

export interface DcfOutputs {
  baseYearFCF: number;
  normalized: boolean;
  growthRates: number[];
  projectedFCF: { year: number; fcf: number; pv: number }[];
  terminalGrowth: number;
  terminalValue: number;
  pvTerminal: number;
  wacc: number;
  waccDerivation: {
    riskFreeRate: number;
    equityRiskPremium: number;
    beta: number;
    costOfEquity: number;
    costOfDebt: number;
    taxRate: number;
    debtWeight: number;
    equityWeight: number;
  };
  enterpriseValue: number;
  equityValue: number;
  perShareValue: number;
  sensitivityGrid: { wacc: number; terminalGrowth: number; perShareValue: number }[];
}

export interface MultiplesOutputs {
  current: {
    pe: number | null;
    pb: number | null;
    evEbitda: number | null;
    evRevenue: number | null;
    evFcf: number | null;
  };
  historicalRange: { metric: string; low: number; median: number; high: number; current: number }[];
}

export interface ReverseDcfOutputs {
  impliedRevenueGrowth: number | null;
  impliedOperatingMargin: number | null;
  interpretation: string;
}

export interface ValuationOutputs {
  dcf: DcfOutputs | null;
  multiples: MultiplesOutputs;
  reverseDcf: ReverseDcfOutputs | null;
  scenarios: {
    bull: { perShareValue: number; assumptions: string };
    base: { perShareValue: number; assumptions: string };
    bear: { perShareValue: number; assumptions: string };
  } | null;
  verdict: "Undervalued" | "Fair Value" | "Overvalued" | "Highly Uncertain";
  confidenceScore: number;
  intrinsicValueRange: { low: number; mid: number; high: number } | null;
  marginOfSafety: number | null;
}

// ---------------------------------------------------------------------------
// QA outputs (Phase 5)
// ---------------------------------------------------------------------------

export interface QaIssue {
  location: string;
  error: string;
  correctValue: string;
  severity: "high" | "medium" | "low";
}

export type PublishGateStatus =
  | "WITHHOLD_ALL"
  | "PUBLISH_FACTS_ONLY"
  | "PUBLISH_WITH_WARNINGS"
  | "PUBLISH_FULL";

export interface GateDecision {
  status: PublishGateStatus;
  factsPublishable: boolean;
  valuationPublishable: boolean;
  /** Null when valuation is withheld */
  valuationConfidence: number | null;
  factsGateFailures: string[];
  valuationGateFailures: string[];
}

export interface QaReport {
  issues: QaIssue[];
  passed: boolean;
  /** @deprecated Use gateDecision.status instead */
  status: "published" | "withheld" | "published_with_warnings";
  gateDecision: GateDecision;
}

// ---------------------------------------------------------------------------
// Industry framework (Phase 3-4)
// ---------------------------------------------------------------------------

export interface IndustryFramework {
  type: string;
  primaryMethods: string[];
  secondaryMethods: string[];
  disallowedPeers: string[];
  normalizationRules: string;
  keyMetrics: string[];
  cycleRelevant: boolean;
}
