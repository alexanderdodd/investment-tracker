export interface StockValuationInsights {
  // Header
  ticker: string;
  companyName: string;
  sector: string;
  verdict: "Undervalued" | "Fair Value" | "Overvalued" | "Withheld";
  verdictReason: string;
  confidence: "High" | "Medium" | "Low" | "N/A";
  confidenceReason: string;
  currentPrice: number | null;
  intrinsicValue: number | null;
  marginOfSafety: string | null;

  // Headline
  headline: string;

  // Business overview
  businessSummary: string;
  businessModel: string;
  competitivePosition: string;
  industryContext: string;

  // Financial health
  revenueGrowth: string;
  profitability: string;
  cashGeneration: string;
  balanceSheetStrength: string;
  capitalAllocation: string;
  accountingQuality: string;

  // Valuation
  dcfSummary: string;
  multiplesSummary: string;
  peerComparison: string;

  // Risk & scenarios
  bullCase: string;
  baseCase: string;
  bearCase: string;
  keyRisks: { label: string; detail: string }[];
  keyDrivers: { label: string; detail: string }[];
  sensitivityFactors: string[];

  // Watch items
  catalysts: { label: string; detail: string }[];
}

export function parseStockValuationInsights(raw: unknown): StockValuationInsights | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (
    typeof data.ticker !== "string" ||
    typeof data.verdict !== "string" ||
    typeof data.businessSummary !== "string"
  ) {
    return null;
  }
  return raw as StockValuationInsights;
}
