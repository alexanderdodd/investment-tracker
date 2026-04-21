import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { gicsSectors, gicsIndustries, gicsIndustryGroups, stockClassifications, industryAnalytics, industryScreenResults } from "@/db/schema";
import { slugToSector } from "@/lib/sectors";
import { gicsSectorByName } from "@/lib/gics-taxonomy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: slug } = await params;
  const sectorName = slugToSector(slug);

  if (!sectorName) {
    return NextResponse.json({ error: "Unknown sector" }, { status: 404 });
  }

  const gicsSector = gicsSectorByName(sectorName);
  if (!gicsSector) {
    return NextResponse.json({ error: "No GICS mapping for sector" }, { status: 404 });
  }

  const sectorId = `sector-${gicsSector.code}`;
  const db = getDb();

  // Get all industries for this sector
  const industries = await db
    .select({
      id: gicsIndustries.id,
      code: gicsIndustries.code,
      name: gicsIndustries.name,
      slug: gicsIndustries.slug,
      cyclicalityClass: gicsIndustries.cyclicalityClass,
      valueFrameworkId: gicsIndustries.valueFrameworkId,
      industryGroupName: gicsIndustryGroups.name,
    })
    .from(gicsIndustries)
    .innerJoin(gicsIndustryGroups, eq(gicsIndustries.industryGroupId, gicsIndustryGroups.id))
    .where(eq(gicsIndustries.sectorId, sectorId));

  // Count stocks per industry
  const stockCounts = await db
    .select({
      industryId: stockClassifications.industryId,
    })
    .from(stockClassifications)
    .where(eq(stockClassifications.sectorId, sectorId));

  const countByIndustry: Record<string, number> = {};
  for (const row of stockCounts) {
    countByIndustry[row.industryId] = (countByIndustry[row.industryId] ?? 0) + 1;
  }

  // Get latest analytics per industry (if any)
  const analytics = await db
    .select()
    .from(industryAnalytics)
    .where(eq(industryAnalytics.sectorId, sectorId));

  const analyticsByIndustry: Record<string, typeof analytics[0]> = {};
  for (const a of analytics) {
    const existing = analyticsByIndustry[a.industryId];
    if (!existing || a.generatedAt > existing.generatedAt) {
      analyticsByIndustry[a.industryId] = a;
    }
  }

  // Get screen result counts per industry
  const screenRows = await db
    .select({
      industryId: industryScreenResults.industryId,
      screenState: industryScreenResults.screenState,
    })
    .from(industryScreenResults)
    .where(eq(industryScreenResults.sectorId, sectorId));

  const screenCountsByIndustry: Record<string, Record<string, number>> = {};
  for (const row of screenRows) {
    if (!screenCountsByIndustry[row.industryId]) screenCountsByIndustry[row.industryId] = {};
    screenCountsByIndustry[row.industryId][row.screenState] =
      (screenCountsByIndustry[row.industryId][row.screenState] ?? 0) + 1;
  }

  const result = industries.map((ind) => {
    const a = analyticsByIndustry[ind.id];
    const sc = screenCountsByIndustry[ind.id] ?? {};
    return {
      id: ind.id,
      code: ind.code,
      name: ind.name,
      slug: ind.slug,
      industryGroupName: ind.industryGroupName,
      cyclicalityClass: ind.cyclicalityClass,
      valueFrameworkId: ind.valueFrameworkId,
      stockCount: countByIndustry[ind.id] ?? 0,
      analytics: a
        ? {
            valuationState: a.valuationState,
            industryState: a.industryState,
            medianForwardPe: a.medianForwardPe,
            medianEvEbitda: a.medianEvEbitda,
            medianOperatingMargin: a.medianOperatingMargin,
            medianRoic: a.medianRoic,
            candidateCountValidated: a.candidateCountValidated,
            candidateCountPossible: a.candidateCountPossible,
            confidence: a.confidence,
            generatedAt: a.generatedAt.toISOString(),
          }
        : null,
      screenCounts: {
        published: sc.PUBLISHED_VALUE_CANDIDATE ?? 0,
        screenPass: sc.SCREEN_PASS ?? 0,
        deepWork: sc.NEEDS_DEEP_WORK ?? 0,
        trapRisk: sc.EXCLUDED_VALUE_TRAP_RISK ?? 0,
        watchlist: sc.WATCHLIST_ONLY ?? 0,
      },
    };
  });

  // Sort: industries with stocks first, then alphabetically
  result.sort((a, b) => {
    if (a.stockCount !== b.stockCount) return b.stockCount - a.stockCount;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ sector: sectorName, industries: result });
}
