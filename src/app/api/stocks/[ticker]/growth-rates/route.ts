import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockGrowthHistories } from "@/db/schema";
import {
  buildGrowthHistory,
  type GrowthHistoryPayload,
} from "@/lib/sec-edgar/growth-history";

// Cold path fetches multi-MB companyfacts JSON from SEC EDGAR
export const maxDuration = 60;

const FRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Unavailable results retry sooner so transient EDGAR failures self-heal
const UNAVAILABLE_TTL_MS = 24 * 60 * 60 * 1000;

function payloadResponse(
  payload: GrowthHistoryPayload,
  generatedAt: Date,
  fromCache: boolean,
  stale = false
) {
  return NextResponse.json({
    ...payload,
    generatedAt: generatedAt.toISOString(),
    fromCache,
    ...(stale ? { stale: true } : {}),
  });
}

// GET: Big Five growth history for a ticker (DB-cached, 7-day TTL)
// ?force=true bypasses the cache and regenerates from SEC EDGAR
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const db = getDb();
  const [cached] = await db
    .select()
    .from(stockGrowthHistories)
    .where(eq(stockGrowthHistories.ticker, upperTicker))
    .limit(1);

  if (cached && !force) {
    const ttl = cached.payload.available ? FRESH_TTL_MS : UNAVAILABLE_TTL_MS;
    if (Date.now() - cached.generatedAt.getTime() < ttl) {
      return payloadResponse(cached.payload, cached.generatedAt, true);
    }
  }

  let payload: GrowthHistoryPayload;
  try {
    payload = await buildGrowthHistory(upperTicker);
  } catch (err) {
    // EDGAR hiccup: serve the stale row if we have one
    if (cached) {
      return payloadResponse(cached.payload, cached.generatedAt, true, true);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch SEC EDGAR data" },
      { status: 502 }
    );
  }

  const generatedAt = new Date();
  await db
    .insert(stockGrowthHistories)
    .values({ ticker: upperTicker, cik: payload.cik, payload, generatedAt })
    .onConflictDoUpdate({
      target: stockGrowthHistories.ticker,
      set: { cik: payload.cik, payload, generatedAt },
    });

  return payloadResponse(payload, generatedAt, false);
}
