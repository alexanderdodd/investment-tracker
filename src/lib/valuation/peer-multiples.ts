/**
 * Peer multiples sourcing module.
 *
 * Fetches financial multiples for peer candidates using a three-channel waterfall:
 * 1. Pipeline DB (highest quality — our own validated data)
 * 2. Market data API (Yahoo Finance — real-time but unvalidated)
 * 3. Basic fallback (market cap only)
 *
 * See: .claude/features/peer-registry-creation/03-peer-multiples-sourcing.md
 */

import { fetchMarketData } from "../market-data/client";
import type { PeerCandidate } from "./peer-discovery";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerMultiples {
  ticker: string;
  source: "pipeline" | "market_data" | "fallback";
  asOf: string;
  marketCap: number | null;
  trailingPe: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  /** How many usable multiples this peer has */
  usableMultipleCount: number;
}

// ---------------------------------------------------------------------------
// Channel 1: Pipeline DB
// ---------------------------------------------------------------------------

async function fetchFromPipelineDb(ticker: string): Promise<PeerMultiples | null> {
  // Dynamic import to avoid circular dependency issues at module load time
  try {
    const { getDb } = await import("../../db/index");
    const { stockValuations } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");

    const db = getDb();
    const [row] = await db
      .select({
        canonicalFacts: stockValuations.canonicalFacts,
        valuationOutputs: stockValuations.valuationOutputs,
        generatedAt: stockValuations.generatedAt,
      })
      .from(stockValuations)
      .where(eq(stockValuations.ticker, ticker.toUpperCase()))
      .orderBy(desc(stockValuations.generatedAt))
      .limit(1);

    if (!row) return null;

    // Check freshness — only use if within 90 days
    const ageMs = Date.now() - row.generatedAt.getTime();
    if (ageMs > 90 * 24 * 60 * 60 * 1000) return null;

    const facts = row.canonicalFacts as Record<string, unknown> | null;
    const valOutputs = row.valuationOutputs as Record<string, unknown> | null;

    if (!facts) return null;

    const get = (obj: Record<string, unknown>, path: string): number | null => {
      const parts = path.split(".");
      let val: unknown = obj;
      for (const p of parts) {
        if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
        else return null;
      }
      if (typeof val === "number") return val;
      if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
        return (val as Record<string, unknown>).value as number | null;
      }
      return null;
    };

    const pe = get(facts, "trailingPE");
    const pb = get(facts, "priceToBook");
    const mcap = get(facts, "marketCap");

    // Try to get EV multiples from valuation outputs
    let evEbitda: number | null = null;
    let evRevenue: number | null = null;
    if (valOutputs) {
      const multiples = (valOutputs as Record<string, unknown>).multiples as Record<string, unknown> | undefined;
      const current = multiples?.current as Record<string, unknown> | undefined;
      evEbitda = (current?.evEbitda as number) ?? null;
      evRevenue = (current?.evRevenue as number) ?? null;
    }

    const usable = [pe, pb, evEbitda, evRevenue].filter(v => v !== null).length;

    return {
      ticker: ticker.toUpperCase(),
      source: "pipeline",
      asOf: row.generatedAt.toISOString(),
      marketCap: mcap,
      trailingPe: pe,
      priceToBook: pb,
      evToEbitda: evEbitda,
      evToRevenue: evRevenue,
      usableMultipleCount: usable,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Channel 2: Market data API
// ---------------------------------------------------------------------------

async function fetchFromMarketData(ticker: string): Promise<PeerMultiples | null> {
  try {
    const md = await fetchMarketData(ticker);

    // The chart API gives us price and market cap
    // For P/E and P/B, try the v8 quote endpoint which sometimes works without auth
    let pe: number | null = null;
    let pb: number | null = null;

    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d&includePrePost=false`;
      const res = await fetch(quoteUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        // Some chart responses include trailing PE in meta
        if (meta?.trailingPE) pe = meta.trailingPE;
      }
    } catch { /* ignore */ }

    // Count usable data points
    const hasPrice = md.price > 0;
    const hasMcap = md.marketCap > 0;
    const usable = [pe, pb].filter(v => v !== null).length + (hasPrice && !hasMcap ? 1 : 0) + (hasMcap ? 1 : 0);

    return {
      ticker: ticker.toUpperCase(),
      source: "market_data",
      asOf: new Date().toISOString(),
      marketCap: md.marketCap || null,
      trailingPe: pe,
      priceToBook: pb,
      evToEbitda: null,
      evToRevenue: null,
      // At minimum, having a current price means we're a real active stock
      usableMultipleCount: Math.max(hasPrice ? 1 : 0, usable),
    };
  } catch (err) {
    console.warn(`Peer multiples market data failed for ${ticker}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Waterfall: fetch multiples for a candidate
// ---------------------------------------------------------------------------

export async function fetchPeerMultiples(candidate: PeerCandidate): Promise<PeerMultiples> {
  // Channel 1: Pipeline DB
  const pipelineResult = await fetchFromPipelineDb(candidate.ticker);
  if (pipelineResult && pipelineResult.usableMultipleCount >= 1) {
    return pipelineResult;
  }

  // Channel 2: Market data API (accept if we got any usable data)
  const marketResult = await fetchFromMarketData(candidate.ticker);
  if (marketResult && marketResult.usableMultipleCount >= 1) {
    return marketResult;
  }

  // Channel 3: Fallback — just market cap
  return {
    ticker: candidate.ticker.toUpperCase(),
    source: "fallback",
    asOf: new Date().toISOString(),
    marketCap: candidate.marketCap,
    trailingPe: null,
    priceToBook: null,
    evToEbitda: null,
    evToRevenue: null,
    usableMultipleCount: 0,
  };
}

/**
 * Fetch multiples for multiple candidates in parallel (with concurrency limit).
 */
export async function fetchAllPeerMultiples(
  candidates: PeerCandidate[],
  concurrency = 3
): Promise<PeerMultiples[]> {
  const results: PeerMultiples[] = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(c => fetchPeerMultiples(c)));
    results.push(...batchResults);
  }

  return results;
}
