import { generateText } from "ai";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { sectorAnalyses } from "../db/schema";
import { SECTORS, SECTOR_ETFS, type SectorName } from "./sectors";
import { SECTOR_HOLDINGS } from "./sector-holdings";
import {
  fetchSectorAndBenchmark,
  type ExtendedChanges,
  type TickerPriceData,
} from "./sector-data";

// Use online model for stages that need web-grounded research
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
  sectorData: TickerPriceData;
  benchmarkData: TickerPriceData;
  holdingsText: string;
}

async function collectData(sector: SectorName): Promise<StageOneData> {
  const ticker = SECTOR_ETFS[sector];
  const { sector: sectorData, benchmark: benchmarkData } =
    await fetchSectorAndBenchmark(ticker);
  const holdingsText = formatHoldings(ticker);
  return { sector, ticker, sectorData, benchmarkData, holdingsText };
}

// ---------------------------------------------------------------------------
// Stage 2: Performance analysis
// ---------------------------------------------------------------------------

async function generatePerformanceSummary(data: StageOneData): Promise<string> {
  const prompt = `You are a sector analyst writing a performance assessment for the ${data.sector} sector (tracked by the ${data.ticker} ETF).

SECTOR RETURNS:
${formatChanges(data.sectorData.changes)}

BENCHMARK (SPY) RETURNS:
${formatChanges(data.benchmarkData.changes)}

Write 3-5 sentences analyzing how this sector has performed relative to the broad market. Address:
- Whether the sector is outperforming, underperforming, or inline across short, medium, and long windows
- Whether this looks like short-term momentum, a medium-term regime shift, or a long-term structural trend
- Any notable divergence between timeframes (e.g., strong recently but lagging over 3-5 years, or vice versa)

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

async function generateSectorStructure(
  data: StageOneData,
  performanceSummary: string
): Promise<string> {
  const prompt = `You are a sector analyst assessing the internal structure of the ${data.sector} sector (${data.ticker} ETF).

TOP 10 HOLDINGS:
${data.holdingsText}

PRIOR PERFORMANCE CONTEXT:
${performanceSummary}

Write 3-5 sentences covering:
- Sub-industry composition: what types of companies dominate this sector ETF?
- Concentration: is the sector driven by a few mega-cap names or more evenly spread?
- How the sector is typically valued relative to the broad market (P/E, yield, growth expectations) and what that implies about investor expectations

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

async function generateFundamentalDrivers(
  data: StageOneData,
  performanceSummary: string,
  sectorStructure: string
): Promise<string> {
  const prompt = `You are a sector analyst explaining what is driving the ${data.sector} sector's recent performance.

PERFORMANCE CONTEXT:
${performanceSummary}

SECTOR STRUCTURE:
${sectorStructure}

Using current information, write 4-6 sentences explaining the fundamental reasons behind this sector's recent performance. Cover:
- What macro or industry factors changed (demand, policy, rates, earnings trends, technology shifts)?
- Are these cyclical or structural forces?
- What do recent earnings calls, industry reports, or economic data suggest about the trajectory?

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

async function generateOpportunities(
  data: StageOneData,
  performanceSummary: string,
  sectorStructure: string,
  fundamentalDrivers: string
): Promise<string> {
  const prompt = `You are a sector analyst identifying forward-looking opportunities for the ${data.sector} sector.

PERFORMANCE CONTEXT:
${performanceSummary}

SECTOR STRUCTURE:
${sectorStructure}

FUNDAMENTAL DRIVERS:
${fundamentalDrivers}

Using current information, write 4-6 sentences identifying the most significant opportunities for this sector over the next 1-3 years. Organize around concrete themes such as:
- Demand growth trends (with specific projections if available)
- Infrastructure or capital spending tailwinds
- Technology transitions or disruptions
- Regulatory or policy tailwinds
- Company positioning advantages

Cite specific data, forecasts, or industry sources where possible. Be factual and balanced — acknowledge uncertainty. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 6: Forward risks (web-grounded)
// ---------------------------------------------------------------------------

async function generateRisks(
  data: StageOneData,
  performanceSummary: string,
  sectorStructure: string,
  fundamentalDrivers: string,
  opportunities: string
): Promise<string> {
  const prompt = `You are a sector analyst identifying key risks for the ${data.sector} sector.

PERFORMANCE CONTEXT:
${performanceSummary}

SECTOR STRUCTURE:
${sectorStructure}

FUNDAMENTAL DRIVERS:
${fundamentalDrivers}

OPPORTUNITIES:
${opportunities}

Using current information, write 4-6 sentences identifying the most significant risks that could limit or reverse the sector's performance over the next 1-3 years. Cover categories such as:
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
// Orchestrator: run all stages for one sector
// ---------------------------------------------------------------------------

async function generateSectorAnalysis(
  sector: SectorName
): Promise<{ success: boolean; error?: string }> {
  try {
    // Stage 1: Collect raw data
    const data = await collectData(sector);

    // Stage 2: Performance
    const performanceSummary = await generatePerformanceSummary(data);

    // Stage 3: Structure & valuation (depends on stage 2)
    const sectorStructure = await generateSectorStructure(data, performanceSummary);

    // Stage 4: Fundamental drivers (depends on stages 2-3)
    const fundamentalDrivers = await generateFundamentalDrivers(
      data,
      performanceSummary,
      sectorStructure
    );

    // Stage 5: Opportunities (depends on stages 2-4)
    const opportunities = await generateOpportunities(
      data,
      performanceSummary,
      sectorStructure,
      fundamentalDrivers
    );

    // Stage 6: Risks (depends on stages 2-5)
    const risks = await generateRisks(
      data,
      performanceSummary,
      sectorStructure,
      fundamentalDrivers,
      opportunities
    );

    // Persist
    const db = getDb();
    await db.insert(sectorAnalyses).values({
      sector,
      performanceSummary,
      sectorStructure,
      fundamentalDrivers,
      opportunities,
      risks,
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
// Public: generate analyses for all sectors
// ---------------------------------------------------------------------------

export async function generateAllSectorAnalyses() {
  const results: { sector: string; success: boolean; error?: string }[] = [];

  for (const sector of SECTORS) {
    console.log(`  Generating analysis for ${sector}...`);
    const result = await generateSectorAnalysis(sector);
    results.push({ sector, ...result });

    // Delay between sectors to avoid rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}
