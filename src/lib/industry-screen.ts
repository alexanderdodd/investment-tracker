import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  gicsIndustries,
  stockClassifications,
  stockValuations,
  industryAnalytics,
  industryScreenResults,
} from "../db/schema";
import { fetchStockMetrics, type StockMetrics } from "./stock-metrics";
import { parseStockValuationInsights } from "./stock-valuation-insights";
import { GICS_SECTORS, GICS_INDUSTRIES, type GicsSectorDef } from "./gics-taxonomy";
import type { SectorName } from "./sectors";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ScreenState =
  | "SCREEN_PASS"
  | "NEEDS_DEEP_WORK"
  | "PUBLISHED_VALUE_CANDIDATE"
  | "WATCHLIST_ONLY"
  | "EXCLUDED_VALUE_TRAP_RISK";

interface CheapnessSignals {
  fwdPeVsMedian: number | null;
  evEbitdaVsMedian: number | null;
  evEbitdaVs5yPctl: number | null;
  pbVsMedian: number | null;
  fcfYieldVsMedian: number | null;
}

interface QualitySignals {
  leverageOk: boolean;
  marginStabilityOk: boolean;
  dilutionOk: boolean;
  cashConversionOk: boolean;
  returnsOk: boolean;
  liquidityOk: boolean;
}

interface ScreenResult {
  ticker: string;
  companyName: string;
  industryId: string;
  sectorId: string;
  screenState: ScreenState;
  cheapnessSignalCount: number;
  cheapnessSignals: CheapnessSignals;
  cheapnessPass: boolean;
  qualityScore: number;
  qualitySignals: QualitySignals;
  qualityPass: boolean;
  trapFlags: string[];
  hasValuationArtifact: boolean;
  hasPeerArtifact: boolean;
  artifactPublished: boolean;
  valuationLabel: "cheap" | "fair" | "expensive" | "withheld" | null;
  valuationConfidence: number | null;
  candidatePublishable: boolean;
  compositeScore: number;
}

// ─── Stage C — Industry-Relative Cheapness Screen ─────────────────────────
// A stock passes if >= 2 of 5 signals are true

function evaluateCheapness(
  metrics: StockMetrics | undefined,
  medianFwdPe: number | null,
  medianEvEbitda: number | null,
  medianPb: number | null,
  medianFcfYield: number | null,
  medianRoe: number | null
): { signals: CheapnessSignals; signalCount: number; pass: boolean } {
  const signals: CheapnessSignals = {
    fwdPeVsMedian: null,
    evEbitdaVsMedian: null,
    evEbitdaVs5yPctl: null,
    pbVsMedian: null,
    fcfYieldVsMedian: null,
  };
  let signalCount = 0;

  if (!metrics) return { signals, signalCount: 0, pass: false };

  // Signal 1: Forward P/E <= 0.85x industry median
  if (metrics.forwardPE !== null && medianFwdPe !== null && medianFwdPe > 0) {
    signals.fwdPeVsMedian = metrics.forwardPE / medianFwdPe;
    if (signals.fwdPeVsMedian <= 0.85) signalCount++;
  }

  // Signal 2: EV/EBITDA <= 0.85x industry median
  if (metrics.evToEbitda !== null && medianEvEbitda !== null && medianEvEbitda > 0) {
    signals.evEbitdaVsMedian = metrics.evToEbitda / medianEvEbitda;
    if (signals.evEbitdaVsMedian <= 0.85) signalCount++;
  }

  // Signal 3: EV/EBITDA <= 35th percentile of 5Y history
  // We don't have 5Y history per stock yet — use a proxy: below 80% of current median
  // This is a placeholder until time-series data is available
  if (metrics.evToEbitda !== null && medianEvEbitda !== null && medianEvEbitda > 0) {
    const pctlProxy = metrics.evToEbitda / medianEvEbitda;
    signals.evEbitdaVs5yPctl = pctlProxy;
    if (pctlProxy <= 0.80) signalCount++;
  }

  // Signal 4: P/B <= 0.8x industry median AND ROE >= threshold
  if (
    metrics.priceToBook !== null &&
    medianPb !== null &&
    medianPb > 0 &&
    metrics.roe !== null
  ) {
    signals.pbVsMedian = metrics.priceToBook / medianPb;
    const roeThreshold = medianRoe !== null ? Math.max(medianRoe * 0.7, 0.05) : 0.08;
    if (signals.pbVsMedian <= 0.80 && metrics.roe >= roeThreshold) signalCount++;
  }

  // Signal 5: FCF yield >= industry median + 2 percentage points
  if (metrics.freeCashFlow !== null && medianFcfYield !== null) {
    // FCF yield from metrics: compute as a spread vs median
    // If stock FCF yield > 0 and median > 0, check spread
    const stockFcfYield = medianFcfYield; // Placeholder: we'd need market cap to compute yield
    signals.fcfYieldVsMedian = null; // Will be null until we have per-stock yield
    // Skip this signal for now — need market cap data per stock
  }

  return { signals, signalCount, pass: signalCount >= 2 };
}

