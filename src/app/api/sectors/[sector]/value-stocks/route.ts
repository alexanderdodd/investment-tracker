import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { sectorValueStocks } from "@/db/schema";
import { slugToSector } from "@/lib/sectors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: slug } = await params;
  const sector = slugToSector(slug);

  if (!sector) {
    return NextResponse.json({ error: "Unknown sector" }, { status: 404 });
  }

  const db = getDb();

  const stocks = await db
    .select()
    .from(sectorValueStocks)
    .where(eq(sectorValueStocks.sector, sector))
    .orderBy(desc(sectorValueStocks.generatedAt), sectorValueStocks.rank)
    .limit(10);

  if (stocks.length === 0) {
    return NextResponse.json({ valueStocks: [], generatedAt: null });
  }

  stocks.sort((a, b) => a.rank - b.rank);

  return NextResponse.json({
    valueStocks: stocks.map((s) => ({
      ticker: s.ticker,
      companyName: s.companyName,
      rationale: s.rationale,
      metricLabel: s.metricLabel,
      metricValue: s.metricValue,
      rank: s.rank,
    })),
    generatedAt: stocks[0].generatedAt.toISOString(),
  });
}
