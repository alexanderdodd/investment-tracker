import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { stockValuations } from "../db/schema";
import type { StockValuationInsights } from "./stock-valuation-insights";

// ---------------------------------------------------------------------------
// Model routing: use each model where it's strongest
// ---------------------------------------------------------------------------

// Web-grounded research (fact extraction, business overview, financial analysis)
const RESEARCH_MODEL = "google/gemini-2.5-flash:online";
// Precise reasoning (valuation math, consistency checking)
const REASONING_MODEL = "anthropic/claude-sonnet-4";
// Fast structured extraction (JSON output)
const EXTRACTION_MODEL = "google/gemini-2.5-flash";

function parseJsonFromLLM(text: string): Record<string, unknown> {
  let cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in response");
  return JSON.parse(jsonMatch[0]);
}

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
// Industry framework detection
// ---------------------------------------------------------------------------

interface IndustryFramework {
  type: string;
  valuationGuidance: string;
  keyMetrics: string;
  compGuidance: string;
  normalizationNote: string;
}

function getIndustryFramework(sector: string, industry: string): IndustryFramework {
  const lower = `${sector} ${industry}`.toLowerCase();

  if (lower.includes("semiconductor") || lower.includes("memory") || lower.includes("chip")) {
    return {
      type: "semiconductor",
      valuationGuidance: `For semiconductor/memory companies, the valuation MUST account for cyclicality:
- Use MID-CYCLE normalized earnings/FCF, not peak-quarter figures
- If current margins are well above 5-year averages, explicitly note this is a cycle peak and discount accordingly
- For memory companies: forecast bit shipment growth, ASP trends, and cost-per-bit improvements separately
- Account for the trade ratio between HBM and commodity DRAM if applicable
- CapEx is lumpy and enormous — separate maintenance vs growth capex`,
      keyMetrics: "bit shipment growth, ASP trends, cost-per-bit, HBM mix, cycle position, capacity utilization, inventory days",
      compGuidance: "Primary comps MUST be other memory/semiconductor manufacturers (Samsung, SK hynix, Kioxia, Western Digital, etc.). DO NOT use NVIDIA, AMD, or cloud companies as primary comps — they are customers/ecosystem, not peers.",
      normalizationNote: "Memory is deeply cyclical. If current gross margins exceed the 5-year average by >15 percentage points, you MUST flag this and show what valuation looks like at mid-cycle margins.",
    };
  }

  if (lower.includes("financial") || lower.includes("bank") || lower.includes("insurance")) {
    return {
      type: "financial",
      valuationGuidance: `For financial companies:
- Use P/B (price-to-book) and ROE as primary valuation metrics
- DCF is less useful due to the nature of financial assets/liabilities
- Use residual income / excess return model if doing intrinsic valuation
- Focus on net interest margin, credit quality, regulatory capital ratios`,
      keyMetrics: "ROE, ROA, NIM, CET1 ratio, loan loss provisions, efficiency ratio, tangible book value",
      compGuidance: "Compare to banks/insurers of similar size and business mix. Separate commercial vs investment banking vs insurance.",
      normalizationNote: "Credit cycle matters. Normalize for provision levels and net charge-offs vs long-term averages.",
    };
  }

  if (lower.includes("consumer staples") || lower.includes("beverage") || lower.includes("food") || lower.includes("household")) {
    return {
      type: "consumer_staples",
      valuationGuidance: `For consumer staples:
- Pricing power and volume trends are the key revenue drivers — separate them
- Dividend growth model (DDM) is often appropriate alongside DCF
- These companies trade at premium multiples for stability — assess whether the premium is justified
- Focus on organic revenue growth (exclude M&A and FX effects)`,
      keyMetrics: "organic revenue growth, pricing vs volume, gross/operating margin trends, FCF yield, dividend growth rate, payout ratio",
      compGuidance: "Compare to other branded consumer goods companies with similar category exposure and geographic mix.",
      normalizationNote: "These businesses are relatively stable, but watch for one-off items like divestitures, restructuring charges, or large litigation settlements.",
    };
  }

  if (lower.includes("software") || lower.includes("saas") || lower.includes("cloud") || lower.includes("internet")) {
    return {
      type: "growth_tech",
      valuationGuidance: `For high-growth technology/software:
- Revenue growth rate and Rule of 40 (growth + FCF margin) are key
- EV/Revenue and EV/Gross Profit are often more useful than P/E for unprofitable companies
- For SaaS: track ARR, net revenue retention, customer acquisition cost, LTV/CAC
- Stock-based compensation is a REAL cost — always include it in expense analysis`,
      keyMetrics: "revenue growth, gross margin, Rule of 40, ARR/NRR (if SaaS), SBC as % of revenue, FCF margin",
      compGuidance: "Compare to software/cloud companies at similar growth stages and business models.",
      normalizationNote: "Stock-based comp can be 15-30% of revenue — never ignore it. If the company would be unprofitable including SBC, say so explicitly.",
    };
  }

  // Default framework
  return {
    type: "general",
    valuationGuidance: `Use standard DCF and multiples approach. Be explicit about all assumptions.`,
    keyMetrics: "revenue growth, operating margin, ROIC, FCF yield, debt/EBITDA",
    compGuidance: "Use competitors named in the company's 10-K as primary peers.",
    normalizationNote: "Check whether current margins and growth are above or below 5-year averages and adjust accordingly.",
  };
}

