/**
 * Discover UK/EU/EEA-listed equities via Yahoo Finance's region screener and
 * seed them into `european_listings`. These companies aren't in the SEC's
 * company_tickers list, so the Big Five sweep can't find them otherwise — this
 * gives the screener proactive European coverage (not just cached lookups).
 *
 * Deterministic, no LLM. Run periodically like `discover-stocks`.
 */

import { getDb } from "../db/index";
import { europeanListings } from "../db/schema";
import { getYahooCrumb } from "./stock-metrics";
import { isEuropeanExchange, isEuropeanTicker } from "./exchanges";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// The markets the user asked to cover, as Yahoo `region` codes.
export const EUROPEAN_REGIONS: { region: string; label: string }[] = [
  { region: "gb", label: "United Kingdom" },
  { region: "fr", label: "France" },
  { region: "nl", label: "Netherlands" },
  { region: "be", label: "Belgium" },
  { region: "pt", label: "Portugal" },
  { region: "ie", label: "Ireland" },
  { region: "de", label: "Germany" },
  { region: "ch", label: "Switzerland" },
  { region: "at", label: "Austria" },
  { region: "it", label: "Italy" },
  { region: "es", label: "Spain" },
  { region: "se", label: "Sweden" },
  { region: "dk", label: "Denmark" },
  { region: "fi", label: "Finland" },
  { region: "no", label: "Norway" },
];

interface ScreenerQuote {
  symbol?: string;
  longName?: string;
  shortName?: string;
  exchange?: string;
  marketCap?: number;
}

async function runRegionScreen(
  region: string,
  crumb: string,
  cookie: string,
  minMarketCap: number,
  size: number
): Promise<ScreenerQuote[]> {
  const body = {
    size: Math.min(size, 250),
    offset: 0,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: {
      operator: "AND",
      operands: [
        { operator: "eq", operands: ["region", region] },
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

export interface EuropeanDiscoveryResult {
  regionsQueried: number;
  discovered: number;
  upserted: number;
  byRegion: Record<string, number>;
}

/**
 * Query each European region for its largest listed companies and upsert them
 * into `european_listings`. `perRegion` caps how many per country (Yahoo's max
 * page is 250). Symbols are kept only if they sit on a European exchange, so
 * cross-listed US ADRs Yahoo may return are filtered out.
 */
export async function discoverEuropeanListings(
  options: { minMarketCap?: number; perRegion?: number; onlyRegion?: string } = {}
): Promise<EuropeanDiscoveryResult> {
  const db = getDb();
  const { crumb, cookie } = await getYahooCrumb();
  const minMktCap = options.minMarketCap ?? 1_000_000_000;
  const perRegion = options.perRegion ?? 250;

  let regions = EUROPEAN_REGIONS;
  if (options.onlyRegion) {
    const key = options.onlyRegion.toLowerCase();
    regions = regions.filter(
      (r) => r.region === key || r.label.toLowerCase() === key
    );
  }

  let discovered = 0;
  let upserted = 0;
  const byRegion: Record<string, number> = {};

  for (const { region } of regions) {
    const quotes = await runRegionScreen(region, crumb, cookie, minMktCap, perRegion);
    let count = 0;
    for (const q of quotes) {
      const ticker = (q.symbol ?? "").toUpperCase();
      if (!ticker) continue;
      // Keep only genuine European listings (skip any cross-listed US ADRs).
      if (!isEuropeanExchange(q.exchange) && !isEuropeanTicker(ticker)) continue;

      const row = {
        companyName: q.longName ?? q.shortName ?? ticker,
        exchange: q.exchange ?? null,
        region,
        marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
      };
      await db
        .insert(europeanListings)
        .values({ ticker, ...row })
        .onConflictDoUpdate({
          target: europeanListings.ticker,
          set: { ...row, discoveredAt: new Date() },
        });
      discovered++;
      upserted++;
      count++;
    }
    byRegion[region] = count;
    // Be polite to Yahoo between region queries
    await new Promise((r) => setTimeout(r, 400));
  }

  return { regionsQueried: regions.length, discovered, upserted, byRegion };
}
