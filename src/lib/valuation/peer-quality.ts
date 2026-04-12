/**
 * Peer quality scoring module.
 *
 * Scores each peer candidate based on SIC match level, market cap proximity,
 * data quality, and filing recency. Computes registry-level confidence.
 *
 * See: .claude/features/peer-registry-creation/04-quality-scoring.md
 */

import type { PeerCandidate } from "./peer-discovery";
import type { PeerMultiples } from "./peer-multiples";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerQualityScore {
  ticker: string;
  qualityScore: number; // 0-1
  factors: {
    sicMatch: number;
    grossMarginSimilarity: number;
    mcapProximity: number;
    dataQuality: number;
  };
  role: "primary" | "secondary";
  qualityPenalty: number; // 1 - qualityScore
  /** Whether this peer was filtered out for being too dissimilar */
  filtered: boolean;
  filterReason?: string;
}

export interface RegistryQuality {
  overallConfidence: number; // 0-0.85
  peerCount: number;
  usablePeerCount: number;
  averagePeerQuality: number;
  qualityTier: "strong" | "medium" | "weak";
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Per-peer scoring
// ---------------------------------------------------------------------------

function scoreSicMatch(matchLevel: PeerCandidate["matchLevel"]): number {
  switch (matchLevel) {
    case "sic_4digit": return 1.0;
    case "curated_add": return 0.6;
    case "sic_3digit": return 0.7;
    default: return 0.3;
  }
}

function scoreMcapProximity(peerCap: number | null, subjectCap: number): number {
  if (!peerCap || subjectCap <= 0) return 0.3;
  const ratio = Math.min(peerCap, subjectCap) / Math.max(peerCap, subjectCap);
  if (ratio >= 0.5) return 1.0;
  if (ratio >= 0.2) return 0.7;
  if (ratio >= 0.1) return 0.4;
  return 0.2;
}

function scoreDataQuality(multiples: PeerMultiples): number {
  if (multiples.source === "pipeline") return 1.0;
  if (multiples.source === "market_data" && multiples.usableMultipleCount >= 2) return 0.8;
  if (multiples.source === "market_data") return 0.6;
  return 0.2;
}

function scoreGrossMarginSimilarity(peerGM: number | null, subjectGM: number | null): number {
  if (peerGM === null || subjectGM === null) return 0.5; // unknown — neutral
  const diff = Math.abs(peerGM - subjectGM);
  // Closer margins = more similar business model
  if (diff <= 0.05) return 1.0;  // within 5pp
  if (diff <= 0.10) return 0.85; // within 10pp
  if (diff <= 0.15) return 0.65; // within 15pp
  if (diff <= 0.20) return 0.40; // within 20pp
  return 0.15; // >20pp — very different business model
}

export function scorePeer(
  candidate: PeerCandidate,
  multiples: PeerMultiples,
  subjectMarketCap: number,
  subjectGrossMargin?: number | null
): PeerQualityScore {
  const sicMatch = scoreSicMatch(candidate.matchLevel);
  const grossMarginSim = scoreGrossMarginSimilarity(multiples.grossMargin, subjectGrossMargin ?? null);
  const mcapProximity = scoreMcapProximity(candidate.marketCap ?? multiples.marketCap, subjectMarketCap);
  const dataQuality = scoreDataQuality(multiples);

  // Hard filter: >20 percentage point gross margin difference
  if (multiples.grossMargin !== null && subjectGrossMargin !== null && subjectGrossMargin !== undefined) {
    const diff = Math.abs(multiples.grossMargin - subjectGrossMargin);
    if (diff > 0.20) {
      return {
        ticker: candidate.ticker,
        qualityScore: 0,
        factors: { sicMatch, grossMarginSimilarity: grossMarginSim, mcapProximity, dataQuality },
        role: "secondary",
        qualityPenalty: 1,
        filtered: true,
        filterReason: `Gross margin too different: peer ${(multiples.grossMargin * 100).toFixed(0)}% vs subject ${(subjectGrossMargin * 100).toFixed(0)}% (>${(diff * 100).toFixed(0)}pp gap)`,
      };
    }
  }

  // Weighted composite per DECISION-003:
  // Gross margin similarity 30%, SIC 25%, market cap 20%, data quality 25%
  const qualityScore = 0.30 * grossMarginSim + 0.25 * sicMatch + 0.20 * mcapProximity + 0.25 * dataQuality;

  return {
    ticker: candidate.ticker,
    qualityScore,
    factors: { sicMatch, grossMarginSimilarity: grossMarginSim, mcapProximity, dataQuality },
    role: qualityScore >= 0.6 ? "primary" : "secondary",
    qualityPenalty: 1 - qualityScore,
    filtered: false,
  };
}

// ---------------------------------------------------------------------------
// Registry-level confidence
// ---------------------------------------------------------------------------

export function computeRegistryQuality(
  scores: PeerQualityScore[],
  multiples: PeerMultiples[]
): RegistryQuality {
  const reasons: string[] = [];
  const usablePeers = multiples.filter(m => m.usableMultipleCount >= 1);
  const avgQuality = scores.length > 0
    ? scores.reduce((s, p) => s + p.qualityScore, 0) / scores.length
    : 0;

  let confidence = 0.70; // base

  // Peer count adjustment
  if (usablePeers.length >= 5) {
    confidence += 0.10;
    reasons.push(`${usablePeers.length} usable peers — strong coverage`);
  } else if (usablePeers.length >= 3) {
    reasons.push(`${usablePeers.length} usable peers — adequate coverage`);
  } else if (usablePeers.length >= 1) {
    confidence -= 0.15;
    reasons.push(`Only ${usablePeers.length} usable peer(s) — limited coverage`);
  } else {
    confidence -= 0.40;
    reasons.push("No usable peers with multiples data");
  }

  // Average quality adjustment
  if (avgQuality >= 0.7) {
    confidence += 0.05;
  } else if (avgQuality < 0.5) {
    confidence -= 0.10;
    reasons.push(`Average peer quality is low (${(avgQuality * 100).toFixed(0)}%) — peers may not be highly comparable`);
  }

  // Data source adjustment
  const allPipeline = multiples.every(m => m.source === "pipeline");
  const allMarketData = multiples.every(m => m.source === "market_data" || m.source === "fallback");
  if (allPipeline) {
    confidence += 0.05;
  } else if (allMarketData) {
    confidence -= 0.10;
    reasons.push("All peer multiples from market data — not pipeline-validated");
  }

  // SIC coverage
  const sic4Count = scores.filter(s => {
    // check if score factors suggest 4-digit match
    return s.factors.sicMatch >= 0.9;
  }).length;
  if (sic4Count >= 3) {
    confidence += 0.05;
  } else if (sic4Count === 0) {
    confidence -= 0.10;
    reasons.push("No exact 4-digit SIC matches — peers are from broader industry group");
  }

  // Cap at 0.85
  confidence = Math.max(0, Math.min(0.85, confidence));

  const qualityTier: RegistryQuality["qualityTier"] =
    confidence >= 0.65 ? "strong" : confidence >= 0.45 ? "medium" : "weak";

  if (reasons.length === 0) {
    reasons.push("Peer set has good coverage and quality");
  }

  return {
    overallConfidence: confidence,
    peerCount: scores.length,
    usablePeerCount: usablePeers.length,
    averagePeerQuality: avgQuality,
    qualityTier,
    reasons,
  };
}
