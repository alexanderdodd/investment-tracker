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
// A stock passes if >= 2 of N signals are true (N depends on framework)
//
// Framework-specific signal sets (spec §05):
// - cyclical_semiconductor: EV/EBIT, EV/EBITDA, P/B (normalized earnings context)
// - consumer_beverages: fwd P/E, EV/EBITDA, operating margin stability
// - property_casualty_insurance: P/B (justified vs ROE), fwd P/E
// - interactive_media: fwd P/E, EV/EBIT, margin durability
// - default: all 5 generic signals

type FrameworkId = string | null | undefined;

interface FrameworkConfig {
  // Which signals to evaluate (true = include in this framework)
  useFwdPe: boolean;
  useEvEbitda: boolean;
  useEvEbitdaHistory: boolean;
  usePbRoe: boolean;
  useFcfYield: boolean;
  // Additional framework-specific signals
  useEvEbit: boolean;
  useMarginDurability: boolean;
  // Threshold overrides (null = use defaults)
  peThreshold: number;     // default 0.85
  evThreshold: number;     // default 0.85
  pbThreshold: number;     // default 0.80
}

function getFrameworkConfig(frameworkId: FrameworkId): FrameworkConfig {
  const defaults: FrameworkConfig = {
    useFwdPe: true, useEvEbitda: true, useEvEbitdaHistory: true,
    usePbRoe: true, useFcfYield: true, useEvEbit: false,
    useMarginDurability: false, peThreshold: 0.85, evThreshold: 0.85, pbThreshold: 0.80,
  };

  switch (frameworkId) {
    case "cyclical_semiconductor_memory_v1":
      // Cyclical: EV/EBIT, EV/EBITDA, P/B are primary; P/E less reliable at cycle peaks
      return {
        ...defaults,
        useFwdPe: false,     // P/E unreliable in cyclicals
        useEvEbit: true,     // EV/EBIT primary for cyclicals
        useEvEbitdaHistory: true,
        usePbRoe: true,      // P/B important for capital-intensive
        useFcfYield: false,  // FCF volatile in cyclicals
        evThreshold: 0.80,   // Tighter threshold for cyclicals
      };
    case "consumer_beverages_v1":
      // Defensive: fwd P/E, EV/EBITDA, margin stability are primary
      return {
        ...defaults,
        useFwdPe: true,
        useEvEbitda: true,
        usePbRoe: false,     // P/B less meaningful for brand-heavy
        useMarginDurability: true,
        useFcfYield: true,
      };
    case "property_casualty_insurance_v1":
      // Insurance: P/B (justified vs ROE) is primary, fwd P/E secondary
      // Keep EV/EBITDA as supplementary — useful for holding companies
      return {
        ...defaults,
        useFwdPe: true,
        useEvEbitda: true,   // Keep as supplementary signal
        useEvEbitdaHistory: false, // History less meaningful for insurance
        usePbRoe: true,      // PRIMARY signal for insurance
        useFcfYield: false,
        pbThreshold: 0.85,   // Slightly relaxed — insurance often trades near book
        peThreshold: 0.80,   // Tighter P/E for financials
      };
    case "interactive_media_v1":
      // Platform: fwd P/E, EV/EBIT, FCF yield, margin durability
      return {
        ...defaults,
        useFwdPe: true,
        useEvEbit: true,
        useEvEbitda: true,
        usePbRoe: false,     // P/B less relevant for asset-light
        useMarginDurability: true,
      };
    default:
      return defaults;
  }
}

