/**
 * Discover industry constituents via Yahoo Finance screener API.
 *
 * Strategy: iterate over each Yahoo industry name in our mapping table,
 * run the screener with market cap >= $2B and US major exchanges only,
 * then upsert discovered stocks.
 *
 * This is much broader than ETF holdings (50-200 stocks per industry
 * vs 10-15 from ETF top holdings).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { stockClassifications, gicsIndustries } from "../db/schema";
import { getYahooCrumb } from "./stock-metrics";
import { yahooSectorToGicsCode } from "./yahoo-to-gics";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// Yahoo industry names grouped by GICS industry code.
// The screener queries by Yahoo industry name, so we need the reverse mapping.
const GICS_TO_YAHOO_INDUSTRIES: Record<string, string[]> = {
  // Technology
  "451020": ["Information Technology Services"],
  "451030": ["Software - Infrastructure", "Software - Application"],
  "452010": ["Communication Equipment"],
  "452020": ["Consumer Electronics", "Computer Hardware"],
  "452030": ["Electronic Components", "Scientific & Technical Instruments"],
  "453010": ["Semiconductors", "Semiconductor Equipment & Materials"],
  // Consumer Staples
  "301010": ["Discount Stores", "Grocery Stores", "Food Distribution"],
  "302010": ["Beverages - Non-Alcoholic", "Beverages - Brewers", "Beverages - Wineries & Distilleries"],
  "302020": ["Packaged Foods", "Confectioners", "Farm Products"],
  "302030": ["Tobacco"],
  "303010": ["Household & Personal Products"],
  // Financials
  "401010": ["Banks - Diversified"],
  "401020": ["Banks - Regional"],
  "402010": ["Credit Services", "Financial Conglomerates"],
  "402020": ["Credit Services"], // shared with 402010 — COF/AXP go here via curated
  "402030": ["Capital Markets", "Asset Management", "Financial Data & Stock Exchanges"],
  "403010": ["Insurance - Property & Casualty", "Insurance - Life", "Insurance - Diversified", "Insurance - Specialty", "Insurance - Reinsurance", "Insurance Brokers"],
  // Industrials
  "201010": ["Aerospace & Defense"],
  "201020": ["Building Products & Equipment"],
  "201030": ["Engineering & Construction"],
  "201040": ["Electrical Equipment & Parts", "Specialty Industrial Machinery"],
  "201050": ["Conglomerates"],
  "201060": ["Farm & Heavy Construction Machinery"],
  "201070": ["Industrial Distribution"],
  "202010": ["Waste Management", "Security & Protection Services", "Staffing & Employment Services"],
  "202020": ["Consulting Services"],
  "203010": ["Integrated Freight & Logistics"],
  "203020": ["Airlines"],
  "203030": ["Marine Shipping"],
  "203040": ["Railroads", "Trucking"],
  // Energy
  "101010": ["Oil & Gas Integrated", "Oil & Gas E&P", "Oil & Gas Midstream", "Oil & Gas Refining & Marketing"],
  "101020": ["Oil & Gas Equipment & Services", "Oil & Gas Drilling"],
  // Materials
  "151010": ["Specialty Chemicals", "Chemicals", "Agricultural Inputs"],
  "151020": ["Building Materials"],
  "151030": ["Packaging & Containers"],
  "151040": ["Gold", "Copper", "Other Industrial Metals & Mining", "Steel", "Silver", "Aluminum"],
  // Consumer Discretionary
  "251010": ["Auto Parts"],
  "251020": ["Auto Manufacturers"],
  "252010": ["Residential Construction", "Furnishings, Fixtures & Appliances"],
  "252030": ["Luxury Goods", "Footwear & Accessories", "Apparel Manufacturing"],
  "253010": ["Restaurants", "Resorts & Casinos", "Lodging", "Travel Services", "Gambling"],
  "255020": ["Internet Retail"],
  "255030": ["Department Stores"],
  "255040": ["Home Improvement Retail", "Specialty Retail", "Apparel Retail"],
  // Health Care
  "351010": ["Medical Devices", "Medical Instruments & Supplies"],
  "351020": ["Healthcare Plans", "Medical Care Facilities", "Medical Distribution"],
  "351030": ["Health Information Services"],
  "352010": ["Biotechnology"],
  "352020": ["Drug Manufacturers - General", "Drug Manufacturers - Specialty & Generic"],
  "352030": ["Diagnostics & Research"],
  // Communication Services
  "501010": ["Telecom Services"],
  "502010": ["Broadcasting", "Publishing", "Advertising Agencies"],
  "502020": ["Entertainment", "Electronic Gaming & Multimedia"],
  "502030": ["Internet Content & Information"],
  // Utilities
  "551010": ["Utilities - Regulated Electric"],
  "551020": ["Utilities - Regulated Gas"],
  "551030": ["Utilities - Diversified"],
  "551040": ["Utilities - Regulated Water"],
  "551050": ["Utilities - Independent Power Producers", "Utilities - Renewable", "Solar"],
  // Real Estate
  "601010": ["REIT - Diversified"],
  "601025": ["REIT - Industrial"],
  "601030": ["REIT - Hotel & Motel"],
  "601040": ["REIT - Office"],
  "601050": ["REIT - Healthcare Facilities"],
  "601060": ["REIT - Residential"],
  "601070": ["REIT - Retail"],
  "601080": ["REIT - Specialty"],
  "602010": ["Real Estate Services", "Real Estate - Development"],
};

// Primary US exchanges — exclude OTC
const VALID_EXCHANGES = new Set(["NMS", "NYQ", "NGM", "NAS", "ASE", "BTS", "NCM"]);

interface ScreenerQuote {
  symbol: string;
  longName?: string;
  shortName?: string;
  exchange: string;
  marketCap?: number;
}

async function runScreenerQuery(
  yahooIndustry: string,
  crumb: string,
  cookie: string,
  minMarketCap = 2_000_000_000,
  maxResults = 100
): Promise<ScreenerQuote[]> {
  const body = {
    size: Math.min(maxResults, 250),
    offset: 0,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: {
      operator: "AND",
      operands: [
        { operator: "eq", operands: ["region", "us"] },
        { operator: "eq", operands: ["industry", yahooIndustry] },
        { operator: "gt", operands: ["intradaymarketcap", minMarketCap] },
      ],
    },
    userId: "",
    userIdType: "guid",
  };

  const url = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const json = await res.json();
  return json.finance?.result?.[0]?.quotes ?? [];
}

export interface ScreenerDiscoveryResult {
  totalDiscovered: number;
  inserted: number;
  skippedExisting: number;
  skippedExchange: number;
  industriesQueried: number;
  results: { ticker: string; companyName: string; gicsIndustryCode: string; action: string }[];
}

/**
 * Discover stocks across all mapped industries via Yahoo screener.
 * Much broader than ETF holdings — typically 20-100 stocks per industry.
 */
