import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { sectorAnalyses } from "@/db/schema";
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
  const [analysis] = await db
    .select()
    .from(sectorAnalyses)
    .where(eq(sectorAnalyses.sector, sector))
    .orderBy(desc(sectorAnalyses.generatedAt))
    .limit(1);

  if (!analysis) {
    return NextResponse.json({ analysis: null });
  }

  return NextResponse.json({
    analysis: {
      performanceSummary: analysis.performanceSummary,
      sectorStructure: analysis.sectorStructure,
      fundamentalDrivers: analysis.fundamentalDrivers,
      opportunities: analysis.opportunities,
      risks: analysis.risks,
      generatedAt: analysis.generatedAt.toISOString(),
    },
  });
}
