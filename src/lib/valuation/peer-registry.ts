/**
 * Peer registry module.
 *
 * Provides both curated (static) and dynamic (SIC-based) peer registries.
 * Dynamic registries are built via peer-discovery + peer-multiples + peer-quality.
 * Curated registries take priority when they exist.
 *
 * See: .claude/features/peer-registry-creation/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerEntry {
  ticker: string;
  name: string;
  role: "memory_primary" | "memory_primary_conglomerate" | "storage_adjacent" | "self_history";
  publicDataUsable: boolean;
  /** Weighting penalty (0 = no penalty, 1 = fully discounted) */
  qualityPenalty: number;
  notes: string;
  /** Curated multiples for peers without pipeline data */
  curatedMultiples?: {
    asOf: string;
    evEbitda: number | null;
    evRevenue: number | null;
    priceToBook: number | null;
    trailingPe: number | null;
    source: string;
  };
}

export interface PeerRegistry {
  subjectTicker: string;
  framework: string;
  effectiveDate: string;
  version: string;
  primaryPeers: PeerEntry[];
  secondaryPeers: PeerEntry[];
  selfHistoryAllowed: boolean;
  relativeMetrics: string[];
  weights: {
    primaryPeers: number;
    secondaryPeers: number;
  };
  caveats: string[];
}

export interface RelativeValuationResult {
  method: "relative_valuation";
  peerRegistryVersion: string;
  perShareValues: { metric: string; value: number; weight: number; source: string }[];
  weightedPerShare: number;
  confidence: number;
  caveats: string[];
}

// ---------------------------------------------------------------------------
// Curated registries
// ---------------------------------------------------------------------------

const MU_PEER_REGISTRY: PeerRegistry = {
  subjectTicker: "MU",
  framework: "cyclical_semiconductor_memory_v1",
  effectiveDate: "2026-04-12",
  version: "1.0.0",
  primaryPeers: [
    {
      ticker: "000660.KS",
      name: "SK hynix",
      role: "memory_primary",
      publicDataUsable: true,
      qualityPenalty: 0.1, // Korean disclosure differences
      notes: "Direct DRAM/NAND peer. Most comparable pure-play memory company.",
      curatedMultiples: {
        asOf: "2026-04-12",
        evEbitda: 5.8,
        evRevenue: 2.9,
        priceToBook: 2.1,
        trailingPe: 8.5,
        source: "Bloomberg/Reuters consensus 2026-Q1",
      },
    },
    {
      ticker: "005930.KS",
      name: "Samsung Electronics",
      role: "memory_primary_conglomerate",
      publicDataUsable: true,
      qualityPenalty: 0.45, // Conglomerate discount — memory is ~60% of operating profit
      notes: "Memory is dominant but mixed with foundry, mobile, display. Use with conglomerate penalty.",
      curatedMultiples: {
        asOf: "2026-04-12",
        evEbitda: 7.2,
        evRevenue: 1.8,
        priceToBook: 1.4,
        trailingPe: 14.2,
        source: "Bloomberg/Reuters consensus 2026-Q1",
      },
    },
  ],
  secondaryPeers: [
    {
      ticker: "WDC",
      name: "Western Digital",
      role: "storage_adjacent",
      publicDataUsable: true,
      qualityPenalty: 0.25, // NAND-only overlap, HDD business dilutes comparability
      notes: "NAND flash peer after spin-off. HDD business reduces direct comparability.",
      curatedMultiples: {
        asOf: "2026-04-12",
        evEbitda: 8.1,
        evRevenue: 1.5,
        priceToBook: 2.8,
        trailingPe: 12.3,
        source: "Bloomberg/Reuters consensus 2026-Q1",
      },
    },
  ],
  selfHistoryAllowed: true,
  relativeMetrics: ["EV/EBITDA", "EV/Revenue", "P/B"],
  weights: {
    primaryPeers: 0.7,
    secondaryPeers: 0.3,
  },
  caveats: [
    "Few clean public pure-play memory peers exist globally",
    "Samsung requires conglomerate adjustment (memory ~60% of OP)",
    "SK hynix disclosure follows Korean GAAP/IFRS with different timing",
    "WDC comparability reduced by HDD business mix",
    "All peer multiples are curated snapshots, not live pipeline-derived",
  ],
};

