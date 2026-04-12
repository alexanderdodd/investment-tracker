/**
 * Deterministic peer / relative framework registry.
 *
 * Provides curated peer sets per company archetype. No runtime ad-hoc peer
 * invention — the registry is static and versioned.
 *
 * See: .claude/features/stock-valuation-verdict-spec/05-peer-registry-and-relative-framework.md
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