// ---------------------------------------------------------------------------
// Stage 0: Fact Extraction (VERIFIED DATA)
// ---------------------------------------------------------------------------

interface VerifiedFacts {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  currentPrice: number | null;
  priceDate: string;
  sharesOutstandingBasic: number | null;
  sharesOutstandingDiluted: number | null;
  marketCap: number | null;

  // Latest filing info
  latestAnnualFiling: string;
  latestQuarterlyFiling: string;
  fiscalYearEnd: string;

  // Current segments
  segments: string[];

  // TTM financials (4 most recent quarters)
  ttmRevenue: number | null;
  ttmGaapNetIncome: number | null;
  ttmGaapDilutedEPS: number | null;
  ttmOperatingCashFlow: number | null;
  ttmCapex: number | null;
  ttmGaapFreeCashFlow: number | null;
  quartersUsed: string;

  // Latest quarter snapshot
  latestQuarterRevenue: number | null;
  latestQuarterGrossMargin: number | null;
  latestQuarterOperatingMargin: number | null;
  latestQuarterNetMargin: number | null;

  // Balance sheet (most recent)
  totalCashAndInvestments: number | null;
  currentDebt: number | null;
  longTermDebt: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  bookValuePerShare: number | null;

  // Derived market metrics
  enterpriseValue: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
  evToTtmRevenue: number | null;

  // Key rates
  fiveYearAvgGrossMargin: number | null;
  fiveYearAvgOperatingMargin: number | null;

  // Competitors from 10-K
  primaryCompetitors: string[];

  // Management guidance
  guidanceSummary: string;

  // Dividend info
  annualDividendPerShare: number | null;
  dividendYield: number | null;

  // Notes on data quality
  dataQualityNotes: string[];
}