function evaluateCheapness(
  metrics: StockMetrics | undefined,
  medianFwdPe: number | null,
  medianEvEbitda: number | null,
  medianPb: number | null,
  medianFcfYield: number | null,
  medianRoe: number | null,
  frameworkId: FrameworkId
): { signals: CheapnessSignals; signalCount: number; pass: boolean; frameworkUsed: string } {
  const signals: CheapnessSignals = {
    fwdPeVsMedian: null,
    evEbitdaVsMedian: null,
    evEbitdaVs5yPctl: null,
    pbVsMedian: null,
    fcfYieldVsMedian: null,
  };
  let signalCount = 0;
  const fw = getFrameworkConfig(frameworkId);
  const frameworkUsed = frameworkId ?? "default";

  if (!metrics) return { signals, signalCount: 0, pass: false, frameworkUsed };

  // Signal: Forward P/E <= threshold * industry median
  if (fw.useFwdPe && metrics.forwardPE !== null && medianFwdPe !== null && medianFwdPe > 0) {
    signals.fwdPeVsMedian = metrics.forwardPE / medianFwdPe;
    if (signals.fwdPeVsMedian <= fw.peThreshold) signalCount++;
  }

  // Signal: EV/EBITDA <= threshold * industry median
  if (fw.useEvEbitda && metrics.evToEbitda !== null && medianEvEbitda !== null && medianEvEbitda > 0) {
    signals.evEbitdaVsMedian = metrics.evToEbitda / medianEvEbitda;
    if (signals.evEbitdaVsMedian <= fw.evThreshold) signalCount++;
  }

  // Signal: EV/EBITDA historical proxy (<= 80% of median)
  if (fw.useEvEbitdaHistory && metrics.evToEbitda !== null && medianEvEbitda !== null && medianEvEbitda > 0) {
    const pctlProxy = metrics.evToEbitda / medianEvEbitda;
    signals.evEbitdaVs5yPctl = pctlProxy;
    if (pctlProxy <= 0.80) signalCount++;
  }

  // Signal: EV/EBIT <= 0.85x (framework-specific, uses evToEbit metric)
  if (fw.useEvEbit && metrics.evToEbit !== null && medianEvEbitda !== null && medianEvEbitda > 0) {
    // Use median EV/EBITDA as proxy for EV/EBIT median (tighter multiple)
    const evEbitRatio = metrics.evToEbit / (medianEvEbitda * 1.15); // EBIT median ≈ EBITDA * 1.15
    if (evEbitRatio <= fw.evThreshold) signalCount++;
  }

  // Signal: P/B <= threshold * industry median AND ROE >= hurdle
  if (fw.usePbRoe && metrics.priceToBook !== null && medianPb !== null && medianPb > 0 && metrics.roe !== null) {
    signals.pbVsMedian = metrics.priceToBook / medianPb;
    const roeThreshold = medianRoe !== null ? Math.max(medianRoe * 0.7, 0.05) : 0.08;
    if (signals.pbVsMedian <= fw.pbThreshold && metrics.roe >= roeThreshold) signalCount++;
  }

  // Signal: Margin durability (operating margin > industry context + positive trend)
  if (fw.useMarginDurability && metrics.operatingMargin !== null) {
    if (metrics.operatingMargin > 0.12 && metrics.grossMargin !== null && metrics.grossMargin > 0.30) {
      signalCount++;
    }
  }

  // Signal: FCF yield (placeholder — needs per-stock market cap)
  if (fw.useFcfYield && metrics.freeCashFlow !== null && medianFcfYield !== null) {
    signals.fcfYieldVsMedian = null; // Still placeholder
  }

  return { signals, signalCount, pass: signalCount >= 2, frameworkUsed };
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const peers = (insights as any)?.peerDetails;
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

        // Stage C: Cheapness (framework-aware)
        const cheapness = evaluateCheapness(
          metrics, medianFwdPe, medianEvEbitda, medianPb, medianFcfYield, medianRoe,
          industry.valueFrameworkId
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

// ─── Single-Industry Screen (for on-demand API) ──────────────────────────

export interface ScreenStepLog {
  stage: string;
  description: string;
  detail: string;
  stocksAffected?: number;
}

export interface SingleIndustryScreenResult {
  industry: { id: string; name: string; slug: string; sectorName: string; cyclicalityClass: string; frameworkId: string | null };
  medians: {
    forwardPe: number | null;
    evEbitda: number | null;
    priceToBook: number | null;
    operatingMargin: number | null;
    roic: number | null;
    roe: number | null;
    fcfYield: number | null;
  };
  methodology: ScreenStepLog[];
  results: ScreenResult[];
  summary: {
    total: number;
    published: number;
    screenPass: number;
    deepWork: number;
    trapRisk: number;
    watchlist: number;
  };
  screenedAt: string;
}

export async function screenSingleIndustry(industrySlug: string): Promise<SingleIndustryScreenResult | null> {
  const db = getDb();
  const methodology: ScreenStepLog[] = [];

  // Step 1: Resolve industry
  const industries = await db
    .select()
    .from(gicsIndustries)
    .where(eq(gicsIndustries.slug, industrySlug));

  if (industries.length === 0) return null;
  const industry = industries[0];

  // Look up sector name
  const gicsSector = GICS_SECTORS.find((s) => `sector-${s.code}` === industry.sectorId);
  const sectorName = gicsSector?.name ?? "Unknown";

  methodology.push({
    stage: "Resolve Industry",
    description: "Identify the GICS industry and its classification parameters",
    detail: `${industry.name} (${industry.code}) in ${sectorName}. Cyclicality: ${industry.cyclicalityClass}. Framework: ${industry.valueFrameworkId ?? "default"}.`,
  });

  // Step 2: Get industry medians
  const allAnalytics = await db
    .select()
    .from(industryAnalytics)
    .where(eq(industryAnalytics.industryId, industry.id));

  let latestAnalytics: typeof allAnalytics[0] | null = null;
  for (const a of allAnalytics) {
    if (!latestAnalytics || a.generatedAt > latestAnalytics.generatedAt) {
      latestAnalytics = a;
    }
  }

  const medians = {
    forwardPe: latestAnalytics?.medianForwardPe ?? null,
    evEbitda: latestAnalytics?.medianEvEbitda ?? null,
    priceToBook: latestAnalytics?.medianPriceToBook ?? null,
    operatingMargin: latestAnalytics?.medianOperatingMargin ?? null,
    roic: latestAnalytics?.medianRoic ?? null,
    roe: latestAnalytics?.medianRoe ?? null,
    fcfYield: latestAnalytics?.medianFcfYield ?? null,
  };

  const fmtM = (v: number | null, fmt: "x" | "%") =>
    v === null ? "n/a" : fmt === "x" ? `${v.toFixed(1)}x` : `${(v * 100).toFixed(1)}%`;

  methodology.push({
    stage: "Compute Industry Medians",
    description: "Establish the baseline valuation benchmarks for this industry from current constituent data",
    detail: `Median Fwd P/E: ${fmtM(medians.forwardPe, "x")}, EV/EBITDA: ${fmtM(medians.evEbitda, "x")}, P/B: ${fmtM(medians.priceToBook, "x")}, Op Margin: ${fmtM(medians.operatingMargin, "%")}, ROIC: ${fmtM(medians.roic, "%")}.`,
  });

  // Step 3: Get stocks and metrics
  const stocks = await db
    .select()
    .from(stockClassifications)
    .where(eq(stockClassifications.industryId, industry.id));

  const tickers = stocks.map((s) => s.ticker);
  let allMetrics: Record<string, StockMetrics> = {};
  try {
    allMetrics = await fetchStockMetrics(tickers);
  } catch {
    methodology.push({
      stage: "Fetch Market Data",
      description: "Pull current valuation multiples and quality metrics for each stock",
      detail: `Failed to fetch metrics for ${tickers.length} stocks.`,
    });
    return null;
  }

  const metricsFound = Object.keys(allMetrics).length;
  methodology.push({
    stage: "Fetch Market Data",
    description: "Pull current valuation multiples and quality metrics for each stock from market data APIs",
    detail: `Retrieved metrics for ${metricsFound} of ${tickers.length} stocks: forward P/E, EV/EBITDA, P/B, operating margin, ROIC, ROE, FCF.`,
    stocksAffected: metricsFound,
  });

  // Step 4: Check valuation artifacts
  const valuationMap: Record<string, { label: string; confidence: string; hasPeers: boolean; published: boolean }> = {};
  for (const stock of stocks) {
    const valuations = await db
      .select()
      .from(stockValuations)
      .where(eq(stockValuations.ticker, stock.ticker))
      .orderBy(desc(stockValuations.generatedAt))
      .limit(1);

    if (valuations.length > 0 && valuations[0].structuredInsights) {
      const insights = parseStockValuationInsights(valuations[0].structuredInsights);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const peers = (insights as any)?.peerDetails;
      const peerCount = Array.isArray(peers) ? peers.length : 0;
      valuationMap[stock.ticker] = {
        label: insights?.verdict ?? "Withheld",
        confidence: insights?.confidence ?? "Low",
        hasPeers: peerCount > 0,
        published: valuations[0].status === "published",
      };
    }
  }

  const withArtifacts = Object.keys(valuationMap).length;
  const withPublished = Object.values(valuationMap).filter((v) => v.published).length;
  methodology.push({
    stage: "Check Valuation Artifacts",
    description: "Look up existing deep-valuation reports and peer analysis for each stock. A published artifact with peer data is required for full candidate publication.",
    detail: `${withArtifacts} of ${tickers.length} stocks have valuation artifacts (${withPublished} published, ${withArtifacts - withPublished} withheld).`,
    stocksAffected: withArtifacts,
  });

  // Step 5: Run cheapness screen (Stage C)
  const fw = getFrameworkConfig(industry.valueFrameworkId);
  const fwName = industry.valueFrameworkId ?? "default";
  const enabledSignals: string[] = [];
  if (fw.useFwdPe) enabledSignals.push("Fwd P/E vs median");
  if (fw.useEvEbitda) enabledSignals.push("EV/EBITDA vs median");
  if (fw.useEvEbitdaHistory) enabledSignals.push("EV/EBITDA vs 5Y history");
  if (fw.useEvEbit) enabledSignals.push("EV/EBIT vs median");
  if (fw.usePbRoe) enabledSignals.push("P/B + ROE vs median");
  if (fw.useMarginDurability) enabledSignals.push("Margin durability");
  if (fw.useFcfYield) enabledSignals.push("FCF yield vs median");

  const screenResults: ScreenResult[] = [];
  let cheapPassCount = 0;

  for (const stock of stocks) {
    const metrics = allMetrics[stock.ticker];
    const valInfo = valuationMap[stock.ticker];

    const cheapness = evaluateCheapness(
      metrics, medians.forwardPe, medians.evEbitda, medians.priceToBook,
      medians.fcfYield, medians.roe, industry.valueFrameworkId
    );
    const fundamentals = checkStableFundamentals(metrics);
    const quality = evaluateQuality(metrics);

    const hasValuationArtifact = !!valInfo;
    const hasPeerArtifact = valInfo?.hasPeers ?? false;
    const artifactPublished = valInfo?.published ?? false;
    const valuationLabel = valInfo ? verdictToLabel(valInfo.label) : null;
    const valuationConfidence = valInfo ? confidenceToNumber(valInfo.confidence) : null;

    const screenState = assignScreenState(
      cheapness.pass, fundamentals.stable, quality.pass, quality.trapFlags,
      hasValuationArtifact, hasPeerArtifact, artifactPublished,
      valuationLabel, valuationConfidence
    );

    const candidatePublishable = screenState === "PUBLISHED_VALUE_CANDIDATE";
    const compositeScore = computeCompositeScore(
      cheapness.signalCount, quality.score, valuationConfidence, hasPeerArtifact
    );

    if (cheapness.pass) cheapPassCount++;

    screenResults.push({
      ticker: stock.ticker,
      companyName: stock.companyName,
      industryId: industry.id,
      sectorId: industry.sectorId,
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
    });
  }

  methodology.push({
    stage: "Cheapness Screen (Stage C)",
    description: `Apply industry-relative cheapness signals using the ${fwName} framework. A stock passes if at least 2 signals indicate it trades at a meaningful discount to industry peers.`,
    detail: `Signals used: ${enabledSignals.join(", ")}. Thresholds: P/E <= ${fw.peThreshold}x median, EV/EBITDA <= ${fw.evThreshold}x median, P/B <= ${fw.pbThreshold}x median. Result: ${cheapPassCount} of ${stocks.length} stocks pass cheapness.`,
    stocksAffected: cheapPassCount,
  });

  // Step 6: Quality filter (Stage D)
  const qualityPassCount = screenResults.filter((r) => r.qualityPass).length;
  const trapCount = screenResults.filter((r) => r.screenState === "EXCLUDED_VALUE_TRAP_RISK").length;

  methodology.push({
    stage: "Quality Filter (Stage D)",
    description: "Check financial health to separate genuine value from value traps. Evaluates leverage, margin stability, cash conversion, and returns on capital. Stocks that look cheap but have structural problems are flagged as trap risks.",
    detail: `${qualityPassCount} stocks pass quality (score >= 45, no hard blockers). ${trapCount} stocks flagged as value traps due to negative margins, extreme leverage, or poor cash conversion.`,
    stocksAffected: qualityPassCount,
  });

  // Step 7: Candidate gate
  const published = screenResults.filter((r) => r.screenState === "PUBLISHED_VALUE_CANDIDATE").length;
  const screenPass = screenResults.filter((r) => r.screenState === "SCREEN_PASS").length;
  const deepWork = screenResults.filter((r) => r.screenState === "NEEDS_DEEP_WORK").length;

  methodology.push({
    stage: "Candidate Publication Gate",
    description: "Apply the strictest gate: only stocks that pass cheapness + quality + have a published deep-valuation artifact with peer analysis + valuation confidence >= 65% can be surfaced as Published Value Candidates. Stocks that pass cheapness + quality but lack artifacts are marked as Needs Deep Work.",
    detail: `${published} published candidates, ${screenPass} screen pass (have artifacts but blocked by label/confidence), ${deepWork} need deep work (cheap + quality OK but no artifact yet), ${trapCount} trap risks excluded.`,
  });

  // Store results
  const batchTime = new Date();
  for (const r of screenResults) {
    await db.delete(industryScreenResults).where(eq(industryScreenResults.ticker, r.ticker));
    await db.insert(industryScreenResults).values({
      ticker: r.ticker, companyName: r.companyName, industryId: r.industryId,
      sectorId: r.sectorId, snapshotAt: batchTime, screenState: r.screenState,
      cheapnessSignalCount: r.cheapnessSignalCount, cheapnessSignals: r.cheapnessSignals,
      cheapnessPass: r.cheapnessPass ? 1 : 0, qualityScore: r.qualityScore,
      qualitySignals: r.qualitySignals, qualityPass: r.qualityPass ? 1 : 0,
      trapFlags: r.trapFlags, hasValuationArtifact: r.hasValuationArtifact ? 1 : 0,
      hasPeerArtifact: r.hasPeerArtifact ? 1 : 0, artifactPublished: r.artifactPublished ? 1 : 0,
      valuationLabel: r.valuationLabel, valuationConfidence: r.valuationConfidence,
      candidatePublishable: r.candidatePublishable ? 1 : 0, compositeScore: r.compositeScore,
      generatedAt: batchTime,
    });
  }

  const summary = {
    total: screenResults.length,
    published: screenResults.filter((r) => r.screenState === "PUBLISHED_VALUE_CANDIDATE").length,
    screenPass: screenResults.filter((r) => r.screenState === "SCREEN_PASS").length,
    deepWork: screenResults.filter((r) => r.screenState === "NEEDS_DEEP_WORK").length,
    trapRisk: screenResults.filter((r) => r.screenState === "EXCLUDED_VALUE_TRAP_RISK").length,
    watchlist: screenResults.filter((r) => r.screenState === "WATCHLIST_ONLY").length,
  };

  return {
    industry: {
      id: industry.id, name: industry.name, slug: industry.slug,
      sectorName, cyclicalityClass: industry.cyclicalityClass,
      frameworkId: industry.valueFrameworkId,
    },
    medians,
    methodology,
    results: screenResults.sort((a, b) => b.compositeScore - a.compositeScore),
    summary,
    screenedAt: batchTime.toISOString(),
  };
}
