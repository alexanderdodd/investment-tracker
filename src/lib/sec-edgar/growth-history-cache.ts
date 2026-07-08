/**
 * DB-cached access to growth history payloads.
 *
 * The raw SEC EDGAR companyfacts source is 5-20 MB and rate-limited, so the
 * computed payload is cached in the stock_growth_history table. Shared by
 * the growth-rates and sticker-price API routes.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockGrowthHistories } from "@/db/schema";
import { buildGrowthHistory, type GrowthHistoryPayload } from "./growth-history";

const FRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Unavailable results retry sooner so transient EDGAR failures self-heal
const UNAVAILABLE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedGrowthHistory {
  payload: GrowthHistoryPayload;
  generatedAt: Date;
  fromCache: boolean;
  /** True when EDGAR failed and a stale cached row was served instead */
  stale: boolean;
}

export async function getOrBuildGrowthHistory(
  ticker: string,
  force = false
): Promise<CachedGrowthHistory> {
  const upperTicker = ticker.toUpperCase();
  const db = getDb();

  const [cached] = await db
    .select()
    .from(stockGrowthHistories)
    .where(eq(stockGrowthHistories.ticker, upperTicker))
    .limit(1);

  if (cached && !force) {
    const ttl = cached.payload.available ? FRESH_TTL_MS : UNAVAILABLE_TTL_MS;
    if (Date.now() - cached.generatedAt.getTime() < ttl) {
      return { payload: cached.payload, generatedAt: cached.generatedAt, fromCache: true, stale: false };
    }
  }

  let payload: GrowthHistoryPayload;
  try {
    payload = await buildGrowthHistory(upperTicker);
  } catch (err) {
    // EDGAR hiccup: serve the stale row if we have one
    if (cached) {
      return { payload: cached.payload, generatedAt: cached.generatedAt, fromCache: true, stale: true };
    }
    throw err;
  }

  const generatedAt = new Date();
  await db
    .insert(stockGrowthHistories)
    .values({ ticker: upperTicker, cik: payload.cik, payload, generatedAt })
    .onConflictDoUpdate({
      target: stockGrowthHistories.ticker,
      set: { cik: payload.cik, payload, generatedAt },
    });

  return { payload, generatedAt, fromCache: false, stale: false };
}
