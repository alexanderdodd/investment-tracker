import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockMoats } from "@/db/schema";
import { generateMoatAnalysis, type MoatAnalysis } from "@/lib/generate-moat-analysis";
import { fetchCompanyProfile } from "@/lib/company-profile";

// Generation runs a web-grounded LLM call
export const maxDuration = 300;

// GET: stored moat analysis, if one exists
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const db = getDb();
  const [row] = await db
    .select()
    .from(stockMoats)
    .where(eq(stockMoats.ticker, upperTicker))
    .limit(1);

  return NextResponse.json({
    ticker: upperTicker,
    analysis: row?.analysis ?? null,
    generatedAt: row?.generatedAt.toISOString() ?? null,
  });
}

// POST: generate (or regenerate) the moat analysis and store it
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const profile = await fetchCompanyProfile(upperTicker).catch(() => null);

  let analysis: MoatAnalysis;
  try {
    analysis = await generateMoatAnalysis(
      upperTicker,
      profile?.name ?? null,
      profile?.description ?? null
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Moat analysis failed" },
      { status: 502 }
    );
  }

  const generatedAt = new Date();
  const db = getDb();
  await db
    .insert(stockMoats)
    .values({ ticker: upperTicker, analysis, generatedAt })
    .onConflictDoUpdate({
      target: stockMoats.ticker,
      set: { analysis, generatedAt },
    });

  return NextResponse.json({ analysis, generatedAt: generatedAt.toISOString() });
}