// Stable-fundamentals modifier: cheapness only counts if fundamentals aren't collapsing
function checkStableFundamentals(metrics: StockMetrics | undefined): {
  stable: boolean;
  issues: string[];
} {
  if (!metrics) return { stable: false, issues: ["No metrics available"] };
  const issues: string[] = [];

  // Revenue growth > -10% YoY
  if (metrics.revenueGrowth !== null && metrics.revenueGrowth < -0.10) {
    issues.push(`Revenue declining ${(metrics.revenueGrowth * 100).toFixed(1)}% YoY`);
  }

  // Operating margin not collapsing (> -7pp decline — we approximate with absolute check)
  if (metrics.operatingMargin !== null && metrics.operatingMargin < -0.05) {
    issues.push(`Negative operating margin (${(metrics.operatingMargin * 100).toFixed(1)}%)`);
  }

  return { stable: issues.length === 0, issues };
}

// ─── Stage D — Quality Filter ─────────────────────────────────────────────
// Weighted quality score + hard blockers

function evaluateQuality(metrics: StockMetrics | undefined): {
  signals: QualitySignals;
  score: number;
  pass: boolean;
  trapFlags: string[];
} {
  const signals: QualitySignals = {
    leverageOk: true,
    marginStabilityOk: true,
    dilutionOk: true,
    cashConversionOk: true,
    returnsOk: true,
    liquidityOk: true,
  };
  const trapFlags: string[] = [];

  if (!metrics) {
    return {
      signals: { ...signals, leverageOk: false, returnsOk: false },
      score: 0,
      pass: false,
      trapFlags: ["No financial data available"],
    };
  }

  // Component scores (0-100 each, weighted later)
  let leverageScore = 70; // default OK
  let marginScore = 70;
  let returnsScore = 70;
  let cashConvScore = 70;
  // dilution and liquidity — we can't check without share count / current ratio data
  let dilutionScore = 60; // default neutral without data
  let liquidityScore = 60;

  // Leverage check: use P/B as leverage proxy
  // (We don't have debt/EBITDA directly, but negative book value indicates extreme leverage)
  if (metrics.priceToBook !== null && metrics.priceToBook < 0) {
    leverageScore = 10;
    signals.leverageOk = false;
    trapFlags.push("Negative book value — extreme leverage or accumulated losses");
  }

  // Margin stability
  if (metrics.operatingMargin !== null) {
    if (metrics.operatingMargin < 0) {
      marginScore = 15;
      signals.marginStabilityOk = false;
      trapFlags.push(`Negative operating margin (${(metrics.operatingMargin * 100).toFixed(1)}%)`);
    } else if (metrics.operatingMargin < 0.05) {
      marginScore = 40;
    } else if (metrics.operatingMargin > 0.15) {
      marginScore = 90;
    }
  } else {
    marginScore = 30;
    signals.marginStabilityOk = false;
  }

  // Returns (ROIC / ROE)
  const returnMetric = metrics.roic ?? metrics.roe;
  if (returnMetric !== null) {
    if (returnMetric < 0.02) {
      returnsScore = 20;
      signals.returnsOk = false;
      trapFlags.push("Very low return on capital");
    } else if (returnMetric < 0.08) {
      returnsScore = 45;
    } else if (returnMetric > 0.15) {
      returnsScore = 95;
    } else {
      returnsScore = 70;
    }
  } else {
    returnsScore = 30;
    signals.returnsOk = false;
  }

  // Cash conversion: FCF should be positive
  if (metrics.freeCashFlow !== null) {
    if (metrics.freeCashFlow < 0) {
      cashConvScore = 20;
      signals.cashConversionOk = false;
      trapFlags.push("Negative free cash flow");
    } else {
      cashConvScore = 80;
    }
  } else {
    cashConvScore = 30;
    signals.cashConversionOk = false;
  }

  // Weighted composite: spec says 0.20 + 0.20 + 0.20 + 0.15 + 0.15 + 0.10
  const score = Math.round(
    0.20 * leverageScore +
    0.20 * liquidityScore +
    0.20 * marginScore +
    0.15 * dilutionScore +
    0.15 * cashConvScore +
    0.10 * returnsScore
  );

  // Hard blockers
  const hasHardBlocker = trapFlags.some(
    (f) =>
      f.includes("Negative book value") ||
      f.includes("Negative operating margin")
  );

  const pass = score >= 45 && !hasHardBlocker;

  return { signals, score, pass, trapFlags };
}

