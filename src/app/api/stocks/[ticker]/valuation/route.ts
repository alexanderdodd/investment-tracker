import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockValuations } from "@/db/schema";
import {
  getExistingValuation,
  generateStockValuation,
} from "@/lib/generate-stock-valuation";

// GET: retrieve the latest valuation for a ticker
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const db = getDb();
  const [latest] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.ticker, upperTicker))
    .orderBy(desc(stockValuations.generatedAt))
    .limit(1);

  if (!latest) {
    return NextResponse.json({ valuation: null });
  }

  return NextResponse.json({
    valuation: {
      ticker: latest.ticker,
      companyName: latest.companyName,
      researchDocument: latest.researchDocument,
      structuredInsights: latest.structuredInsights ?? null,
      generatedAt: latest.generatedAt.toISOString(),
    },
  });
}

// POST: trigger a new valuation (returns existing if fresh this quarter)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Check for a recent valuation from this quarter
  const existing = await getExistingValuation(upperTicker);
  if (existing) {
    return NextResponse.json({
      status: "existing",
      valuation: {
        ticker: existing.ticker,
        companyName: existing.companyName,
        researchDocument: existing.researchDocument,
        structuredInsights: existing.structuredInsights ?? null,
        generatedAt: existing.generatedAt.toISOString(),
      },
    });
  }

  // Generate new valuation
  const result = await generateStockValuation(upperTicker);

  if (!result.success) {
    return NextResponse.json(
      { status: "error", error: result.error },
      { status: 500 }
    );
  }

  // Fetch the just-created valuation
  const db = getDb();
  const [created] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.ticker, upperTicker))
    .orderBy(desc(stockValuations.generatedAt))
    .limit(1);

  return NextResponse.json({
    status: "generated",
    valuation: {
      ticker: created.ticker,
      companyName: created.companyName,
      researchDocument: created.researchDocument,
      structuredInsights: created.structuredInsights ?? null,
      generatedAt: created.generatedAt.toISOString(),
    },
  });
}
