export interface SectorInsights {
  // Header
  stanceShortTerm: "Positive" | "Neutral" | "Cautious";
  stanceShortTermReason: string;
  stanceLongTerm: "Positive" | "Neutral" | "Cautious";
  stanceLongTermReason: string;
  valuation: "Cheap" | "Fair" | "Expensive";
  valuationReason: string;
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  forwardPE: number | null;

  // Overview tab
  headline: string;
  performanceSummary: string;
  topDrivers: { label: string; detail: string }[];
  topRisks: { label: string; detail: string }[];
  watchItems: { label: string; detail: string }[];

  // Learn tab
  whatHappened: string;
  sectorComposition: string;
  whyItHappened: {
    macro: string[];
    fundamentals: string[];
    sentiment: string[];
  };
  valuationAssessment: string;
  whatNext: {
    opportunities: string[];
    risks: string[];
  };

  // Position tab
  thesis: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  scenarios: {
    bull: string;
    base: string;
    bear: string;
  };
  triggers: string[];
}

export function parseSectorInsights(raw: unknown): SectorInsights | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  // Validate required top-level fields exist
  if (
    typeof data.stanceShortTerm !== "string" ||
    typeof data.stanceLongTerm !== "string" ||
    typeof data.valuation !== "string" ||
    typeof data.confidence !== "string" ||
    typeof data.thesis !== "string"
  ) {
    return null;
  }

  return raw as SectorInsights;
}
