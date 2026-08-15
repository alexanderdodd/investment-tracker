/**
 * "Beaten-down quality" — Big Five qualifiers trading furthest below their
 * 52-week high. Pure SQL over big_five_screen (change signals are populated
 * by the hourly sweep's enrichQuotes from the v7 quote payload), zero LLM.
 */

import { and, eq, gte, lte, isNotNull, asc, sql } from "drizzle-orm";
import { getDb } from "../db/index";
import { bigFiveScreen } from "../db/schema";

/**
 * A quality business "on sale" is a large, liquid name that's pulled back —
 * not a micro-cap collapsing toward delisting. Floor out the junk (~$2B) and
 * treat anything more than ~70% below its high as distress, not opportunity.
 */
const MIN_MARKET_CAP = 2e9;
const MAX_DRAWDOWN = -0.7;
/**
 * Consistency gate: a real beaten-down stock is also trading below its
 * 200-day average. This rejects bad-data rows where a stale/erroneous
 * 52-week high fakes a big drawdown while the stock actually sits at/above
 * its moving average (e.g. foreign shadow listings, one-day spikes).
 */
const MAX_VS_200D_AVG = -0.15;

export interface BeatenDownStock {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  currency: string | null;
  score: number;
  verdict: string | null;
  /** Decimal fractions; negative = below the reference level */
  pctFrom52wHigh: number | null;
  pctVs50dAvg: number | null;
  pctVs200dAvg: number | null;
}

/**
 * Big Five qualifiers (score >= 3) ranked by how far below their 52-week high
 * they trade — biggest losers first. Only rows the sweep has priced (a
 * non-null 52-week delta) are eligible.
 */
export async function beatenDownQualifiers(limit = 6): Promise<BeatenDownStock[]> {
  const db = getDb();

  // Collapse multi-exchange listings of the same company to one row, keeping
  // the primary line (highest market cap first) — matches the screener's
  // dedup. This drops foreign shadow listings (e.g. Broadcom's Frankfurt line)
  // whose 52-week-high data is unreliable in favour of the real US/primary quote.
  const dedupeKey = sql`lower(trim(coalesce(${bigFiveScreen.companyName}, ${bigFiveScreen.ticker})))`;
  const rn = sql<number>`row_number() over (partition by ${dedupeKey} order by ${bigFiveScreen.marketCap} desc nulls last, ${bigFiveScreen.score} desc, ${bigFiveScreen.ticker} asc)`;

  const sq = db
    .select({
      ticker: bigFiveScreen.ticker,
      companyName: bigFiveScreen.companyName,
      sector: bigFiveScreen.sector,
      currency: bigFiveScreen.currency,
      score: bigFiveScreen.score,
      verdict: bigFiveScreen.verdict,
      pctFrom52wHigh: bigFiveScreen.pctFrom52wHigh,
      pctVs50dAvg: bigFiveScreen.pctVs50dAvg,
      pctVs200dAvg: bigFiveScreen.pctVs200dAvg,
      rn: rn.as("rn"),
    })
    .from(bigFiveScreen)
    .where(
      and(
        eq(bigFiveScreen.available, true),
        gte(bigFiveScreen.score, 3),
        isNotNull(bigFiveScreen.pctFrom52wHigh),
        gte(bigFiveScreen.pctFrom52wHigh, MAX_DRAWDOWN),
        isNotNull(bigFiveScreen.pctVs200dAvg),
        lte(bigFiveScreen.pctVs200dAvg, MAX_VS_200D_AVG),
        gte(bigFiveScreen.marketCap, MIN_MARKET_CAP)
      )
    )
    .as("sq");

  const rows = await db
    .select({
      ticker: sq.ticker,
      companyName: sq.companyName,
      sector: sq.sector,
      currency: sq.currency,
      score: sq.score,
      verdict: sq.verdict,
      pctFrom52wHigh: sq.pctFrom52wHigh,
      pctVs50dAvg: sq.pctVs50dAvg,
      pctVs200dAvg: sq.pctVs200dAvg,
    })
    .from(sq)
    .where(eq(sq.rn, 1))
    .orderBy(asc(sq.pctFrom52wHigh))
    .limit(limit);
  return rows;
}