// ─── Screen State Assignment ──────────────────────────────────────────────

function assignScreenState(
  cheapnessPass: boolean,
  cheapnessStable: boolean,
  qualityPass: boolean,
  trapFlags: string[],
  hasValuationArtifact: boolean,
  hasPeerArtifact: boolean,
  artifactPublished: boolean,
  valuationLabel: string | null,
  valuationConfidence: number | null
): ScreenState {
  const hasTrapBlocker = trapFlags.length > 0 && !qualityPass;

  // EXCLUDED_VALUE_TRAP_RISK: cheap-looking but fails quality
  if (cheapnessPass && hasTrapBlocker) {
    return "EXCLUDED_VALUE_TRAP_RISK";
  }

  // Not cheap at all → not interesting for value screen
  if (!cheapnessPass) {
    return "WATCHLIST_ONLY";
  }

  // Cheap but fundamentals deteriorating
  if (!cheapnessStable) {
    return "WATCHLIST_ONLY";
  }

  // PUBLISHED_VALUE_CANDIDATE: all gates pass (spec: Stage C + D + artifact + peer + confidence)
  if (
    cheapnessPass &&
    qualityPass &&
    hasValuationArtifact &&
    hasPeerArtifact &&
    artifactPublished &&
    (valuationLabel === "cheap" || valuationLabel === "fair") &&
    valuationConfidence !== null &&
    valuationConfidence >= 0.65
  ) {
    return "PUBLISHED_VALUE_CANDIDATE";
  }

  // NEEDS_DEEP_WORK: cheap + quality OK but missing artifacts
  if (cheapnessPass && qualityPass && (!hasValuationArtifact || !hasPeerArtifact)) {
    return "NEEDS_DEEP_WORK";
  }

  // SCREEN_PASS: cheap + quality OK + has some artifacts but not enough for publication
  if (cheapnessPass && qualityPass) {
    return "SCREEN_PASS";
  }

  return "WATCHLIST_ONLY";
}

// ─── Composite Score ──────────────────────────────────────────────────────

