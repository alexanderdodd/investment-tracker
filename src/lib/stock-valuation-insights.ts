export interface StockValuationInsights {
  // Header
  ticker: string;
  companyName: string;
  sector: string;
  verdict: "Undervalued" | "Fair Value" | "Overvalued" | "Withheld";
  verdictReason: string;
  confidence: "High" | "Medium" | "Low" | "N/A";
  confidenceReason: string;
  confidenceChecklist: { label: string; passed: boolean; detail: string }[];
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

  // Sanitize fields that might be objects/unexpected types from older DB rows
  const sanitized = { ...data } as Record<string, unknown>;

  // Ensure string fields are actually strings (not objects)
  for (const key of ["verdictReason", "confidenceReason", "headline", "businessSummary",
    "businessModel", "competitivePosition", "industryContext", "revenueGrowth",
    "profitability", "cashGeneration", "balanceSheetStrength", "capitalAllocation",
    "accountingQuality", "dcfSummary", "multiplesSummary", "peerComparison",
    "bullCase", "baseCase", "bearCase", "marginOfSafety"] as const) {
    const val = sanitized[key];
    if (val !== null && val !== undefined && typeof val !== "string") {
      // If it's an object with a text/content field, extract it
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        sanitized[key] = String(obj.text ?? obj.content ?? obj.summary ?? obj.headline ?? JSON.stringify(val));
      } else {
        sanitized[key] = String(val);
      }
    }
  }

  // Ensure currentPrice and intrinsicValue are numbers or null
  if (sanitized.currentPrice !== null && typeof sanitized.currentPrice !== "number") {
    const parsed = parseFloat(String(sanitized.currentPrice).replace(/[^0-9.-]/g, ""));
    sanitized.currentPrice = isNaN(parsed) ? null : parsed;
  }
  if (sanitized.intrinsicValue !== null && typeof sanitized.intrinsicValue !== "number") {
    const parsed = parseFloat(String(sanitized.intrinsicValue).replace(/[^0-9.-]/g, ""));
    sanitized.intrinsicValue = isNaN(parsed) ? null : parsed;
  }

  // Ensure confidence is a valid string
  if (typeof sanitized.confidence !== "string") {
    sanitized.confidence = "N/A";
  }

  // Ensure array fields are arrays
  for (const key of ["keyRisks", "keyDrivers", "sensitivityFactors", "catalysts", "confidenceChecklist"] as const) {
    if (!Array.isArray(sanitized[key])) {
      sanitized[key] = [];
    }
  }

  return sanitized as unknown as StockValuationInsights;
}