// ---------------------------------------------------------------------------
// Registry lookup
// ---------------------------------------------------------------------------

const REGISTRIES: Record<string, PeerRegistry> = {
  MU: MU_PEER_REGISTRY,
};

/**
 * Look up the peer registry for a ticker.
 * Returns null if no curated registry exists.
 */
export function getPeerRegistry(ticker: string): PeerRegistry | null {
  return REGISTRIES[ticker.toUpperCase()] ?? null;
}

/**
 * Compute a relative valuation from the peer registry.
 *
 * For each relative metric, computes implied per-share value from peer multiples,
 * then weights by peer quality and role.
 */
export function computeRelativeValuation(
  registry: PeerRegistry,
  subjectFacts: {
    enterpriseValue: number;
    ttmRevenue: number;
    ttmOperatingIncome: number;
    ttmDA: number;
    totalEquity: number;
    sharesOutstanding: number;
    totalDebt: number;
    totalCashAndInvestments: number;
    priceToBook: number | null;
  }
): RelativeValuationResult {
  const allPeers = [
    ...registry.primaryPeers.map(p => ({ ...p, isPrimary: true })),
    ...registry.secondaryPeers.map(p => ({ ...p, isPrimary: false })),
  ];

  const perShareValues: RelativeValuationResult["perShareValues"] = [];
  const shares = subjectFacts.sharesOutstanding;
  const ebitda = subjectFacts.ttmOperatingIncome + subjectFacts.ttmDA;

  for (const peer of allPeers) {
    if (!peer.curatedMultiples) continue;
    const m = peer.curatedMultiples;
    const peerWeight = peer.isPrimary ? registry.weights.primaryPeers : registry.weights.secondaryPeers;
    const qualityAdj = 1 - peer.qualityPenalty;

    // EV/EBITDA implied value
    if (m.evEbitda !== null && ebitda > 0) {
      const impliedEV = ebitda * m.evEbitda;
      const impliedEquity = impliedEV - subjectFacts.totalDebt + subjectFacts.totalCashAndInvestments;
      const impliedPerShare = impliedEquity / shares;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `EV/EBITDA via ${peer.name}`,
          value: impliedPerShare,
          weight: peerWeight * qualityAdj,
          source: peer.ticker,
        });
      }
    }

    // EV/Revenue implied value
    if (m.evRevenue !== null && subjectFacts.ttmRevenue > 0) {
      const impliedEV = subjectFacts.ttmRevenue * m.evRevenue;
      const impliedEquity = impliedEV - subjectFacts.totalDebt + subjectFacts.totalCashAndInvestments;
      const impliedPerShare = impliedEquity / shares;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `EV/Revenue via ${peer.name}`,
          value: impliedPerShare,
          weight: peerWeight * qualityAdj,
          source: peer.ticker,
        });
      }
    }

    // P/B implied value
    if (m.priceToBook !== null && subjectFacts.totalEquity > 0) {
      const bvps = subjectFacts.totalEquity / shares;
      const impliedPerShare = bvps * m.priceToBook;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `P/B via ${peer.name}`,
          value: impliedPerShare,
          weight: peerWeight * qualityAdj,
          source: peer.ticker,
        });
      }
    }
  }

  // Weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  for (const pv of perShareValues) {
    weightedSum += pv.value * pv.weight;
    totalWeight += pv.weight;
  }
  const weightedPerShare = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Confidence based on peer quality
  let confidence = 1.0;
  if (registry.primaryPeers.length === 0) confidence -= 0.3;
  const avgPenalty = allPeers.reduce((s, p) => s + p.qualityPenalty, 0) / allPeers.length;
  confidence -= avgPenalty * 0.5;

  // Penalty for curated-only multiples (not live pipeline-derived)
  const allCurated = allPeers.every(p => p.curatedMultiples !== undefined);
  if (allCurated) {
    confidence -= 0.15;
  }

  // Cap at 0.65 when all peers use curated snapshots
  if (allCurated) {
    confidence = Math.min(confidence, 0.65);
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    method: "relative_valuation",
    peerRegistryVersion: registry.version,
    perShareValues,
    weightedPerShare,
    confidence,
    caveats: registry.caveats,
  };
}