export async function discoverViaScreener(
  options: {
    onlySector?: string;
    minMarketCap?: number;
    maxPerIndustry?: number;
  } = {}
): Promise<ScreenerDiscoveryResult> {
  const db = getDb();
  const { crumb, cookie } = await getYahooCrumb();
  const minMktCap = options.minMarketCap ?? 2_000_000_000;
  const maxPer = options.maxPerIndustry ?? 50;

  // Get existing tickers
  const existingStocks = await db.select({ ticker: stockClassifications.ticker, source: stockClassifications.source }).from(stockClassifications);
  const existingTickers = new Set(existingStocks.map((s) => s.ticker));
  const curatedTickers = new Set(existingStocks.filter((s) => s.source === "curated_override").map((s) => s.ticker));

  // Get valid industry IDs
  const allIndustries = await db.select().from(gicsIndustries);
  const validIndustryIds = new Set(allIndustries.map((i) => i.id));

  // Filter to target sector if specified
  let targetGicsIndustries = Object.entries(GICS_TO_YAHOO_INDUSTRIES);
  if (options.onlySector) {
    const sectorCode = Object.entries({
      Energy: "10", Materials: "15", Industrials: "20",
      "Consumer Discretionary": "25", "Consumer Staples": "30",
      "Health Care": "35", Financials: "40", Technology: "45",
      "Communication Services": "50", Utilities: "55", "Real Estate": "60",
    }).find(([name]) => name === options.onlySector)?.[1];

    if (sectorCode) {
      targetGicsIndustries = targetGicsIndustries.filter(([code]) => code.startsWith(sectorCode));
    }
  }

  const results: ScreenerDiscoveryResult["results"] = [];
  let inserted = 0;
  let skippedExisting = 0;
  let skippedExchange = 0;
  let industriesQueried = 0;

  for (const [gicsCode, yahooNames] of targetGicsIndustries) {
    const industryId = `ind-${gicsCode}`;
    if (!validIndustryIds.has(industryId)) continue;

    const igCode = gicsCode.substring(0, 4);
    const sectorCode = gicsCode.substring(0, 2);

    for (const yahooName of yahooNames) {
      industriesQueried++;
      const quotes = await runScreenerQuery(yahooName, crumb, cookie, minMktCap, maxPer);

      for (const q of quotes) {
        const ticker = q.symbol;

        // Skip OTC/foreign exchanges
        if (!VALID_EXCHANGES.has(q.exchange)) {
          skippedExchange++;
          continue;
        }

        // Skip if already exists as curated (don't overwrite manual entries)
        if (curatedTickers.has(ticker)) {
          skippedExisting++;
          continue;
        }

        const companyName = q.longName ?? q.shortName ?? ticker;

        // Upsert — will update if previously discovered, insert if new
        await db
          .insert(stockClassifications)
          .values({
            ticker,
            companyName,
            sectorId: `sector-${sectorCode}`,
            industryGroupId: `ig-${igCode}`,
            industryId,
            source: "yahoo_screener",
          })
          .onConflictDoUpdate({
            target: stockClassifications.ticker,
            set: {
              companyName,
              sectorId: `sector-${sectorCode}`,
              industryGroupId: `ig-${igCode}`,
              industryId,
              // Keep source as yahoo_screener (don't overwrite curated)
            },
          });

        const isNew = !existingTickers.has(ticker);
        existingTickers.add(ticker);
        if (isNew) inserted++;
        else skippedExisting++;

        results.push({ ticker, companyName, gicsIndustryCode: gicsCode, action: isNew ? "inserted" : "updated" });
      }

      // Rate limit between queries
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return {
    totalDiscovered: results.length,
    inserted,
    skippedExisting,
    skippedExchange,
    industriesQueried,
    results,
  };
}
