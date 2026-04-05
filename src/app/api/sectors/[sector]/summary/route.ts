import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { sectorReports } from "@/db/schema";
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
  const [report] = await db
    .select()
    .from(sectorReports)
    .where(eq(sectorReports.sector, sector))
    .orderBy(desc(sectorReports.generatedAt))
    .limit(1);

  if (!report) {
    return NextResponse.json({ summary: null, generatedAt: null });
  }

  return NextResponse.json({
    summary: report.summary,
    generatedAt: report.generatedAt.toISOString(),
  });
}
