/**
 * Auto-discover industry constituents from sector ETF holdings.
 *
 * Flow:
 * 1. For each sector ETF (XLK, XLF, etc.), fetch top holdings from Yahoo
 * 2. For each discovered ticker not already in DB, fetch assetProfile
 * 3. Map Yahoo industry → GICS industry using yahoo-to-gics.ts
 * 4. Upsert into stock_classification with source = "etf_discovery"
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { stockClassifications, gicsIndustries } from "../db/schema";
import { GICS_SECTORS } from "./gics-taxonomy";
import { getYahooCrumb } from "./stock-metrics";
import { yahooIndustryToGics, yahooSectorToGicsCode } from "./yahoo-to-gics";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface DiscoveryResult {
  ticker: string;
  companyName: string;
  yahooSector: string;
  yahooIndustry: string;
  gicsIndustryCode: string | null;
  action: "inserted" | "updated" | "skipped" | "unmapped";
}

/**
 * Fetch ETF top holdings from Yahoo Finance.
 * Returns array of { ticker, holdingName, holdingPercent }.
 */
async function fetchEtfHoldings(
  etfTicker: string,
  crumb: string,
  cookie: string
): Promise<{ symbol: string; holdingName: string; holdingPercent: number }[]> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${etfTicker}?modules=topHoldings&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: cookie },
  });

  if (!res.ok) {
    console.log(`    Failed to fetch holdings for ${etfTicker}: ${res.status}`);
    return [];
  }

  const json = await res.json();
  const holdings = json.quoteSummary?.result?.[0]?.topHoldings?.holdings ?? [];

  return holdings
    .filter((h: Record<string, unknown>) => h.symbol && typeof h.symbol === "string")
    .map((h: Record<string, unknown>) => ({
      symbol: h.symbol as string,
      holdingName: (h.holdingName as string) ?? "",
      holdingPercent: (h.holdingPercent as Record<string, unknown>)?.raw as number ?? 0,
    }));
}

/**
 * Fetch sector + industry from Yahoo assetProfile for a single ticker.
 */
async function fetchYahooProfile(
  ticker: string,
  crumb: string,
  cookie: string
): Promise<{ sector: string; industry: string; companyName: string } | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,price&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  if (!res.ok) return null;

  const json = await res.json();
  const result = json.quoteSummary?.result?.[0];
  const profile = result?.assetProfile;
  const price = result?.price;

  if (!profile?.sector || !profile?.industry) return null;

  return {
    sector: profile.sector,
    industry: profile.industry,
    companyName: price?.longName ?? price?.shortName ?? ticker,
  };
}

/**
 * Discover and classify stocks from sector ETF holdings.
 * Returns summary of what was discovered and inserted.
 */
export async function discoverConstituents(onlySector?: string): Promise<{
  totalDiscovered: number;
  inserted: number;
  updated: number;
  unmapped: number;
  skipped: number;
  results: DiscoveryResult[];
}> {
  const db = getDb();
  const results: DiscoveryResult[] = [];

  // Get Yahoo auth
  const { crumb, cookie } = await getYahooCrumb();

  // Get existing tickers to avoid redundant API calls
  const existingStocks = await db.select({ ticker: stockClassifications.ticker }).from(stockClassifications);
  const existingTickers = new Set(existingStocks.map((s) => s.ticker));

  // Get valid industry IDs for validation
  const allIndustries = await db.select({ id: gicsIndustries.id, code: gicsIndustries.code }).from(gicsIndustries);
  const validIndustryIds = new Set(allIndustries.map((i) => i.id));
  const industryCodeToId = Object.fromEntries(allIndustries.map((i) => [i.code, i.id]));

  const targetSectors = onlySector
    ? GICS_SECTORS.filter((s) => s.name === onlySector)
    : GICS_SECTORS;

  for (const sector of targetSectors) {
    console.log(`  Discovering ${sector.name} (${sector.etfTicker})...`);

    // Fetch ETF holdings
    const holdings = await fetchEtfHoldings(sector.etfTicker, crumb, cookie);
    console.log(`    ${holdings.length} holdings from ${sector.etfTicker}`);

    // Process each discovered ticker
    for (const holding of holdings) {
      const ticker = holding.symbol;

      // Skip if already exists with curated_override source (don't overwrite manual entries)
      if (existingTickers.has(ticker)) {
        results.push({
          ticker,
          companyName: holding.holdingName,
          yahooSector: "",
          yahooIndustry: "",
          gicsIndustryCode: null,
          action: "skipped",
        });
        continue;
      }

      // Fetch profile from Yahoo
      const profile = await fetchYahooProfile(ticker, crumb, cookie);
      if (!profile) {
        results.push({
          ticker,
          companyName: holding.holdingName,
          yahooSector: "",
          yahooIndustry: "",
          gicsIndustryCode: null,
          action: "skipped",
        });
        continue;
      }

      // Map Yahoo industry → GICS industry code
      const gicsIndCode = yahooIndustryToGics(profile.industry);
      const gicsSectorCode = yahooSectorToGicsCode(profile.sector);

      if (!gicsIndCode) {
        console.log(`    Unmapped: ${ticker} (${profile.industry})`);
        results.push({
          ticker,
          companyName: profile.companyName,
          yahooSector: profile.sector,
          yahooIndustry: profile.industry,
          gicsIndustryCode: null,
          action: "unmapped",
        });
        continue;
      }

      const industryId = `ind-${gicsIndCode}`;
      if (!validIndustryIds.has(industryId)) {
        console.log(`    Invalid industry ID: ${industryId} for ${ticker}`);
        results.push({
          ticker,
          companyName: profile.companyName,
          yahooSector: profile.sector,
          yahooIndustry: profile.industry,
          gicsIndustryCode: gicsIndCode,
          action: "unmapped",
        });
        continue;
      }

      // Derive industry group from industry code (first 4 digits)
      const igCode = gicsIndCode.substring(0, 4);
      const sectorCode = gicsSectorCode ?? sector.code;

      // Upsert into stock_classification
      await db
        .insert(stockClassifications)
        .values({
          ticker,
          companyName: profile.companyName,
          sectorId: `sector-${sectorCode}`,
          industryGroupId: `ig-${igCode}`,
          industryId: industryId,
          source: "etf_discovery",
        })
        .onConflictDoUpdate({
          target: stockClassifications.ticker,
          set: {
            companyName: profile.companyName,
            sectorId: `sector-${sectorCode}`,
            industryGroupId: `ig-${igCode}`,
            industryId: industryId,
            // Don't overwrite source if it's curated_override
          },
        });

      existingTickers.add(ticker);

      results.push({
        ticker,
        companyName: profile.companyName,
        yahooSector: profile.sector,
        yahooIndustry: profile.industry,
        gicsIndustryCode: gicsIndCode,
        action: "inserted",
      });

      console.log(`    + ${ticker} (${profile.industry} → ${gicsIndCode})`);
    }

    // Rate limit between sectors
    await new Promise((r) => setTimeout(r, 1000));
  }

  return {
    totalDiscovered: results.length,
    inserted: results.filter((r) => r.action === "inserted").length,
    updated: results.filter((r) => r.action === "updated").length,
    unmapped: results.filter((r) => r.action === "unmapped").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    results,
  };
}
