import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { sectorAnalyses } from "../db/schema";
import { SECTORS, SECTOR_ETFS, type SectorName } from "./sectors";
import { SECTOR_HOLDINGS } from "./sector-holdings";
import { distillStructuredInsights } from "./distill-structured-insights";
import {
  fetchSectorAndBenchmark,
  type ExtendedChanges,
} from "./sector-data";

// Online model for stages that need web-grounded research
const RESEARCH_MODEL = "google/gemini-2.5-flash:online";
const DATA_MODEL = "google/gemini-2.5-flash";

function formatChanges(c: ExtendedChanges): string {
  const fmt = (v: number | null) => (v !== null ? `${v > 0 ? "+" : ""}${v}%` : "N/A");
  return [
    `1 Day: ${fmt(c.day)}`,
    `1 Week: ${fmt(c.week)}`,
    `1 Month: ${fmt(c.month)}`,
    `3 Months: ${fmt(c.threeMonth)}`,
    `YTD: ${fmt(c.ytd)}`,
    `1 Year: ${fmt(c.year)}`,
    `3 Years: ${fmt(c.threeYear)}`,
    `5 Years: ${fmt(c.fiveYear)}`,
  ].join(" | ");
}

function formatHoldings(ticker: string): string {
  const holdings = SECTOR_HOLDINGS[ticker] ?? [];
  if (holdings.length === 0) return "Holdings data unavailable.";
  return holdings
    .map((h, i) => `${i + 1}. ${h.symbol} — ${h.name} (${h.weight.toFixed(2)}%)`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Stage 1: Data collection (no LLM)
// ---------------------------------------------------------------------------

interface StageOneData {
  sector: SectorName;
  ticker: string;
  sectorChanges: ExtendedChanges;
  benchmarkChanges: ExtendedChanges;
  holdingsText: string;
}

async function collectData(sector: SectorName): Promise<StageOneData> {
  const ticker = SECTOR_ETFS[sector];
  const { sector: sectorData, benchmark: benchmarkData } =
    await fetchSectorAndBenchmark(ticker);
  const holdingsText = formatHoldings(ticker);
  return {
    sector,
    ticker,
    sectorChanges: sectorData.changes,
    benchmarkChanges: benchmarkData.changes,
    holdingsText,
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Performance analysis
// ---------------------------------------------------------------------------

async function generatePerformanceSection(data: StageOneData): Promise<string> {
  const prompt = `You are a sector analyst writing a performance assessment for the ${data.sector} sector (tracked by the ${data.ticker} ETF).

SECTOR RETURNS:
${formatChanges(data.sectorChanges)}

BENCHMARK (SPY) RETURNS:
${formatChanges(data.benchmarkChanges)}

Write a thorough performance analysis. Address:
- How the sector has performed in absolute terms across each time window
- How it compares to the S&P 500 (SPY) at each window — outperforming, underperforming, or inline
- Whether this pattern suggests short-term momentum, a medium-term regime shift, or a long-term structural trend
- Any notable divergence between timeframes

Be factual, measured, and specific with the numbers. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(DATA_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 3: Sector structure & valuation
// ---------------------------------------------------------------------------

async function generateStructureSection(
  data: StageOneData,
  priorResearch: string
): Promise<string> {
  const prompt = `You are a sector analyst assessing the internal structure of the ${data.sector} sector (${data.ticker} ETF).

TOP 10 HOLDINGS:
${data.holdingsText}

RESEARCH SO FAR:
${priorResearch}

Write a thorough analysis of the sector's internal structure. Cover:
- Sub-industry composition: what types of companies dominate this ETF?
- Concentration: is the sector driven by a few mega-cap names or more evenly spread?
- Current valuation relative to the broad market (forward P/E, P/B, yield, growth expectations) and what that implies about investor expectations
- Whether recent performance has been broad-based or concentrated in a few names

Use your knowledge of current market valuations. Be factual and specific. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 4: Fundamental drivers (web-grounded)
// ---------------------------------------------------------------------------

async function generateDriversSection(
  data: StageOneData,
  priorResearch: string
): Promise<string> {
  const prompt = `You are a sector analyst explaining what is driving the ${data.sector} sector's recent performance.

RESEARCH SO FAR:
${priorResearch}

Using current information, write a thorough analysis of the fundamental reasons behind this sector's recent performance. Cover:
- What macro or industry factors changed (demand, policy, rates, earnings trends, technology shifts)?
- Are these cyclical or structural forces?
- What do recent earnings calls, industry reports, or economic data suggest about the trajectory?
- How do these drivers connect to the performance patterns identified above?

Cite specific data points, reports, or developments where possible (e.g., "U.S. electricity demand rose X% in 2025 according to the IEA"). Be factual and measured. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 5: Forward opportunities (web-grounded)
// ---------------------------------------------------------------------------

async function generateOpportunitiesSection(
  data: StageOneData,
  priorResearch: string
): Promise<string> {
  const prompt = `You are a sector analyst identifying forward-looking opportunities for the ${data.sector} sector.

RESEARCH SO FAR:
${priorResearch}

Using current information, write a thorough assessment of the most significant opportunities for this sector over the next 1-3 years. Organize around concrete themes such as:
- Demand growth trends (with specific projections if available)
- Infrastructure or capital spending tailwinds
- Technology transitions or disruptions
- Regulatory or policy tailwinds
- Company positioning advantages within the sector

Cite specific data, forecasts, or industry sources where possible. Be factual and balanced — acknowledge uncertainty where it exists. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 6: Forward risks (web-grounded)
// ---------------------------------------------------------------------------

async function generateRisksSection(
  data: StageOneData,
  priorResearch: string
): Promise<string> {
  const prompt = `You are a sector analyst identifying key risks for the ${data.sector} sector.

RESEARCH SO FAR:
${priorResearch}

Using current information, write a thorough assessment of the most significant risks that could limit or reverse this sector's performance over the next 1-3 years. Cover:
- Supply, capacity, or execution risks
- Regulatory, political, or affordability constraints
- Financing costs, rate sensitivity, or balance sheet stress
- Competitive or technological disruption
- Macro or geopolitical risks

Cite specific concerns, data, or reports where possible. Be factual and balanced — do not catastrophize, but be honest about what could go wrong. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Post-processing: distill research into user-facing summary
// ---------------------------------------------------------------------------

export async function distillForUser(
  sector: string,
  researchDocument: string
): Promise<string> {
  const prompt = `You are a financial writer distilling a detailed sector research document into a concise, structured summary for the ${sector} sector. This will be displayed on a sector dashboard.

FULL RESEARCH DOCUMENT:
${researchDocument}

Output the summary in EXACTLY this markdown structure. Do not deviate from this format:

## Bottom Line

1-2 sentences summarizing how the sector is performing relative to the S&P 500 and the single most important reason why. Include specific return numbers and timeframes (e.g., "+24% vs SPY's +17% over the past year"). Be direct.

## What's Driving This

- **[Driver name]:** 1-2 sentences explaining this driver with a specific data point or source
- **[Driver name]:** 1-2 sentences explaining this driver with a specific data point or source
- **[Driver name]:** (optional, only if there's a third meaningful driver)

## Opportunities

- **[Opportunity name]:** 1-2 sentences with specific projections or data where available
- **[Opportunity name]:** 1-2 sentences with specific projections or data where available
- **[Opportunity name]:** (optional third)

## Risks to Watch

- **[Risk name]:** 1-2 sentences with specific concerns or data
- **[Risk name]:** 1-2 sentences with specific concerns or data
- **[Risk name]:** (optional third)

Rules:
- Use plain language — keep it substantive but accessible
- Every bullet must include at least one specific number, source, or concrete detail
- Do not give investment advice or recommendations
- Do not add any sections beyond the four above
- Do not add introductory text before the first heading`;

  const { text } = await generateText({
    model: openrouter()(DATA_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Assemble the full research document from section outputs
// ---------------------------------------------------------------------------

function assembleResearchDocument(
  sector: string,
  ticker: string,
  sections: {
    performance: string;
    structure: string;
    drivers: string;
    opportunities: string;
    risks: string;
  }
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `${sector} Sector Analysis — ${ticker} ETF
Generated: ${date}

PERFORMANCE ASSESSMENT
${sections.performance}

SECTOR STRUCTURE & VALUATION
${sections.structure}

FUNDAMENTAL DRIVERS
${sections.drivers}

FORWARD OPPORTUNITIES
${sections.opportunities}

KEY RISKS
${sections.risks}`;
}

// ---------------------------------------------------------------------------
// Orchestrator: full pipeline (research + distill) for one sector
// ---------------------------------------------------------------------------

export async function generateSectorAnalysis(
  sector: SectorName
): Promise<{ success: boolean; error?: string }> {
  try {
    // Stage 1: Collect raw data
    const data = await collectData(sector);

    // Stage 2: Performance
    const performance = await generatePerformanceSection(data);
    let research = `PERFORMANCE ASSESSMENT\n${performance}`;

    // Stage 3: Structure (accumulates prior research)
    const structure = await generateStructureSection(data, research);
    research += `\n\nSECTOR STRUCTURE & VALUATION\n${structure}`;

    // Stage 4: Drivers (accumulates prior research)
    const drivers = await generateDriversSection(data, research);
    research += `\n\nFUNDAMENTAL DRIVERS\n${drivers}`;

    // Stage 5: Opportunities (accumulates prior research)
    const opportunities = await generateOpportunitiesSection(data, research);
    research += `\n\nFORWARD OPPORTUNITIES\n${opportunities}`;

    // Stage 6: Risks (accumulates prior research)
    const risks = await generateRisksSection(data, research);

    // Assemble the full document
    const researchDocument = assembleResearchDocument(
      data.sector,
      data.ticker,
      { performance, structure, drivers, opportunities, risks }
    );

    // Post-process: distill for user consumption
    const [userSummary, structuredInsights] = await Promise.all([
      distillForUser(data.sector, researchDocument),
      distillStructuredInsights(data.sector, researchDocument).catch(() => null),
    ]);

    // Persist all
    const db = getDb();
    await db.insert(sectorAnalyses).values({
      sector,
      researchDocument,
      userSummary,
      structuredInsights,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Re-distill: regenerate user summaries from existing research documents
// ---------------------------------------------------------------------------

export async function redistillSectorSummary(
  sector: SectorName
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const [latest] = await db
      .select()
      .from(sectorAnalyses)
      .where(eq(sectorAnalyses.sector, sector))
      .orderBy(desc(sectorAnalyses.generatedAt))
      .limit(1);

    if (!latest) {
      return { success: false, error: "No existing research document found" };
    }

    const userSummary = await distillForUser(sector, latest.researchDocument);

    await db
      .update(sectorAnalyses)
      .set({ userSummary })
      .where(eq(sectorAnalyses.id, latest.id));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function redistillAllSummaries(onlySector?: SectorName) {
  const sectors = onlySector ? [onlySector] : SECTORS;
  const results: { sector: string; success: boolean; error?: string }[] = [];

  for (const sector of sectors) {
    console.log(`  Distilling summary for ${sector}...`);
    const result = await redistillSectorSummary(sector);
    results.push({ sector, ...result });

    if (sectors.length > 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Re-distill: regenerate structured insights from existing research documents
// ---------------------------------------------------------------------------

export async function redistillSectorInsights(
  sector: SectorName
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const [latest] = await db
      .select()
      .from(sectorAnalyses)
      .where(eq(sectorAnalyses.sector, sector))
      .orderBy(desc(sectorAnalyses.generatedAt))
      .limit(1);

    if (!latest) {
      return { success: false, error: "No existing research document found" };
    }

    const structuredInsights = await distillStructuredInsights(sector, latest.researchDocument);

    await db
      .update(sectorAnalyses)
      .set({ structuredInsights })
      .where(eq(sectorAnalyses.id, latest.id));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function redistillAllInsights(onlySector?: SectorName) {
  const sectors = onlySector ? [onlySector] : SECTORS;
  const results: { sector: string; success: boolean; error?: string }[] = [];

  for (const sector of sectors) {
    console.log(`  Distilling insights for ${sector}...`);
    const result = await redistillSectorInsights(sector);
    results.push({ sector, ...result });

    if (sectors.length > 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public: generate full analyses for all sectors or a specific one
// ---------------------------------------------------------------------------

export async function generateAllSectorAnalyses(onlySector?: SectorName) {
  const sectors = onlySector ? [onlySector] : SECTORS;
  const results: { sector: string; success: boolean; error?: string }[] = [];

  for (const sector of sectors) {
    console.log(`  Generating analysis for ${sector}...`);
    const result = await generateSectorAnalysis(sector);
    results.push({ sector, ...result });

    // Delay between sectors to avoid rate limiting
    if (sectors.length > 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}
