import { NextRequest, NextResponse } from "next/server";
import { eq, or, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db/index";
import {
  stockClassifications,
  gicsSectors,
  gicsIndustries,
} from "@/db/schema";

export type SearchResult = {
  ticker: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  source: "local" | "yahoo";
};

const MAX_RESULTS = 20;
const LOCAL_THRESHOLD = 5;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const db = getDb();
  const upper = q.toUpperCase();
  const pattern = `%${q}%`;

  // Rank: exact ticker match first, then ticker prefix, then company name match.
  const local = await db
    .select({
      ticker: stockClassifications.ticker,
      companyName: stockClassifications.companyName,
      sectorName: gicsSectors.name,
      industryName: gicsIndustries.name,
      rank: sql<number>`
        case
          when ${stockClassifications.ticker} = ${upper} then 0
          when ${stockClassifications.ticker} like ${upper + "%"} then 1
          when ${stockClassifications.companyName} ilike ${q + "%"} then 2
          else 3
        end
      `.as("rank"),
    })
    .from(stockClassifications)
    .innerJoin(gicsSectors, eq(stockClassifications.sectorId, gicsSectors.id))
    .innerJoin(
      gicsIndustries,
      eq(stockClassifications.industryId, gicsIndustries.id),
    )
    .where(
      or(
        ilike(stockClassifications.ticker, pattern),
        ilike(stockClassifications.companyName, pattern),
      ),
    )
    .orderBy(sql`rank, ${stockClassifications.ticker}`)
    .limit(MAX_RESULTS);

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const row of local) {
    if (seen.has(row.ticker)) continue;
    seen.add(row.ticker);
    results.push({
      ticker: row.ticker,
      companyName: row.companyName,
      sector: row.sectorName,
      industry: row.industryName,
      source: "local",
    });
  }

  // Fall back to Yahoo Finance search when we don't have enough local matches.
  // Yahoo's symbol-search endpoint is public and tolerant of unauth requests.
  if (results.length < LOCAL_THRESHOLD) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        q,
      )}&quotesCount=10&newsCount=0`;
      const yres = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (yres.ok) {
        const json = (await yres.json()) as {
          quotes?: Array<{
            symbol?: string;
            shortname?: string;
            longname?: string;
            quoteType?: string;
            exchange?: string;
            isYahooFinance?: boolean;
          }>;
        };
        for (const q of json.quotes ?? []) {
          if (results.length >= MAX_RESULTS) break;
          if (q.quoteType !== "EQUITY") continue;
          if (!q.symbol || !q.isYahooFinance) continue;
          // Exclude foreign-listed tickers (they contain a dot, e.g. "TSCO.L").
          if (q.symbol.includes(".")) continue;
          const sym = q.symbol.toUpperCase();
          if (seen.has(sym)) continue;
          seen.add(sym);
          results.push({
            ticker: sym,
            companyName: q.longname ?? q.shortname ?? sym,
            sector: null,
            industry: null,
            source: "yahoo",
          });
        }
      }
    } catch {
      // Yahoo search is best-effort; ignore failures.
    }
  }

  return NextResponse.json({ results });
}