async function extractVerifiedFacts(ticker: string): Promise<VerifiedFacts> {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `You are a financial data analyst extracting verified facts from public filings for ${ticker}. Today's date is ${today}.

Your job is to extract ONLY factual data from the company's most recent 10-K, 10-Q, earnings release, and current market data. Do NOT estimate, interpolate, or guess. If a number is not available, use null.

Return a JSON object with EXACTLY this schema:

{
  "ticker": "${ticker}",
  "companyName": "<official legal name from filings>",
  "sector": "<GICS sector>",
  "industry": "<GICS sub-industry>",
  "currentPrice": <current stock price as of today, number or null>,
  "priceDate": "<today's date: ${today}>",
  "sharesOutstandingBasic": <basic shares in millions, from latest filing>,
  "sharesOutstandingDiluted": <diluted shares in millions, from latest filing>,
  "marketCap": <market cap in billions, = current price * diluted shares>,

  "latestAnnualFiling": "<e.g. '10-K for fiscal year ended August 28, 2025'>",
  "latestQuarterlyFiling": "<e.g. '10-Q for quarter ended February 26, 2026'>",
  "fiscalYearEnd": "<month>",

  "segments": ["<current reporting segment 1>", "<segment 2>", ...],

  "ttmRevenue": <trailing 12 month GAAP revenue in billions>,
  "ttmGaapNetIncome": <TTM GAAP net income in billions>,
  "ttmGaapDilutedEPS": <TTM GAAP diluted EPS - sum of last 4 quarters>,
  "ttmOperatingCashFlow": <TTM operating cash flow in billions>,
  "ttmCapex": <TTM capital expenditures in billions, as a POSITIVE number>,
  "ttmGaapFreeCashFlow": <TTM OCF minus TTM CapEx, in billions>,
  "quartersUsed": "<list the 4 quarters used, e.g. 'Q3 FY25, Q4 FY25, Q1 FY26, Q2 FY26'>",

  "latestQuarterRevenue": <most recent quarter revenue in billions>,
  "latestQuarterGrossMargin": <as decimal, e.g. 0.744>,
  "latestQuarterOperatingMargin": <as decimal>,
  "latestQuarterNetMargin": <as decimal>,

  "totalCashAndInvestments": <cash + short-term investments + marketable securities, in billions>,
  "currentDebt": <current portion of debt in billions>,
  "longTermDebt": <long-term debt in billions>,
  "totalDebt": <current + long-term debt in billions>,
  "totalEquity": <total stockholders equity in billions>,
  "bookValuePerShare": <total equity / diluted shares>,

  "enterpriseValue": <market cap + total debt - total cash, in billions>,
  "trailingPE": <current price / TTM GAAP diluted EPS>,
  "priceToBook": <current price / book value per share>,
  "evToTtmRevenue": <enterprise value / TTM revenue>,

  "fiveYearAvgGrossMargin": <5-year average gross margin as decimal, or null>,
  "fiveYearAvgOperatingMargin": <5-year average operating margin as decimal, or null>,

  "primaryCompetitors": ["<competitor 1 from 10-K>", "<competitor 2>", ...],

  "guidanceSummary": "<2-3 sentences summarizing management's most recent forward guidance>",

  "annualDividendPerShare": <current annual dividend per share, or null if none>,
  "dividendYield": <annual dividend / current price, or null>,

  "dataQualityNotes": ["<any caveats, e.g. 'fiscal year ends in August, not December', 'company reorganized segments in April 2025', etc.>"]
}

CRITICAL RULES:
- Use ONLY GAAP figures unless explicitly noted
- For TTM, sum the LAST FOUR REPORTED QUARTERS — do not annualize a single quarter
- Shares must be from the LATEST filing, not estimated
- Current price must be TODAY's price, not from weeks ago
- Competitors must come from the company's OWN 10-K competitive landscape section
- If the company recently reorganized segments, use the NEW segment names
- All dollar amounts in billions unless noted otherwise
- Return ONLY valid JSON`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });

  return parseJsonFromLLM(text) as unknown as VerifiedFacts;
}

