import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { stockValuations } from "../db/schema";
import type { StockValuationInsights } from "./stock-valuation-insights";

const RESEARCH_MODEL = "google/gemini-2.5-flash:online";
const DATA_MODEL = "google/gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Quarter-freshness check
// ---------------------------------------------------------------------------

function getQuarterStart(date: Date): Date {
  const month = date.getMonth();
  const quarterMonth = month - (month % 3);
  return new Date(date.getFullYear(), quarterMonth, 1);
}

export async function getExistingValuation(ticker: string) {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.ticker, ticker.toUpperCase()))
    .orderBy(desc(stockValuations.generatedAt))
    .limit(1);

  if (!latest) return null;

  const currentQuarterStart = getQuarterStart(new Date());
  if (latest.generatedAt >= currentQuarterStart) {
    return latest;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 1: Business & Industry Understanding
// ---------------------------------------------------------------------------

async function generateBusinessOverview(ticker: string): Promise<string> {
  const prompt = `You are an equity analyst writing a business overview for ${ticker}.

Using current information, write a thorough analysis covering:
- What the company does, its main products/services, and revenue segments
- The business model (asset-light vs heavy, recurring vs transactional, etc.)
- The industry structure, main competitors, and competitive dynamics
- The company's competitive advantages or moats (brand, scale, network effects, switching costs, etc.)
- Recent strategic developments, management changes, or pivots

Be specific. Name competitors, cite market share where known, and reference recent developments. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 2: Financial Analysis
// ---------------------------------------------------------------------------

async function generateFinancialAnalysis(
  ticker: string,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst performing financial statement analysis for ${ticker}.

RESEARCH SO FAR:
${priorResearch}

Using the company's latest annual report (10-K) and most recent quarterly report (10-Q), write a thorough financial analysis covering:

1. Revenue quality: growth trends (3-5 year), organic vs acquired, geographic mix, recurring vs one-off
2. Profitability: gross/operating/net margin trends, ROE, ROIC
3. Cash generation: operating cash flow vs net income, free cash flow, any one-off adjustments to normalize
4. Balance sheet: debt levels, interest coverage, liquidity, working capital
5. Capital allocation: dividends, buybacks, M&A, reinvestment, shareholder dilution
6. Accounting quality: any unusual adjustments, non-GAAP reliance, goodwill risks, aggressive recognition

Cite specific numbers from the latest filings. Flag anything that looks like a one-off item that should be normalized. Be factual and thorough. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 3: Valuation Assessment
// ---------------------------------------------------------------------------

async function generateValuation(
  ticker: string,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst valuing ${ticker}.

RESEARCH SO FAR:
${priorResearch}

Perform a valuation analysis using multiple methods:

1. DCF approach:
   - Start from the most recent normalized free cash flow
   - State your assumptions for growth rate (next 5 years), terminal growth, and discount rate (WACC)
   - Show the rough math: projected FCF, terminal value, enterprise value, equity value, per-share value
   - Be explicit about every assumption

2. Relative valuation (multiples):
   - Calculate current P/E, EV/EBITDA, P/S, P/B where applicable
   - Compare to 3-5 relevant peers and to the stock's own 5-year historical range
   - Note whether the current multiple is above, below, or in-line with history and peers

3. Cross-check:
   - Do the DCF and multiples approaches agree or diverge?
   - What does that tell you about market expectations?

State the current market price and your estimated intrinsic value range. Be explicit about the margin of safety (or lack thereof). Be factual and measured. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 4: Risk Assessment & Scenarios
// ---------------------------------------------------------------------------

async function generateRiskAssessment(
  ticker: string,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst assessing risks and building scenarios for ${ticker}.

RESEARCH SO FAR:
${priorResearch}

Write a thorough risk and scenario analysis:

1. Bull case (1-2 sentences): what goes right, with a rough fair value or upside estimate
2. Base case (1-2 sentences): most likely outcome, with fair value estimate
3. Bear case (1-2 sentences): what goes wrong, with downside estimate

4. Key risks (3-5):
   - Business/competitive risks
   - Financial risks (leverage, currency, etc.)
   - Regulatory or legal risks
   - Macro or industry risks

5. Sensitivity analysis: which 2-3 assumptions move the valuation most? (e.g., "a 1% change in WACC moves fair value by $X")

6. Upcoming catalysts: what events in the next 3-6 months could change the thesis? (earnings, product launches, regulatory decisions, etc.)

Be specific with numbers. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 5: Structured insights extraction
// ---------------------------------------------------------------------------

async function extractStructuredInsights(
  ticker: string,
  researchDocument: string
): Promise<StockValuationInsights> {
  const prompt = `You are extracting structured data from a stock valuation research document for ${ticker}.

FULL RESEARCH DOCUMENT:
${researchDocument}

Produce a JSON object with EXACTLY this schema. Every field is required.

{
  "ticker": "${ticker}",
  "companyName": "<full company name>",
  "sector": "<GICS sector>",
  "verdict": "Undervalued" | "Fair Value" | "Overvalued",
  "verdictReason": "<1 sentence explaining why>",
  "confidence": "High" | "Medium" | "Low",
  "confidenceReason": "<1 sentence>",
  "currentPrice": <number or null>,
  "intrinsicValue": <number or null - your base case estimate>,
  "marginOfSafety": "<e.g. '+15% upside' or '-10% downside' or null>",

  "headline": "<3-4 sentences in plain English for someone with no finance background. What does this company do (in everyday terms), is the stock a good deal right now, and what's the one thing to know. Like explaining it to a friend over coffee.>",

  "businessSummary": "<2-3 sentences>",
  "businessModel": "<1-2 sentences on how they make money>",
  "competitivePosition": "<1-2 sentences on moats/advantages>",
  "industryContext": "<1-2 sentences on industry dynamics>",

  "revenueGrowth": "<1-2 sentences with specific numbers>",
  "profitability": "<1-2 sentences with margins, ROE, etc.>",
  "cashGeneration": "<1-2 sentences with FCF numbers>",
  "balanceSheetStrength": "<1-2 sentences on debt/liquidity>",
  "capitalAllocation": "<1-2 sentences on dividends/buybacks/reinvestment>",
  "accountingQuality": "<1-2 sentences on any red flags or clean bill of health>",

  "dcfSummary": "<2-3 sentences: assumptions and result>",
  "multiplesSummary": "<2-3 sentences: current multiples vs peers/history>",
  "peerComparison": "<1-2 sentences naming specific peers and how they compare>",

  "bullCase": "<1-2 sentences with upside target>",
  "baseCase": "<1-2 sentences with base target>",
  "bearCase": "<1-2 sentences with downside target>",
  "keyRisks": [
    { "label": "<2-4 words>", "detail": "<1 sentence>" },
    ... (3-5 items)
  ],
  "keyDrivers": [
    { "label": "<2-4 words>", "detail": "<1 sentence>" },
    ... (2-3 items)
  ],
  "sensitivityFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "catalysts": [
    { "label": "<2-4 words>", "detail": "<1 sentence about upcoming event>" },
    ... (2-4 items)
  ]
}

Rules:
- Include specific numbers from the research
- Plain language where possible
- Do not give investment advice
- Return ONLY valid JSON, no markdown fences`;

  const { text } = await generateText({
    model: openrouter()(DATA_MODEL),
    prompt,
  });

  let cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in response");
  return JSON.parse(jsonMatch[0]) as StockValuationInsights;
}

// ---------------------------------------------------------------------------
// Assemble research document
// ---------------------------------------------------------------------------

function assembleDocument(
  ticker: string,
  companyName: string,
  sections: {
    business: string;
    financials: string;
    valuation: string;
    risks: string;
  }
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `${companyName} (${ticker}) — Stock Valuation Report
Generated: ${date}

BUSINESS & INDUSTRY OVERVIEW
${sections.business}

FINANCIAL ANALYSIS
${sections.financials}

VALUATION ASSESSMENT
${sections.valuation}

RISK ASSESSMENT & SCENARIOS
${sections.risks}`;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function generateStockValuation(
  ticker: string
): Promise<{ success: boolean; error?: string }> {
  const upperTicker = ticker.toUpperCase();

  try {
    // Stage 1: Business overview
    console.log(`    Stage 1/4: Business overview...`);
    const business = await generateBusinessOverview(upperTicker);
    let research = `BUSINESS & INDUSTRY OVERVIEW\n${business}`;

    // Stage 2: Financial analysis
    console.log(`    Stage 2/4: Financial analysis...`);
    const financials = await generateFinancialAnalysis(upperTicker, research);
    research += `\n\nFINANCIAL ANALYSIS\n${financials}`;

    // Stage 3: Valuation
    console.log(`    Stage 3/4: Valuation...`);
    const valuation = await generateValuation(upperTicker, research);
    research += `\n\nVALUATION ASSESSMENT\n${valuation}`;

    // Stage 4: Risks & scenarios
    console.log(`    Stage 4/4: Risk assessment...`);
    const risks = await generateRiskAssessment(upperTicker, research);

    // Determine company name from the research
    const nameMatch = business.match(/^([A-Z][a-zA-Z\s&.,']+(?:Inc\.|Corp\.|Co\.|Company|plc|Ltd\.?))/);
    const companyName = nameMatch?.[1]?.trim() || upperTicker;

    // Assemble document
    const researchDocument = assembleDocument(upperTicker, companyName, {
      business,
      financials,
      valuation,
      risks,
    });

    // Extract structured insights
    console.log(`    Extracting structured insights...`);
    let structuredInsights: StockValuationInsights | null = null;
    try {
      structuredInsights = await extractStructuredInsights(upperTicker, researchDocument);
    } catch (err) {
      console.warn(`    Warning: failed to extract structured insights: ${err}`);
    }

    // Use company name from insights if available
    const finalName = structuredInsights?.companyName || companyName;

    // Persist
    const db = getDb();
    await db.insert(stockValuations).values({
      ticker: upperTicker,
      companyName: finalName,
      researchDocument,
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
