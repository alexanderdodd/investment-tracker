import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockClassifications, gicsIndustries, gicsSectors } from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const db = getDb();

  const rows = await db
    .select({
      ticker: stockClassifications.ticker,
      sectorName: gicsSectors.name,
      industryName: gicsIndustries.name,
      industrySlug: gicsIndustries.slug,
      cyclicalityClass: gicsIndustries.cyclicalityClass,
    })
    .from(stockClassifications)
    .innerJoin(gicsSectors, eq(stockClassifications.sectorId, gicsSectors.id))
    .innerJoin(gicsIndustries, eq(stockClassifications.industryId, gicsIndustries.id))
    .where(eq(stockClassifications.ticker, ticker.toUpperCase()));

  if (rows.length === 0) {
    return NextResponse.json({ classification: null });
  }

  return NextResponse.json({ classification: rows[0] });
}
