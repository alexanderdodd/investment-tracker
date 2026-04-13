import { eq } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  gicsIndustries,
  gicsSectors,
  stockClassifications,
  industryAnalytics,
} from "../db/schema";
import { fetchStockMetrics, type StockMetrics } from "./stock-metrics";
import { GICS_SECTORS, type GicsSectorDef } from "./gics-taxonomy";
import type { SectorName } from "./sectors";

// ─── Helpers ───────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function extractValid(metrics: StockMetrics[], key: keyof StockMetrics): number[] {
  return metrics
    .map((m) => m[key])
    .filter((v): v is number => typeof v === "number" && isFinite(v));
}

// ─── Valuation state logic ─────────────────────────────────────────────────

function determineValuationState(
  medianPe: number | null,
  medianEvEbitda: number | null,
  cyclicality: string
): "cheap" | "fair" | "expensive" | "withheld" {
  if (medianPe === null && medianEvEbitda === null) return "withheld";

  let cheapSignals = 0;
  let expensiveSignals = 0;

  // P/E thresholds vary by cyclicality
  if (medianPe !== null) {
    const cheapThreshold = cyclicality === "defensive" ? 14 : cyclicality === "hyper_cyclical" ? 10 : 15;
    const expThreshold = cyclicality === "defensive" ? 22 : cyclicality === "hyper_cyclical" ? 20 : 22;
    if (medianPe < cheapThreshold) cheapSignals++;
    else if (medianPe > expThreshold) expensiveSignals++;
  }

  // EV/EBITDA thresholds
  if (medianEvEbitda !== null) {
    const cheapThreshold = cyclicality === "hyper_cyclical" ? 7 : 10;
    const expThreshold = cyclicality === "hyper_cyclical" ? 14 : 16;
    if (medianEvEbitda < cheapThreshold) cheapSignals++;
    else if (medianEvEbitda > expThreshold) expensiveSignals++;
  }

  if (cheapSignals > 0 && expensiveSignals === 0) return "cheap";
  if (expensiveSignals > 0 && cheapSignals === 0) return "expensive";
  return "fair";
}

// ─── Industry state logic ──────────────────────────────────────────────────

function determineIndustryState(
  valuationState: "cheap" | "fair" | "expensive" | "withheld",
  medianOpMargin: number | null,
  medianRoic: number | null,
  stockCount: number,
  metricsCount: number
): "ATTRACTIVE_HUNTING_GROUND" | "MIXED" | "OVERHEATED" | "LOW_VISIBILITY" | "WITHHELD" {
  // Not enough data
  if (valuationState === "withheld" || metricsCount < 2) return "WITHHELD";
  if (stockCount < 3 || metricsCount < 3) return "LOW_VISIBILITY";

  // Quality check: is the industry generating decent returns?
  const qualityOk =
    (medianOpMargin !== null && medianOpMargin > 0.05) ||
    (medianRoic !== null && medianRoic > 0.05);

  if (valuationState === "cheap" && qualityOk) return "ATTRACTIVE_HUNTING_GROUND";
  if (valuationState === "expensive") return "OVERHEATED";
  if (valuationState === "fair" && qualityOk) return "MIXED";

  return "LOW_VISIBILITY";
}

// ─── Confidence ────────────────────────────────────────────────────────────

function computeConfidence(stockCount: number, metricsCount: number): number {
  // Confidence based on data coverage
  if (metricsCount === 0) return 0;
  const coverage = metricsCount / Math.max(stockCount, 1);
  const sizeFactor = Math.min(metricsCount / 10, 1); // 10+ stocks = full size confidence
  return Math.round(coverage * sizeFactor * 100) / 100;
}

// ─── Main generation function ──────────────────────────────────────────────

function sectorNameToGics(name: string): GicsSectorDef | undefined {
  return GICS_SECTORS.find((s) => s.name === name);
}

export async function generateIndustryAnalytics(onlySector?: SectorName) {
  const db = getDb();
  const results: { industry: string; sector: string; success: boolean; error?: string }[] = [];

  // Determine which sectors to process
  const targetSectors = onlySector
    ? [sectorNameToGics(onlySector)].filter(Boolean) as GicsSectorDef[]
    : GICS_SECTORS;

  for (const gicsSector of targetSectors) {
    const sectorId = `sector-${gicsSector.code}`;

    // Get industries for this sector
    const industries = await db
      .select()
      .from(gicsIndustries)
      .where(eq(gicsIndustries.sectorId, sectorId));

    // Get all stocks for this sector
    const allStocks = await db
      .select()
      .from(stockClassifications)
      .where(eq(stockClassifications.sectorId, sectorId));

    if (allStocks.length === 0) continue;

    // Fetch metrics for all stocks in this sector at once
    const tickers = allStocks.map((s) => s.ticker);
    let allMetrics: Record<string, StockMetrics> = {};
    try {
      allMetrics = await fetchStockMetrics(tickers);
    } catch (err) {
      console.error(`Failed to fetch metrics for ${gicsSector.name}:`, err);
      continue;
    }

    // Process each industry
    for (const industry of industries) {
      try {
        const industryStocks = allStocks.filter((s) => s.industryId === industry.id);
        const stockCount = industryStocks.length;

        if (stockCount === 0) {
          results.push({ industry: industry.name, sector: gicsSector.name, success: true });
          continue;
        }

        // Collect metrics for stocks in this industry
        const industryMetrics = industryStocks
          .map((s) => allMetrics[s.ticker])
          .filter(Boolean);

        const metricsCount = industryMetrics.length;

        // Compute medians
        const medianForwardPe = median(extractValid(industryMetrics, "forwardPE"));
        const medianEvEbitda = median(extractValid(industryMetrics, "evToEbitda"));
        const medianPriceToBook = median(extractValid(industryMetrics, "priceToBook"));
        const medianOperatingMargin = median(extractValid(industryMetrics, "operatingMargin"));
        const medianRoic = median(extractValid(industryMetrics, "roic"));
        const medianRoe = median(extractValid(industryMetrics, "roe"));

        // FCF yield: FCF / market cap — we don't have market cap easily, so store raw FCF median
        const medianFcfYield = median(extractValid(industryMetrics, "freeCashFlow"));

        // Determine states
        const valuationState = determineValuationState(
          medianForwardPe,
          medianEvEbitda,
          industry.cyclicalityClass
        );

        const industryState = determineIndustryState(
          valuationState,
          medianOperatingMargin,
          medianRoic,
          stockCount,
          metricsCount
        );

        const confidence = computeConfidence(stockCount, metricsCount);

        // Upsert analytics
        await db.insert(industryAnalytics).values({
          industryId: industry.id,
          sectorId: sectorId,
          universeSize: stockCount,
          medianForwardPe,
          medianEvEbitda,
          medianPriceToBook,
          medianOperatingMargin,
          medianRoic,
          medianRoe,
          medianFcfYield,
          valuationState,
          industryState,
          candidateCountValidated: 0,
          candidateCountPossible: 0,
          candidateCountTrapRisk: 0,
          confidence,
        });

        results.push({ industry: industry.name, sector: gicsSector.name, success: true });
      } catch (err) {
        results.push({
          industry: industry.name,
          sector: gicsSector.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Rate limit between sectors
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}