function formatFactSheet(facts: VerifiedFacts): string {
  const fmt = (v: number | null, suffix = "") => v !== null ? `${v}${suffix}` : "N/A";
  const fmtB = (v: number | null) => v !== null ? `$${v.toFixed(2)}B` : "N/A";
  const fmtPct = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";

  return `VERIFIED DATA FACT SHEET — ${facts.companyName} (${facts.ticker})
As of: ${facts.priceDate}
Sector: ${facts.sector} | Industry: ${facts.industry}
Current segments: ${facts.segments.join(", ")}
Latest filings: ${facts.latestAnnualFiling} | ${facts.latestQuarterlyFiling}

MARKET DATA
  Price: $${fmt(facts.currentPrice)} (as of ${facts.priceDate})
  Shares (basic): ${fmt(facts.sharesOutstandingBasic, "M")} | Shares (diluted): ${fmt(facts.sharesOutstandingDiluted, "M")}
  Market cap: ${fmtB(facts.marketCap)} | Enterprise value: ${fmtB(facts.enterpriseValue)}

TTM FINANCIALS (${facts.quartersUsed})
  Revenue: ${fmtB(facts.ttmRevenue)}
  GAAP Net Income: ${fmtB(facts.ttmGaapNetIncome)}
  GAAP Diluted EPS: $${fmt(facts.ttmGaapDilutedEPS)}
  Operating Cash Flow: ${fmtB(facts.ttmOperatingCashFlow)}
  CapEx: ${fmtB(facts.ttmCapex)}
  GAAP Free Cash Flow (OCF - CapEx): ${fmtB(facts.ttmGaapFreeCashFlow)}

LATEST QUARTER
  Revenue: ${fmtB(facts.latestQuarterRevenue)}
  Gross Margin: ${fmtPct(facts.latestQuarterGrossMargin)}
  Operating Margin: ${fmtPct(facts.latestQuarterOperatingMargin)}
  Net Margin: ${fmtPct(facts.latestQuarterNetMargin)}

BALANCE SHEET
  Cash & Investments: ${fmtB(facts.totalCashAndInvestments)}
  Total Debt: ${fmtB(facts.totalDebt)} (Current: ${fmtB(facts.currentDebt)} | LT: ${fmtB(facts.longTermDebt)})
  Total Equity: ${fmtB(facts.totalEquity)}
  Book Value/Share: $${fmt(facts.bookValuePerShare)}

VALUATION METRICS (from verified data)
  Trailing P/E: ${fmt(facts.trailingPE, "x")}
  Price/Book: ${fmt(facts.priceToBook, "x")}
  EV/Revenue: ${fmt(facts.evToTtmRevenue, "x")}

HISTORICAL CONTEXT
  5yr Avg Gross Margin: ${fmtPct(facts.fiveYearAvgGrossMargin)}
  5yr Avg Operating Margin: ${fmtPct(facts.fiveYearAvgOperatingMargin)}

COMPETITORS (from 10-K): ${facts.primaryCompetitors.join(", ")}

GUIDANCE: ${facts.guidanceSummary}

DIVIDEND: ${facts.annualDividendPerShare !== null ? `$${facts.annualDividendPerShare}/share (${fmtPct(facts.dividendYield)} yield)` : "None"}

DATA QUALITY NOTES: ${facts.dataQualityNotes.join("; ")}

IMPORTANT: All subsequent analysis MUST use these verified numbers. Do not recompute TTM figures by annualizing a single quarter. Do not use non-GAAP metrics without explicitly labeling them as such.`;
}

// ---------------------------------------------------------------------------
// Stage 1: Business & Industry (web-grounded)
// ---------------------------------------------------------------------------

