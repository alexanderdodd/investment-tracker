import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  gicsIndustries,
  stockClassifications,
  stockValuations,
  industryAnalytics,
  valueCandidates,
} from "../db/schema";
import { fetchStockMetrics, type StockMetrics } from "./stock-metrics";
import { parseStockValuationInsights, type StockValuationInsights } from "./stock-valuation-insights";
import { GICS_SECTORS, type GicsSectorDef } from "./gics-taxonomy";
import type { SectorName } from "./sectors";

// ─── Types ─────────────────────────────────────────────────────────────────

type CandidateClass = "validated_value" | "possible_value" | "value_trap_risk" | "not_attractive";
type ValuationLabel = "cheap" | "fair" | "expensive" | "withheld";
type PeerQuality = "strong" | "medium" | "weak" | "unknown";
type TrapRisk = "LOW" | "MEDIUM" | "HIGH";

interface CandidateResult {
  ticker: string;
  companyName: string;
  industryId: string;
  sectorId: string;
  candidateClass: CandidateClass;
  valuationLabel: ValuationLabel;
  valuationConfidence: number;
  peerQuality: PeerQuality;
  trapRisk: TrapRisk;
  score: number;
  reasonsFor: string[];
  reasonsAgainst: string[];
  hasValuationArtifact: boolean;
}

// ─── Valuation label mapping ───────────────────────────────────────────────

function verdictToLabel(verdict: string): ValuationLabel {
  switch (verdict) {
    case "Undervalued": return "cheap";
    case "Fair Value": return "fair";
    case "Overvalued": return "expensive";
    default: return "withheld";
  }
}

function confidenceToNumber(conf: string): number {
  switch (conf) {
    case "High": return 0.80;
    case "Medium": return 0.60;
    case "Low": return 0.40;
    default: return 0;
  }
}

// ─── Peer quality from valuation insights ──────────────────────────────────

function assessPeerQuality(insights: StockValuationInsights | null): PeerQuality {
  if (!insights) return "unknown";
  const peers = insights.peerDetails ?? [];
  if (peers.length === 0) return "unknown";

  const primaryPeers = peers.filter((p) => p.role === "primary");
  const avgQuality = peers.reduce((sum, p) => sum + (p.qualityScore ?? 0), 0) / peers.length;

  // Quality scores from valuation pipeline are 0-1 scale (not 0-10)
  if (primaryPeers.length >= 2 && avgQuality >= 0.7) return "strong";
  if (primaryPeers.length >= 1 && avgQuality >= 0.5) return "medium";
  return "weak";
}

// ─── Trap risk assessment ──────────────────────────────────────────────────

function assessTrapRisk(
  metrics: StockMetrics | undefined,
  insights: StockValuationInsights | null,
  cyclicality: string
): { risk: TrapRisk; reasons: string[] } {
  const reasons: string[] = [];
  let riskScore = 0;

  if (!metrics) {
    return { risk: "HIGH", reasons: ["No market data available"] };
  }

  // Negative operating margin
  if (metrics.operatingMargin !== null && metrics.operatingMargin < 0) {
    riskScore += 2;
    reasons.push("Negative operating margin");
  }

  // Very low or negative FCF
  // Defensive industries (utilities, staples) routinely show negative FCF
  // due to regulated capex programs — penalize less than cyclical/growth
  if (metrics.freeCashFlow !== null && metrics.freeCashFlow < 0) {
    if (cyclicality === "defensive") {
      riskScore += 1;
      reasons.push("Negative free cash flow (common in regulated/capital-intensive industries)");
    } else {
      riskScore += 2;
      reasons.push("Negative free cash flow");
    }
  }

  // Very low ROIC suggests poor capital allocation
  if (metrics.roic !== null && metrics.roic < 0.02) {
    riskScore += 1;
    reasons.push("Very low return on invested capital");
  }

  // Extremely high EV/EBITDA in a cyclical industry (potential cycle peak)
  if (cyclicality === "hyper_cyclical" && metrics.evToEbitda !== null && metrics.evToEbitda > 25) {
    riskScore += 1;
    reasons.push("High EV/EBITDA in hyper-cyclical industry — possible peak earnings");
  }

  // No valuation artifact means we can't verify the thesis
  if (!insights) {
    riskScore += 1;
    reasons.push("No valuation artifact to validate thesis");
  }

  // Valuation withheld
  if (insights && insights.verdict === "Withheld") {
    riskScore += 2;
    reasons.push("Stock valuation withheld by quality gate");
  }

  if (riskScore >= 3) return { risk: "HIGH", reasons };
  if (riskScore >= 1) return { risk: "MEDIUM", reasons };
  return { risk: "LOW", reasons };
}