// ---------------------------------------------------------------------------
// Dynamic peer registry builder
// ---------------------------------------------------------------------------

import { discoverPeers } from "./peer-discovery";
import { fetchAllPeerMultiples, type PeerMultiples } from "./peer-multiples";
import { scorePeer, computeRegistryQuality, type PeerQualityScore, type RegistryQuality } from "./peer-quality";

export interface DynamicPeerRegistry {
  subjectTicker: string;
  source: "curated" | "dynamic";
  generatedAt: string;
  peers: {
    ticker: string;
    companyName: string;
    matchLevel: string;
    marketCap: number | null;
    qualityScore: number;
    role: "primary" | "secondary";
    multiples: PeerMultiples;
  }[];
  quality: RegistryQuality;
  /** The curated registry if it exists (used for relative valuation) */
  curatedRegistry: PeerRegistry | null;
}

/**
 * Build a peer registry for any ticker.
 * Uses curated registry if available, otherwise discovers peers via SIC codes.
 */
export async function buildPeerRegistry(
  ticker: string,
  sic: string,
  marketCap: number,
  sicDescription?: string,
  subjectGrossMargin?: number | null
): Promise<DynamicPeerRegistry> {
  const upper = ticker.toUpperCase();
  const curated = getPeerRegistry(upper);
  const generatedAt = new Date().toISOString();

  // Discover peers via SIC
  let candidates: Awaited<ReturnType<typeof discoverPeers>>;
  try {
    candidates = await discoverPeers(upper, sic, marketCap, sicDescription);
  } catch (err) {
    console.warn(`Peer discovery failed for ${upper}:`, err);
    candidates = [];
  }

  if (candidates.length === 0 && !curated) {
    return {
      subjectTicker: upper,
      source: "dynamic",
      generatedAt,
      peers: [],
      quality: {
        overallConfidence: 0,
        peerCount: 0,
        usablePeerCount: 0,
        averagePeerQuality: 0,
        qualityTier: "weak",
        reasons: ["No peers discovered via SIC code matching"],
      },
      curatedRegistry: null,
    };
  }

  // Fetch multiples for candidates
  let multiples: PeerMultiples[];
  try {
    multiples = await fetchAllPeerMultiples(candidates);
  } catch (err) {
    console.warn(`Peer multiples fetch failed for ${upper}:`, err);
    multiples = candidates.map(c => ({
      ticker: c.ticker, source: "fallback" as const, asOf: generatedAt,
      marketCap: c.marketCap, trailingPe: null, priceToBook: null,
      evToEbitda: null, evToRevenue: null, usableMultipleCount: 0,
      grossMargin: null, ttmRevenue: null,
    }));
  }

  // Score each peer
  // Score each peer with business-model similarity
  const allScores: PeerQualityScore[] = candidates.map((c, i) => scorePeer(c, multiples[i], marketCap, subjectGrossMargin));

  // Filter out peers that are too dissimilar (gross margin > 20pp difference)
  const filtered = allScores.filter(s => s.filtered);
  if (filtered.length > 0) {
    console.log(`  Filtered ${filtered.length} peer(s): ${filtered.map(f => `${f.ticker} (${f.filterReason})`).join(", ")}`);
  }

  const scores = allScores.filter(s => !s.filtered);
  // Update multiples/candidates to match filtered scores
  const scoreTickerSet = new Set(scores.map(s => s.ticker));
  const filteredCandidates = candidates.filter(c => scoreTickerSet.has(c.ticker));
  const filteredMultiples = multiples.filter(m => scoreTickerSet.has(m.ticker));
  const quality = computeRegistryQuality(scores, filteredMultiples);

  // Build peer list from filtered candidates
  const peers = filteredCandidates.map((c) => {
    const origIdx = candidates.indexOf(c);
    const scoreIdx = scores.findIndex(s => s.ticker === c.ticker);
    return {
      ticker: c.ticker,
      companyName: c.companyName,
      matchLevel: c.matchLevel,
      marketCap: c.marketCap ?? multiples[origIdx]?.marketCap ?? null,
      qualityScore: scoreIdx >= 0 ? scores[scoreIdx].qualityScore : 0,
      role: scoreIdx >= 0 ? scores[scoreIdx].role : "secondary" as const,
      multiples: multiples[origIdx],
    };
  });

  // Sort by quality score descending
  peers.sort((a, b) => b.qualityScore - a.qualityScore);

  return {
    subjectTicker: upper,
    source: curated ? "curated" : "dynamic",
    generatedAt,
    peers,
    quality,
    curatedRegistry: curated,
  };
}