async function generateBusinessOverview(ticker: string, factSheet: string): Promise<string> {
  const prompt = `You are an equity analyst writing a business overview for ${ticker}.

VERIFIED DATA:
${factSheet}

Using the verified data above and current information, write a thorough analysis covering:
- What the company does, its main products/services, and CURRENT revenue segments (use the segment names from the verified data, not old ones)
- The business model (asset-light vs heavy, recurring vs transactional, etc.)
- The industry structure, main competitors (use the competitors from verified data as primary, plus any others), and competitive dynamics
- The company's competitive advantages or moats
- Recent strategic developments, management changes, or pivots
- Customer concentration: who are the largest customers and how dependent is the company on them?
- Geographic exposure: where does the company manufacture and sell?

Be specific. Cite the verified data where relevant. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 2: Financial Analysis (web-grounded)
// ---------------------------------------------------------------------------

async function generateFinancialAnalysis(
  ticker: string,
  factSheet: string,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst performing financial statement analysis for ${ticker}.

VERIFIED DATA:
${factSheet}

RESEARCH SO FAR:
${priorResearch}

Using the verified data above and the company's latest filings, write a thorough financial analysis. YOU MUST USE THE TTM AND BALANCE SHEET NUMBERS FROM THE VERIFIED DATA — do not recompute or use different figures.

Cover:
1. Revenue quality: growth trends (3-5 year), organic vs acquired, geographic mix, recurring vs one-off. Separate structural growth drivers from cyclical ones.
2. Profitability: gross/operating/net margin trends. Compare CURRENT margins to the 5-year averages from the verified data. If current margins are significantly above historical averages, explicitly flag that the company may be at a cyclical peak.
3. Cash generation: TTM operating cash flow vs net income ratio (should be >1x for quality earnings). TTM GAAP free cash flow. Any non-GAAP adjustments the company makes and whether they are legitimate.
4. Balance sheet: use the debt and cash figures from verified data. Interest coverage, liquidity, working capital trends.
5. Capital allocation: dividends, buybacks, M&A, reinvestment. Is the company diluting shareholders?
6. Accounting quality: non-GAAP vs GAAP divergence, one-off items to normalize, goodwill risks.

Be factual. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 3: Valuation (Claude for math precision)
// ---------------------------------------------------------------------------

async function generateValuation(
  ticker: string,
  factSheet: string,
  framework: IndustryFramework,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst performing a rigorous valuation of ${ticker}. You must be precise with arithmetic.

VERIFIED DATA:
${factSheet}

INDUSTRY-SPECIFIC GUIDANCE:
${framework.valuationGuidance}
Key metrics for this industry: ${framework.keyMetrics}
${framework.normalizationNote}

RESEARCH SO FAR:
${priorResearch}

Perform a valuation analysis using these EXACT steps:

STEP 1: NORMALIZE THE EARNINGS BASE
- Start from TTM GAAP Free Cash Flow from the verified data (OCF minus CapEx)
- If the company is in a cyclical peak (current margins >> 5-year average), calculate what FCF would be at mid-cycle margins and use THAT as your base
- If the company has large growth capex (new fabs, expansions), separate maintenance capex from growth capex and note this
- Do NOT annualize a single quarter. Do NOT use non-GAAP adjusted metrics as the base
- Show your work: "TTM GAAP FCF = TTM OCF ($X.XB) - TTM CapEx ($X.XB) = $X.XB"

STEP 2: DCF VALUATION
- Convert GAAP FCF to FCFF by adding back after-tax interest if needed
- State WACC derivation: risk-free rate, equity risk premium, beta, cost of equity, cost of debt, weights
- Use conservative growth rates that taper toward terminal growth
- If at cycle peak, grow from NORMALIZED (mid-cycle) base, not peak
- Terminal growth: 2-3% for most companies
- Show: Year 1-5 projected FCF, PV of each, terminal value, PV of terminal value
- Enterprise Value = Sum of PV of FCFs + PV of Terminal Value
- Equity Value = Enterprise Value + Cash - Debt (use verified data figures)
- Per share value = Equity Value / Diluted Shares (from verified data)

STEP 3: RELATIVE VALUATION (using MARKET values, not DCF values)
- Use the trailing P/E, P/B, and EV/Revenue from the VERIFIED DATA — do not recompute
- Compare to PRIMARY PEERS: ${framework.compGuidance}
- Compare to the stock's OWN 5-year historical P/E range
- Note whether current multiples are above, below, or in-line

STEP 4: CROSS-CHECK
- Do DCF and multiples agree? If they diverge significantly, explain why
- What is the market implicitly assuming about growth/margins?

STATE YOUR CONCLUSION:
- Current price: $X (from verified data)
- Base case intrinsic value: $X per share
- Intrinsic value range: $X - $X
- Margin of safety: X% upside or downside

Show all arithmetic. Be conservative rather than optimistic. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(REASONING_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 4: Risk Assessment (web-grounded)
// ---------------------------------------------------------------------------

async function generateRiskAssessment(
  ticker: string,
  factSheet: string,
  priorResearch: string
): Promise<string> {
  const prompt = `You are an equity analyst assessing risks and building scenarios for ${ticker}.

VERIFIED DATA:
${factSheet}

RESEARCH SO FAR:
${priorResearch}

Write a thorough risk and scenario analysis:

1. Bull case (2-3 sentences): what goes right, with a specific fair value estimate grounded in the DCF from the research
2. Base case (2-3 sentences): most likely outcome, with fair value from the DCF
3. Bear case (2-3 sentences): what goes wrong, with downside estimate. For cyclical companies, include a scenario where margins revert to historical averages.

4. Key risks (4-6), each with specific detail:
   - Business/competitive risks (market share, technology, customer concentration)
   - Financial risks (leverage, currency, capex execution)
   - Regulatory or legal risks (specific to this company, from the 10-K risk factors)
   - Macro or industry risks
   - Geographic/geopolitical risks (manufacturing location dependencies, trade restrictions)

5. Sensitivity analysis: which 2-3 assumptions move the valuation most? Quantify: "a 1% change in WACC moves fair value by $X, a 5pp change in terminal margin moves fair value by $X"

6. Upcoming catalysts (3-5): specific events in the next 3-6 months with dates where known

Be specific with numbers. Reference the verified data. Do not give investment advice. Do not use markdown formatting.`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 5: Consistency Check (Claude for logic)
// ---------------------------------------------------------------------------

async function runConsistencyCheck(
  factSheet: string,
  researchDocument: string
): Promise<string> {
  const prompt = `You are a financial report quality checker. Review this stock valuation report for errors and inconsistencies.

VERIFIED DATA (ground truth):
${factSheet}

RESEARCH REPORT TO CHECK:
${researchDocument}

Check for ALL of the following:

1. NUMBER MISMATCHES: Any numbers in the report that contradict the verified data (revenue, EPS, shares, debt, cash, margins, P/E, etc.)
2. ARITHMETIC ERRORS: Verify calculations: P/E = price/EPS, EV = market cap + debt - cash, FCF = OCF - CapEx, margin = income/revenue, etc.
3. STALE INPUTS: Prices from wrong dates, old segment names, outdated share counts
4. SIGN ERRORS: Cash flow items with wrong positive/negative direction
5. METHODOLOGY ERRORS: Using DCF-derived EV for market multiples (should use market EV), annualizing a single quarter instead of using TTM, using non-GAAP as base without disclosure
6. PEAK-CYCLE BLINDNESS: If current margins are well above 5-year averages, is this flagged? Is the valuation based on peak or normalized earnings?
7. LOGICAL CONTRADICTIONS: e.g., claiming FCF is $X in one section and using $Y in another

For each error found, state:
- LOCATION: Which section
- ERROR: What is wrong
- CORRECT VALUE: What it should be (from verified data)
- SEVERITY: High/Medium/Low

If the report is clean, state "PASS - No material errors found."

Do not rewrite the report. Just list the errors.`;

  const { text } = await generateText({
    model: openrouter()(REASONING_MODEL),
    prompt,
  });
  return text;
}

// ---------------------------------------------------------------------------
// Stage 6: Structured insights extraction
// ---------------------------------------------------------------------------

async function extractStructuredInsights(
  ticker: string,
  researchDocument: string,
  facts: VerifiedFacts
): Promise<StockValuationInsights> {
  const prompt = `You are extracting structured data from a stock valuation research document for ${ticker}.

VERIFIED DATA (use these numbers, not any conflicting numbers in the report):
Current Price: $${facts.currentPrice}
Intrinsic Value: extract from the report's base case conclusion
Company: ${facts.companyName}
Sector: ${facts.sector}

FULL RESEARCH DOCUMENT:
${researchDocument}

Produce a JSON object with EXACTLY this schema. Every field is required.

{
  "ticker": "${ticker}",
  "companyName": "${facts.companyName}",
  "sector": "${facts.sector}",
  "verdict": "Undervalued" | "Fair Value" | "Overvalued",
  "verdictReason": "<1 sentence explaining why, referencing specific price vs intrinsic value>",
  "confidence": "High" | "Medium" | "Low",
  "confidenceReason": "<1 sentence>",
  "currentPrice": ${facts.currentPrice ?? "null"},
  "intrinsicValue": <number from the report's base case, or null>,
  "marginOfSafety": "<e.g. '+15% upside' or '-10% downside' or null>",

  "headline": "<3-4 sentences in plain English for someone with no finance background. What does this company do (in everyday terms), is the stock a good deal right now, and what's the one thing to know. Like explaining it to a friend over coffee.>",

  "businessSummary": "<2-3 sentences>",
  "businessModel": "<1-2 sentences on how they make money>",
  "competitivePosition": "<1-2 sentences on moats/advantages>",
  "industryContext": "<1-2 sentences on industry dynamics>",

  "revenueGrowth": "<1-2 sentences with specific numbers>",
  "profitability": "<1-2 sentences with margins. If at cycle peak, say so.>",
  "cashGeneration": "<1-2 sentences with TTM GAAP FCF from verified data>",
  "balanceSheetStrength": "<1-2 sentences on debt/liquidity>",
  "capitalAllocation": "<1-2 sentences on dividends/buybacks/reinvestment>",
  "accountingQuality": "<1-2 sentences>",

  "dcfSummary": "<2-3 sentences: key assumptions and per-share result>",
  "multiplesSummary": "<2-3 sentences: current multiples vs peers/history>",
  "peerComparison": "<1-2 sentences naming specific peers>",

  "bullCase": "<1-2 sentences with upside target>",
  "baseCase": "<1-2 sentences with base target>",
  "bearCase": "<1-2 sentences with downside target>",
  "keyRisks": [
    { "label": "<2-4 words>", "detail": "<1 sentence>" }
  ],
  "keyDrivers": [
    { "label": "<2-4 words>", "detail": "<1 sentence>" }
  ],
  "sensitivityFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "catalysts": [
    { "label": "<2-4 words>", "detail": "<1 sentence about upcoming event>" }
  ]
}

