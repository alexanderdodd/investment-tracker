/**
 * "Beaten-down quality" — Big Five qualifiers trading furthest below their
 * 52-week high. Pure SQL over big_five_screen (change signals are populated
 * by the hourly sweep's enrichQuotes from the v7 quote payload), zero LLM.
 */

import { and, eq, gte, lte, isNotNull, asc } from "drizzle-orm";
import { getDb } from "../db/index";
import { bigFiveScreen } from "../db/schema";

/**
 * A quality business "on sale" is a large, liquid name that's pulled back —
 * not a micro-cap collapsing toward delisting. Floor out the junk (~$2B) and
 * treat anything more than ~70% below its high as distress, not opportunity.
 */
const MIN_MARKET_CAP = 2e9;
const MAX_DRAWDOWN = -0.7;

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
  return db
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
    })
    .from(bigFiveScreen)
    .where(
      and(
        eq(bigFiveScreen.available, true),
        gte(bigFiveScreen.score, 3),
        isNotNull(bigFiveScreen.pctFrom52wHigh),
        gte(bigFiveScreen.pctFrom52wHigh, MAX_DRAWDOWN),
        gte(bigFiveScreen.marketCap, MIN_MARKET_CAP)
      )
    )
    .orderBy(asc(bigFiveScreen.pctFrom52wHigh))
    .limit(limit);
}