/**
 * Compute relative valuation from a dynamic peer registry.
 * Uses peer multiples to derive implied per-share values.
 */
export function computeRelativeValuationFromDynamic(
  registry: DynamicPeerRegistry,
  subjectFacts: {
    enterpriseValue: number;
    ttmRevenue: number;
    ttmOperatingIncome: number;
    ttmDA: number;
    totalEquity: number;
    sharesOutstanding: number;
    totalDebt: number;
    totalCashAndInvestments: number;
    priceToBook: number | null;
  }
): RelativeValuationResult {
  // If curated registry exists, use the original function
  if (registry.curatedRegistry) {
    return computeRelativeValuation(registry.curatedRegistry, subjectFacts);
  }

  const perShareValues: RelativeValuationResult["perShareValues"] = [];
  const shares = subjectFacts.sharesOutstanding;
  const ebitda = subjectFacts.ttmOperatingIncome + subjectFacts.ttmDA;

  for (const peer of registry.peers) {
    const m = peer.multiples;
    if (m.usableMultipleCount === 0) continue;

    const qualityAdj = peer.qualityScore;

    // P/E implied value
    if (m.trailingPe !== null && m.trailingPe > 0 && m.trailingPe < 200) {
      // Need subject's EPS
      const subjectEV = subjectFacts.enterpriseValue;
      const bvps = subjectFacts.totalEquity / shares;
      // Use P/B for implied per-share if P/E needs EPS we don't have here
    }

    // P/B implied value
    if (m.priceToBook !== null && m.priceToBook > 0 && subjectFacts.totalEquity > 0) {
      const bvps = subjectFacts.totalEquity / shares;
      const impliedPerShare = bvps * m.priceToBook;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `P/B via ${peer.companyName || peer.ticker}`,
          value: impliedPerShare,
          weight: qualityAdj,
          source: peer.ticker,
        });
      }
    }

    // EV/EBITDA implied value (if available from pipeline)
    if (m.evToEbitda !== null && m.evToEbitda > 0 && ebitda > 0) {
      const impliedEV = ebitda * m.evToEbitda;
      const impliedEquity = impliedEV - subjectFacts.totalDebt + subjectFacts.totalCashAndInvestments;
      const impliedPerShare = impliedEquity / shares;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `EV/EBITDA via ${peer.companyName || peer.ticker}`,
          value: impliedPerShare,
          weight: qualityAdj,
          source: peer.ticker,
        });
      }
    }

    // EV/Revenue implied value (if available)
    if (m.evToRevenue !== null && m.evToRevenue > 0 && subjectFacts.ttmRevenue > 0) {
      const impliedEV = subjectFacts.ttmRevenue * m.evToRevenue;
      const impliedEquity = impliedEV - subjectFacts.totalDebt + subjectFacts.totalCashAndInvestments;
      const impliedPerShare = impliedEquity / shares;
      if (impliedPerShare > 0) {
        perShareValues.push({
          metric: `EV/Revenue via ${peer.companyName || peer.ticker}`,
          value: impliedPerShare,
          weight: qualityAdj,
          source: peer.ticker,
        });
      }
    }
  }

  // Weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  for (const pv of perShareValues) {
    weightedSum += pv.value * pv.weight;
    totalWeight += pv.weight;
  }
  const weightedPerShare = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    method: "relative_valuation",
    peerRegistryVersion: registry.source === "curated" ? "curated" : "dynamic-sic-v1",
    perShareValues,
    weightedPerShare,
    confidence: registry.quality.overallConfidence,
    caveats: registry.quality.reasons,
  };
}
