import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
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

  // Get the most recent generation timestamp for this sector
  const [latest] = await db
    .select({ generatedAt: sectorEmergingLeaders.generatedAt })
    .from(sectorEmergingLeaders)
    .where(eq(sectorEmergingLeaders.sector, sector))
    .orderBy(desc(sectorEmergingLeaders.generatedAt))
    .limit(1);

  if (!latest) {
    return NextResponse.json({ leaders: [], generatedAt: null });
  }

  // Get all leaders from that batch
  const leaders = await db
    .select()
    .from(sectorEmergingLeaders)
    .where(
      and(
        eq(sectorEmergingLeaders.sector, sector),
        eq(sectorEmergingLeaders.generatedAt, latest.generatedAt)
      )
    )
    .orderBy(sectorEmergingLeaders.rank);

  return NextResponse.json({
    leaders: leaders.map((l) => ({
      ticker: l.ticker,
      companyName: l.companyName,
      rationale: l.rationale,
      metricLabel: l.metricLabel,
      metricValue: l.metricValue,
      rank: l.rank,
    })),
    generatedAt: latest.generatedAt.toISOString(),
  });
}
