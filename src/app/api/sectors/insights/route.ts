import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/index";
import { sectorAnalyses } from "@/db/schema";

export async function GET() {
  const db = getDb();

  // Get the latest structured_insights for each sector using DISTINCT ON
  const rows = await db
    .select({
      sector: sectorAnalyses.sector,
      structuredInsights: sectorAnalyses.structuredInsights,
    })
    .from(sectorAnalyses)
    .where(sql`${sectorAnalyses.structuredInsights} IS NOT NULL`)
    .orderBy(sectorAnalyses.sector, sql`${sectorAnalyses.generatedAt} DESC`);

  // Deduplicate: keep only the first (most recent) row per sector
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    if (!result[row.sector]) {
      result[row.sector] = row.structuredInsights;
    }
  }

  return NextResponse.json(result);
}