function computeCompositeScore(
  cheapnessSignalCount: number,
  qualityScore: number,
  valuationConfidence: number | null,
  hasPeerArtifact: boolean
): number {
  let score = 0;
  // Cheapness contributes up to 40 points (2+ signals needed to pass)
  score += Math.min(cheapnessSignalCount, 4) * 10;
  // Quality contributes up to 30 points
  score += (qualityScore / 100) * 30;
  // Valuation confidence contributes up to 20 points
  if (valuationConfidence !== null) score += valuationConfidence * 20;
  // Peer artifact contributes 10 points
  if (hasPeerArtifact) score += 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Valuation helpers ────────────────────────────────────────────────────

function verdictToLabel(verdict: string): "cheap" | "fair" | "expensive" | "withheld" {
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

// ─── Main Screen Engine ───────────────────────────────────────────────────

export async function runIndustryScreen(onlySector?: SectorName): Promise<ScreenResult[]> {
  const db = getDb();
  const allResults: ScreenResult[] = [];

  const targetSectors = onlySector
    ? [GICS_SECTORS.find((s) => s.name === onlySector)].filter(Boolean) as GicsSectorDef[]
    : GICS_SECTORS;

  for (const gicsSector of targetSectors) {
    const sectorId = `sector-${gicsSector.code}`;

    // Get industries for this sector
    const industries = await db
      .select()
      .from(gicsIndustries)
      .where(eq(gicsIndustries.sectorId, sectorId));

    // Get latest analytics for medians
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

    // Get latest valuation artifacts
    const valuationMap: Record<string, { label: string; confidence: string; hasPeers: boolean; published: boolean }> = {};
    for (const stock of allStocks) {
      const valuations = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.ticker, stock.ticker))
        .orderBy(desc(stockValuations.generatedAt))
        .limit(1);

      if (valuations.length > 0 && valuations[0].structuredInsights) {
        const insights = parseStockValuationInsights(valuations[0].structuredInsights);
        const peers = (insights as Record<string, unknown>).peerDetails;
        const peerCount = Array.isArray(peers) ? peers.length : 0;
        valuationMap[stock.ticker] = {
          label: insights?.verdict ?? "Withheld",
          confidence: insights?.confidence ?? "Low",
          hasPeers: peerCount > 0,
          published: valuations[0].status === "published",
        };
      }
    }

    // Process each industry
    for (const industry of industries) {
      const analytics = latestAnalytics[industry.id];
      const industryStocks = allStocks.filter((s) => s.industryId === industry.id);
      if (industryStocks.length === 0) continue;

      // Industry medians from analytics
      const medianFwdPe = analytics?.medianForwardPe ?? null;
      const medianEvEbitda = analytics?.medianEvEbitda ?? null;
      const medianPb = analytics?.medianPriceToBook ?? null;
      const medianFcfYield = analytics?.medianFcfYield ?? null;
      const medianRoe = analytics?.medianRoe ?? null;

      for (const stock of industryStocks) {
        const metrics = allMetrics[stock.ticker];
        const valInfo = valuationMap[stock.ticker];

        // Stage C: Cheapness
        const cheapness = evaluateCheapness(
          metrics, medianFwdPe, medianEvEbitda, medianPb, medianFcfYield, medianRoe
        );
        const fundamentals = checkStableFundamentals(metrics);

        // Stage D: Quality
        const quality = evaluateQuality(metrics);

        // Artifact info
        const hasValuationArtifact = !!valInfo;
        const hasPeerArtifact = valInfo?.hasPeers ?? false;
        const artifactPublished = valInfo?.published ?? false;
        const valuationLabel = valInfo ? verdictToLabel(valInfo.label) : null;
        const valuationConfidence = valInfo ? confidenceToNumber(valInfo.confidence) : null;

        // State assignment
        const screenState = assignScreenState(
          cheapness.pass,
          fundamentals.stable,
          quality.pass,
          quality.trapFlags,
          hasValuationArtifact,
          hasPeerArtifact,
          artifactPublished,
          valuationLabel,
          valuationConfidence
        );

        const candidatePublishable = screenState === "PUBLISHED_VALUE_CANDIDATE";
        const compositeScore = computeCompositeScore(
          cheapness.signalCount,
          quality.score,
          valuationConfidence,
          hasPeerArtifact
        );

        const result: ScreenResult = {
          ticker: stock.ticker,
          companyName: stock.companyName,
          industryId: industry.id,
          sectorId: sectorId,
          screenState,
          cheapnessSignalCount: cheapness.signalCount,
          cheapnessSignals: cheapness.signals,
          cheapnessPass: cheapness.pass,
          qualityScore: quality.score,
          qualitySignals: quality.signals,
          qualityPass: quality.pass,
          trapFlags: quality.trapFlags,
          hasValuationArtifact,
          hasPeerArtifact,
          artifactPublished,
          valuationLabel,
          valuationConfidence,
          candidatePublishable,
          compositeScore,
        };

        allResults.push(result);
      }
    }

    // Brief pause between sectors
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Store results
  const batchTime = new Date();
  for (const r of allResults) {
    await db.delete(industryScreenResults).where(eq(industryScreenResults.ticker, r.ticker));
    await db.insert(industryScreenResults).values({
      ticker: r.ticker,
      companyName: r.companyName,
      industryId: r.industryId,
      sectorId: r.sectorId,
      snapshotAt: batchTime,
      screenState: r.screenState,
      cheapnessSignalCount: r.cheapnessSignalCount,
      cheapnessSignals: r.cheapnessSignals,
      cheapnessPass: r.cheapnessPass ? 1 : 0,
      qualityScore: r.qualityScore,
      qualitySignals: r.qualitySignals,
      qualityPass: r.qualityPass ? 1 : 0,
      trapFlags: r.trapFlags,
      hasValuationArtifact: r.hasValuationArtifact ? 1 : 0,
      hasPeerArtifact: r.hasPeerArtifact ? 1 : 0,
      artifactPublished: r.artifactPublished ? 1 : 0,
      valuationLabel: r.valuationLabel,
      valuationConfidence: r.valuationConfidence,
      candidatePublishable: r.candidatePublishable ? 1 : 0,
      compositeScore: r.compositeScore,
      generatedAt: batchTime,
    });
  }

  return allResults;
}
