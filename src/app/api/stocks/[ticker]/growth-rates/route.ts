import { NextResponse } from "next/server";
import { getOrBuildGrowthHistory } from "@/lib/sec-edgar/growth-history-cache";

// Cold path fetches multi-MB companyfacts JSON from SEC EDGAR
export const maxDuration = 60;

// GET: Big Five growth history for a ticker (DB-cached, 7-day TTL)
// ?force=true bypasses the cache and regenerates from SEC EDGAR
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  try {
    const { payload, generatedAt, fromCache, stale } = await getOrBuildGrowthHistory(
      ticker,
      force
    );
    return NextResponse.json({
      ...payload,
      generatedAt: generatedAt.toISOString(),
      fromCache,
      ...(stale ? { stale: true } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch SEC EDGAR data" },
      { status: 502 }
    );
  }
}