// ─── Candidate classification ──────────────────────────────────────────────

function classifyCandidate(
  valuationLabel: ValuationLabel,
  confidence: number,
  peerQuality: PeerQuality,
  trapRisk: TrapRisk,
  hasArtifact: boolean
): CandidateClass {
  // CAND-001: validated requires artifact
  // CAND-002: validated requires label != withheld
  // CAND-003: validated requires peer quality >= medium
  // CAND-004: trap risk HIGH blocks validated
  if (
    valuationLabel === "cheap" &&
    confidence >= 0.60 &&
    (peerQuality === "strong" || peerQuality === "medium") &&
    trapRisk !== "HIGH" &&
    hasArtifact
  ) {
    return "validated_value";
  }

  // Possible value: cheap or fair, some confidence, not terrible
  if (
    (valuationLabel === "cheap" || valuationLabel === "fair") &&
    confidence >= 0.40 &&
    trapRisk !== "HIGH" &&
    hasArtifact
  ) {
    return "possible_value";
  }

  // Value trap: optically cheap but high risk
  if (valuationLabel === "cheap" && trapRisk === "HIGH") {
    return "value_trap_risk";
  }

  // Everything else
  return "not_attractive";
}

// ─── Score computation ─────────────────────────────────────────────────────

function computeScore(
  valuationLabel: ValuationLabel,
  confidence: number,
  peerQuality: PeerQuality,
  trapRisk: TrapRisk,
  metrics: StockMetrics | undefined
): number {
  let score = 0;

  // Valuation label
  if (valuationLabel === "cheap") score += 30;
  else if (valuationLabel === "fair") score += 15;

  // Confidence
  score += confidence * 25;

  // Peer quality
  if (peerQuality === "strong") score += 15;
  else if (peerQuality === "medium") score += 10;
  else if (peerQuality === "weak") score += 3;

  // Trap risk penalty
  if (trapRisk === "HIGH") score -= 20;
  else if (trapRisk === "MEDIUM") score -= 5;

  // Metrics bonus
  if (metrics) {
    if (metrics.operatingMargin !== null && metrics.operatingMargin > 0.15) score += 5;
    if (metrics.roic !== null && metrics.roic > 0.10) score += 5;
    if (metrics.freeCashFlow !== null && metrics.freeCashFlow > 0) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Reasons builder ───────────────────────────────────────────────────────

function buildReasons(
  valuationLabel: ValuationLabel,
  confidence: number,
  peerQuality: PeerQuality,
  metrics: StockMetrics | undefined,
  insights: StockValuationInsights | null
): { reasonsFor: string[]; reasonsAgainst: string[] } {
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  if (valuationLabel === "cheap") reasonsFor.push("Stock appears undervalued by valuation model");
  if (valuationLabel === "fair") reasonsFor.push("Stock near fair value — potential upside in right conditions");
  if (valuationLabel === "expensive") reasonsAgainst.push("Stock appears overvalued");
  if (valuationLabel === "withheld") reasonsAgainst.push("Valuation withheld — insufficient data or quality");

  if (confidence >= 0.60) reasonsFor.push(`Valuation confidence ${(confidence * 100).toFixed(0)}%`);
  else if (confidence > 0) reasonsAgainst.push(`Low valuation confidence ${(confidence * 100).toFixed(0)}%`);

  if (peerQuality === "strong") reasonsFor.push("Strong peer comparison set");
  if (peerQuality === "medium") reasonsFor.push("Adequate peer comparison set");
  if (peerQuality === "weak") reasonsAgainst.push("Weak peer comparison — less reliable relative valuation");
  if (peerQuality === "unknown") reasonsAgainst.push("No peer data available");

  if (metrics?.operatingMargin !== null && metrics?.operatingMargin !== undefined && metrics.operatingMargin > 0.15) {
    reasonsFor.push(`Healthy operating margin (${(metrics.operatingMargin * 100).toFixed(1)}%)`);
  }
  if (metrics?.freeCashFlow !== null && metrics?.freeCashFlow !== undefined && metrics.freeCashFlow > 0) {
    reasonsFor.push("Positive free cash flow");
  }

  if (insights?.marginOfSafety) {
    reasonsFor.push(`Margin of safety: ${insights.marginOfSafety}`);
  }

  return { reasonsFor, reasonsAgainst };
}

// ─── Main generation ───────────────────────────────────────────────────────

function sectorNameToGics(name: string): GicsSectorDef | undefined {
  return GICS_SECTORS.find((s) => s.name === name);
}

export async function generateValueCandidates(onlySector?: SectorName) {
  const db = getDb();
  const results: { ticker: string; industry: string; candidateClass: string; success: boolean; error?: string }[] = [];

  const targetSectors = onlySector
    ? [sectorNameToGics(onlySector)].filter(Boolean) as GicsSectorDef[]
    : GICS_SECTORS;

  for (const gicsSector of targetSectors) {
    const sectorId = `sector-${gicsSector.code}`;

    // Get industries with analytics for this sector
    const industries = await db
      .select()
      .from(gicsIndustries)
      .where(eq(gicsIndustries.sectorId, sectorId));

    // Get latest analytics
    const allAnalytics = await db
      .select()
      .from(industryAnalytics)
      .where(eq(industryAnalytics.sectorId, sectorId));

    const latestAnalytics: Record<string, typeof allAnalytics[0]> = {};
    for (const a of allAnalytics) {
      const existing = latestAnalytics[a.industryId];
      if (!existing || a.generatedAt > existing.generatedAt) {
        latestAnalytics[a.industryId] = a;
      }
    }

    // Get all stocks for this sector
    const allStocks = await db
      .select()
      .from(stockClassifications)
      .where(eq(stockClassifications.sectorId, sectorId));

    if (allStocks.length === 0) continue;

    // Fetch metrics for all stocks
    const tickers = allStocks.map((s) => s.ticker);
    let allMetrics: Record<string, StockMetrics> = {};
    try {
      allMetrics = await fetchStockMetrics(tickers);
    } catch {
      continue;
    }

    // Get latest valuation artifacts for all stocks
    const valuationMap: Record<string, StockValuationInsights | null> = {};
    const hasArtifactMap: Record<string, boolean> = {};
    for (const stock of allStocks) {
      const valuations = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.ticker, stock.ticker))
        .orderBy(desc(stockValuations.generatedAt))
        .limit(1);

      if (valuations.length > 0 && valuations[0].structuredInsights) {
        valuationMap[stock.ticker] = parseStockValuationInsights(valuations[0].structuredInsights);
        hasArtifactMap[stock.ticker] = true;
      } else {
        valuationMap[stock.ticker] = null;
        hasArtifactMap[stock.ticker] = false;
      }
    }

    // Process each industry
    for (const industry of industries) {
      const analytics = latestAnalytics[industry.id];
      const industryStocks = allStocks.filter((s) => s.industryId === industry.id);

      if (industryStocks.length === 0) continue;

      // Step 2: Only generate candidates in ATTRACTIVE or MIXED industries
      const state = analytics?.industryState ?? "WITHHELD";
      const eligibleForCandidates = state === "ATTRACTIVE_HUNTING_GROUND" || state === "MIXED";

      const candidatesForIndustry: CandidateResult[] = [];

      for (const stock of industryStocks) {
        const metrics = allMetrics[stock.ticker];
        const insights = valuationMap[stock.ticker];
        const hasArtifact = hasArtifactMap[stock.ticker] ?? false;

        // Determine valuation label from artifact or from metrics
        let valuationLabel: ValuationLabel;
        let confidence: number;

        if (insights) {
          valuationLabel = verdictToLabel(insights.verdict);
          confidence = confidenceToNumber(insights.confidence);
        } else {
          // No artifact — use metrics heuristic
          valuationLabel = deriveValuationFromMetrics(metrics, industry.cyclicalityClass);
          confidence = 0.30; // Low confidence without artifact
        }

        const peerQuality = assessPeerQuality(insights);
        const { risk: trapRisk, reasons: trapReasons } = assessTrapRisk(
          metrics, insights, industry.cyclicalityClass
        );

        // Classify
        let candidateClass: CandidateClass;
        if (eligibleForCandidates) {
          candidateClass = classifyCandidate(valuationLabel, confidence, peerQuality, trapRisk, hasArtifact);
        } else {
          // In non-eligible industries, force not_attractive or trap_risk
          candidateClass = trapRisk === "HIGH" ? "value_trap_risk" : "not_attractive";
        }

        const score = computeScore(valuationLabel, confidence, peerQuality, trapRisk, metrics);
        const { reasonsFor, reasonsAgainst } = buildReasons(
          valuationLabel, confidence, peerQuality, metrics, insights
        );

        if (trapReasons.length > 0) {
          reasonsAgainst.push(...trapReasons);
        }

        candidatesForIndustry.push({
          ticker: stock.ticker,
          companyName: stock.companyName,
          industryId: industry.id,
          sectorId: sectorId,
          candidateClass,
          valuationLabel,
          valuationConfidence: confidence,
          peerQuality,
          trapRisk,
          score,
          reasonsFor,
          reasonsAgainst,
          hasValuationArtifact: hasArtifact,
        });

        results.push({
          ticker: stock.ticker,
          industry: industry.name,
          candidateClass,
          success: true,
        });
      }

      // Store candidates
      const batchTime = new Date();
      for (const c of candidatesForIndustry) {
        // Delete existing candidate for this ticker
        await db.delete(valueCandidates).where(eq(valueCandidates.ticker, c.ticker));
        await db.insert(valueCandidates).values({
          ticker: c.ticker,
          companyName: c.companyName,
          sectorId: c.sectorId,
          industryId: c.industryId,
          candidateClass: c.candidateClass,
          valuationLabel: c.valuationLabel,
          valuationConfidence: c.valuationConfidence,
          peerQuality: c.peerQuality,
          trapRisk: c.trapRisk,
          score: c.score,
          reasonsFor: c.reasonsFor,
          reasonsAgainst: c.reasonsAgainst,
          hasValuationArtifact: c.hasValuationArtifact ? 1 : 0,
          generatedAt: batchTime,
        });
      }

      // Update industry analytics candidate counts
      if (analytics) {
        const validated = candidatesForIndustry.filter((c) => c.candidateClass === "validated_value").length;
        const possible = candidatesForIndustry.filter((c) => c.candidateClass === "possible_value").length;
        const trap = candidatesForIndustry.filter((c) => c.candidateClass === "value_trap_risk").length;

        await db
          .update(industryAnalytics)
          .set({
            candidateCountValidated: validated,
            candidateCountPossible: possible,
            candidateCountTrapRisk: trap,
          })
          .where(eq(industryAnalytics.id, analytics.id));
      }
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

// Heuristic valuation when no artifact exists
function deriveValuationFromMetrics(
  metrics: StockMetrics | undefined,
  cyclicality: string
): ValuationLabel {
  if (!metrics) return "withheld";

  const pe = metrics.forwardPE;
  const ev = metrics.evToEbitda;

  if (pe === null && ev === null) return "withheld";

  const cheapPe = cyclicality === "hyper_cyclical" ? 10 : 15;
  const expPe = cyclicality === "hyper_cyclical" ? 20 : 22;

  let cheapSignals = 0;
  let expSignals = 0;

  if (pe !== null) {
    if (pe < cheapPe) cheapSignals++;
    else if (pe > expPe) expSignals++;
  }
  if (ev !== null) {
    if (ev < 10) cheapSignals++;
    else if (ev > 16) expSignals++;
  }

  if (cheapSignals > 0 && expSignals === 0) return "cheap";
  if (expSignals > 0 && cheapSignals === 0) return "expensive";
  return "fair";
}
