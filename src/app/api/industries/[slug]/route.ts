import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import {
  gicsIndustries,
  gicsIndustryGroups,
  gicsSectors,
  stockClassifications,
  industryAnalytics,
} from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = getDb();

  // Find industry by slug
  const industries = await db
    .select({
      id: gicsIndustries.id,
      code: gicsIndustries.code,
      name: gicsIndustries.name,
      slug: gicsIndustries.slug,
      description: gicsIndustries.description,
      cyclicalityClass: gicsIndustries.cyclicalityClass,
      valueFrameworkId: gicsIndustries.valueFrameworkId,
      sectorId: gicsIndustries.sectorId,
      sectorName: gicsSectors.name,
      industryGroupName: gicsIndustryGroups.name,
    })
    .from(gicsIndustries)
    .innerJoin(gicsSectors, eq(gicsIndustries.sectorId, gicsSectors.id))
    .innerJoin(gicsIndustryGroups, eq(gicsIndustries.industryGroupId, gicsIndustryGroups.id))
    .where(eq(gicsIndustries.slug, slug));

  if (industries.length === 0) {
    return NextResponse.json({ error: "Industry not found" }, { status: 404 });
  }

  const industry = industries[0];

  // Get stocks in this industry
  const stocks = await db
    .select({
      ticker: stockClassifications.ticker,
      companyName: stockClassifications.companyName,
    })
    .from(stockClassifications)
    .where(eq(stockClassifications.industryId, industry.id));

  // Get latest analytics
  const analyticsRows = await db
    .select()
    .from(industryAnalytics)
    .where(eq(industryAnalytics.industryId, industry.id));

  // Pick latest
  let latestAnalytics = null;
  for (const a of analyticsRows) {
    if (!latestAnalytics || a.generatedAt > latestAnalytics.generatedAt) {
      latestAnalytics = a;
    }
  }

  return NextResponse.json({
    industry: {
      id: industry.id,
      code: industry.code,
      name: industry.name,
      slug: industry.slug,
      description: industry.description,
      cyclicalityClass: industry.cyclicalityClass,
      valueFrameworkId: industry.valueFrameworkId,
      sectorName: industry.sectorName,
      industryGroupName: industry.industryGroupName,
    },
    stocks: stocks.sort((a, b) => a.ticker.localeCompare(b.ticker)),
    analytics: latestAnalytics
      ? {
          valuationState: latestAnalytics.valuationState,
          industryState: latestAnalytics.industryState,
          universeSize: latestAnalytics.universeSize,
          medianForwardPe: latestAnalytics.medianForwardPe,
          medianEvEbitda: latestAnalytics.medianEvEbitda,
          medianPriceToBook: latestAnalytics.medianPriceToBook,
          medianOperatingMargin: latestAnalytics.medianOperatingMargin,
          medianRoic: latestAnalytics.medianRoic,
          medianRoe: latestAnalytics.medianRoe,
          medianFcfYield: latestAnalytics.medianFcfYield,
          candidateCountValidated: latestAnalytics.candidateCountValidated,
          candidateCountPossible: latestAnalytics.candidateCountPossible,
          candidateCountTrapRisk: latestAnalytics.candidateCountTrapRisk,
          confidence: latestAnalytics.confidence,
          generatedAt: latestAnalytics.generatedAt.toISOString(),
        }
      : null,
  });
}