Return ONLY valid JSON, no markdown fences.`;

  const { text } = await generateText({
    model: openrouter()(EXTRACTION_MODEL),
    prompt,
  });

  return parseJsonFromLLM(text) as unknown as StockValuationInsights;
}

// ---------------------------------------------------------------------------
// Assemble research document
// ---------------------------------------------------------------------------

function assembleDocument(
  ticker: string,
  companyName: string,
  factSheet: string,
  sections: {
    business: string;
    financials: string;
    valuation: string;
    risks: string;
    consistencyCheck: string;
  }
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `${companyName} (${ticker}) — Stock Valuation Report
Generated: ${date}

${factSheet}

BUSINESS & INDUSTRY OVERVIEW
${sections.business}

FINANCIAL ANALYSIS
${sections.financials}

VALUATION ASSESSMENT
${sections.valuation}

RISK ASSESSMENT & SCENARIOS
${sections.risks}

QUALITY CHECK
${sections.consistencyCheck}`;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  stage: number;
  totalStages: number;
  label: string;
  description: string;
  status: "running" | "complete" | "error";
  percent: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

const STAGES = [
  {
    label: "Extracting Verified Data",
    description: "Pulling verified financial data from the latest 10-K, 10-Q, and earnings release — share counts, TTM financials, balance sheet, competitors, and current market price",
  },
  {
    label: "Business & Industry",
    description: "Analyzing the business model, competitive position, industry dynamics, customer concentration, and recent strategic developments",
  },
  {
    label: "Financial Analysis",
    description: "Assessing revenue quality, profitability vs historical averages, cash generation, balance sheet strength, and accounting quality",
  },
  {
    label: "Valuation",
    description: "Building a DCF from normalized GAAP free cash flow, calculating market multiples vs peers, and cross-checking methods for consistency",
  },
  {
    label: "Risk & Scenarios",
    description: "Constructing bull/base/bear cases with price targets, identifying key risks, sensitivity factors, and upcoming catalysts",
  },
  {
    label: "Quality Check",
    description: "Checking the full report for arithmetic errors, stale data, methodology issues, and contradictions against the verified fact sheet",
  },
  {
    label: "Structuring Results",
    description: "Extracting key insights into a structured format for the dashboard display",
  },
];

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function generateStockValuation(
  ticker: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const upperTicker = ticker.toUpperCase();
  const total = STAGES.length;

  const report = (stage: number, status: "running" | "complete" | "error") => {
    if (!onProgress) return;
    const pct = status === "complete"
      ? Math.round(((stage + 1) / total) * 100)
      : Math.round(((stage + 0.5) / total) * 100);
    onProgress({
      stage: stage + 1,
      totalStages: total,
      label: STAGES[stage].label,
      description: STAGES[stage].description,
      status,
      percent: Math.min(pct, 100),
    });
  };

  try {
    // Stage 0: Extract verified facts
    report(0, "running");
    const facts = await extractVerifiedFacts(upperTicker);
    const factSheet = formatFactSheet(facts);
    const framework = getIndustryFramework(facts.sector, facts.industry);
    report(0, "complete");

    // Stage 1: Business overview
    report(1, "running");
    const business = await generateBusinessOverview(upperTicker, factSheet);
    let research = `BUSINESS & INDUSTRY OVERVIEW\n${business}`;
    report(1, "complete");

    // Stage 2: Financial analysis
    report(2, "running");
    const financials = await generateFinancialAnalysis(upperTicker, factSheet, research);
    research += `\n\nFINANCIAL ANALYSIS\n${financials}`;
    report(2, "complete");

    // Stage 3: Valuation (Claude for precision)
    report(3, "running");
    const valuation = await generateValuation(upperTicker, factSheet, framework, research);
    research += `\n\nVALUATION ASSESSMENT\n${valuation}`;
    report(3, "complete");

    // Stage 4: Risk assessment
    report(4, "running");
    const risks = await generateRiskAssessment(upperTicker, factSheet, research);
    report(4, "complete");

    // Assemble preliminary document for consistency check
    const prelimDoc = assembleDocument(upperTicker, facts.companyName, factSheet, {
      business,
      financials,
      valuation,
      risks,
      consistencyCheck: "(pending)",
    });

    // Stage 5: Consistency check (Claude for logic)
    report(5, "running");
    const consistencyCheck = await runConsistencyCheck(factSheet, prelimDoc);
    report(5, "complete");

    // Final document with consistency check included
    const researchDocument = assembleDocument(upperTicker, facts.companyName, factSheet, {
      business,
      financials,
      valuation,
      risks,
      consistencyCheck,
    });

    // Stage 6: Extract structured insights
    report(6, "running");
    let structuredInsights: StockValuationInsights | null = null;
    try {
      structuredInsights = await extractStructuredInsights(upperTicker, researchDocument, facts);
    } catch (err) {
      console.warn(`    Warning: failed to extract structured insights: ${err}`);
    }
    report(6, "complete");

    // Persist
    const db = getDb();
    await db.insert(stockValuations).values({
      ticker: upperTicker,
      companyName: facts.companyName,
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
