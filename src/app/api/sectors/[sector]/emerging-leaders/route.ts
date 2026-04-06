import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { sectorEmergingLeaders } from "@/db/schema";
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

  // Get the 10 most recent leaders for this sector
  const leaders = await db
    .select()
    .from(sectorEmergingLeaders)
    .where(eq(sectorEmergingLeaders.sector, sector))
    .orderBy(desc(sectorEmergingLeaders.generatedAt), sectorEmergingLeaders.rank)
    .limit(10);

  if (leaders.length === 0) {
    return NextResponse.json({ leaders: [], generatedAt: null });
  }

  // Sort by rank for display
  leaders.sort((a, b) => a.rank - b.rank);

  return NextResponse.json({
    leaders: leaders.map((l) => ({
      ticker: l.ticker,
      companyName: l.companyName,
      rationale: l.rationale,
      metricLabel: l.metricLabel,
      metricValue: l.metricValue,
      rank: l.rank,
    })),
    generatedAt: leaders[0].generatedAt.toISOString(),
  });
}
