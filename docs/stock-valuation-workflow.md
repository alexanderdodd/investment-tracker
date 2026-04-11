# Stock Valuation Workflow — Technical Documentation

## Overview

The stock valuation system generates deep fundamental analysis reports for individual stocks on demand. Reports are cached per calendar quarter (a new report is only generated if no report exists for the current quarter). All reports are persisted for historical comparison.

The pipeline runs 7 sequential stages, each building on the accumulated output of prior stages. Three different LLM models are used, routed to the stage where each performs best.

---

## Model Routing

| Model ID | Provider | Used For | Why |
|---|---|---|---|
| `google/gemini-2.5-flash:online` | Google via OpenRouter | Stages 0, 1, 2, 4 (fact extraction, business research, financial analysis, risk assessment) | Web-grounded: can access current filings, market prices, and news in real time |
| `anthropic/claude-sonnet-4` | Anthropic via OpenRouter | Stages 3, 5 (valuation math, consistency check) | Stronger arithmetic reasoning, better at detecting logical contradictions |
| `google/gemini-2.5-flash` | Google via OpenRouter | Stage 6 (structured JSON extraction) | Fast, reliable at producing well-formed JSON from long documents |

All models are accessed through OpenRouter (`https://openrouter.ai/api/v1`) using the Vercel AI SDK (`@ai-sdk/openai` adapter with custom base URL). The `:online` suffix on Gemini Flash enables real-time web search grounding.

---

## Pipeline Stages

### Stage 0: Verified Fact Extraction

**Model:** `google/gemini-2.5-flash:online` (web-grounded)

**Purpose:** Extract a structured, verified fact sheet from the company's latest public filings before any analysis begins. This fact sheet becomes the single source of truth that all subsequent stages must reference.

**Why this exists:** The previous version of the pipeline had the LLM research and write simultaneously, which led to: stale segment names, wrong share counts, annualized peak-quarter figures instead of TTM, sign errors on cash flow items, and prices from weeks before the report date. By extracting facts first into a verified JSON object, we establish ground truth.

**Prompt (abbreviated):**
```
You are a financial data analyst extracting verified facts from public filings
for {ticker}. Today's date is {today}.

Your job is to extract ONLY factual data from the company's most recent 10-K,
10-Q, earnings release, and current market data. Do NOT estimate, interpolate,
or guess. If a number is not available, use null.

Return a JSON object with EXACTLY this schema: { ... }

CRITICAL RULES:
- Use ONLY GAAP figures unless explicitly noted
- For TTM, sum the LAST FOUR REPORTED QUARTERS — do not annualize a single quarter
- Shares must be from the LATEST filing, not estimated
- Current price must be TODAY's price, not from weeks ago
- Competitors must come from the company's OWN 10-K competitive landscape section
- If the company recently reorganized segments, use the NEW segment names
```

**Output:** A `VerifiedFacts` JSON object containing:
- Company identity: name, sector, GICS sub-industry
- Market data: current price (today's date), basic and diluted shares, market cap
- Filing info: which 10-K and 10-Q were used, fiscal year end month
- Current segments: the company's actual current reporting segments
- TTM financials: revenue, GAAP net income, GAAP diluted EPS, operating cash flow, capex, GAAP free cash flow — all computed as the sum of the last 4 reported quarters (not annualized from a single quarter)
- Latest quarter snapshot: revenue, gross/operating/net margins
- Balance sheet: cash & investments, current debt, long-term debt, total equity, book value per share
- Derived market metrics: enterprise value (market cap + debt − cash), trailing P/E (price / TTM GAAP diluted EPS), price-to-book, EV/revenue
- Historical context: 5-year average gross and operating margins (for cycle-peak detection)
- Competitors: extracted from the company's own 10-K competitive landscape section
- Management guidance: 2-3 sentence summary of forward guidance
- Dividend info: annual dividend per share, yield
- Data quality notes: caveats like non-standard fiscal year, segment reorganizations, etc.

**Post-processing:** The JSON is parsed, then formatted into a human-readable "VERIFIED DATA FACT SHEET" text block that is prepended to every subsequent prompt.

**Industry framework selection:** Based on the extracted sector and industry, the system selects an industry-specific valuation framework (see "Industry Frameworks" section below) that provides tailored guidance for the valuation stage.

---

### Stage 1: Business & Industry Overview

**Model:** `google/gemini-2.5-flash:online` (web-grounded)

**Input:** Verified fact sheet

**Prompt (abbreviated):**
```
You are an equity analyst writing a business overview for {ticker}.

VERIFIED DATA:
{factSheet}

Using the verified data above and current information, write a thorough
analysis covering:
- What the company does, its main products/services, and CURRENT revenue
  segments (use the segment names from the verified data, not old ones)
- The business model (asset-light vs heavy, recurring vs transactional, etc.)
- The industry structure, main competitors (use the competitors from
  verified data as primary, plus any others), and competitive dynamics
- The company's competitive advantages or moats
- Recent strategic developments, management changes, or pivots
- Customer concentration: who are the largest customers and how dependent
  is the company on them?
- Geographic exposure: where does the company manufacture and sell?
```

**Output:** Free-text business overview (typically 800-1500 words)

**Key design decisions:**
- The prompt explicitly instructs the model to use segment names from the verified data, not older names it may have in training data
- Customer concentration and geographic exposure were added after expert review flagged these as commonly omitted
- Competitors from the verified fact sheet are specified as "primary" to prevent the model from substituting ecosystem partners (e.g., using NVIDIA as a peer for a memory manufacturer)

---

### Stage 2: Financial Analysis

**Model:** `google/gemini-2.5-flash:online` (web-grounded)

**Input:** Verified fact sheet + Stage 1 output (accumulated research)

**Prompt (abbreviated):**
```
You are an equity analyst performing financial statement analysis for {ticker}.

VERIFIED DATA:
{factSheet}

RESEARCH SO FAR:
{priorResearch}

Using the verified data above and the company's latest filings, write a
thorough financial analysis. YOU MUST USE THE TTM AND BALANCE SHEET NUMBERS
FROM THE VERIFIED DATA — do not recompute or use different figures.

Cover:
1. Revenue quality: growth trends (3-5 year), organic vs acquired, geographic
   mix, recurring vs one-off. Separate structural growth drivers from cyclical ones.
2. Profitability: gross/operating/net margin trends. Compare CURRENT margins
   to the 5-year averages from the verified data. If current margins are
   significantly above historical averages, explicitly flag that the company
   may be at a cyclical peak.
3. Cash generation: TTM operating cash flow vs net income ratio (should be >1x
   for quality earnings). TTM GAAP free cash flow. Any non-GAAP adjustments the
   company makes and whether they are legitimate.
4. Balance sheet: use the debt and cash figures from verified data. Interest
   coverage, liquidity, working capital trends.
5. Capital allocation: dividends, buybacks, M&A, reinvestment. Is the company
   diluting shareholders?
6. Accounting quality: non-GAAP vs GAAP divergence, one-off items to normalize,
   goodwill risks.
```

**Output:** Free-text financial analysis (typically 1000-2000 words)

**Key design decisions:**
- The prompt forces the model to compare current margins to 5-year averages and flag cycle peaks. This addresses the expert critique that the previous version was "peak-cycle blind"
- The instruction to separate structural from cyclical growth drivers ensures the analysis doesn't conflate a memory pricing recovery with a permanent shift
- Explicit instruction to use TTM numbers from verified data prevents the model from recomputing (incorrectly) by annualizing a single quarter

---

### Stage 3: Valuation

**Model:** `anthropic/claude-sonnet-4` (reasoning model)

**Input:** Verified fact sheet + industry framework + Stages 1-2 output

**Why Claude for this stage:** The previous version used Gemini for valuation, which led to: annualizing a peak quarter instead of using TTM, using non-GAAP FCF as the DCF base without disclosure, computing P/E incorrectly, and using DCF-derived enterprise value for market multiples. Claude Sonnet has stronger arithmetic reasoning and is more reliable at following multi-step quantitative instructions.

**Prompt (abbreviated):**
```
You are an equity analyst performing a rigorous valuation of {ticker}. You must
be precise with arithmetic.

VERIFIED DATA:
{factSheet}

INDUSTRY-SPECIFIC GUIDANCE:
{framework.valuationGuidance}
Key metrics for this industry: {framework.keyMetrics}
{framework.normalizationNote}

RESEARCH SO FAR:
{priorResearch}

Perform a valuation analysis using these EXACT steps:

STEP 1: NORMALIZE THE EARNINGS BASE
- Start from TTM GAAP Free Cash Flow from the verified data (OCF minus CapEx)
- If the company is in a cyclical peak (current margins >> 5-year average),
  calculate what FCF would be at mid-cycle margins and use THAT as your base
- Do NOT annualize a single quarter. Do NOT use non-GAAP adjusted metrics as base
- Show your work: "TTM GAAP FCF = TTM OCF ($X.XB) - TTM CapEx ($X.XB) = $X.XB"

STEP 2: DCF VALUATION
- Convert GAAP FCF to FCFF by adding back after-tax interest if needed
- State WACC derivation: risk-free rate, equity risk premium, beta, cost of equity,
  cost of debt, weights
- Use conservative growth rates that taper toward terminal growth
- If at cycle peak, grow from NORMALIZED (mid-cycle) base, not peak
- Show: Year 1-5 projected FCF, PV of each, terminal value, PV of terminal value
- Enterprise Value = Sum of PV of FCFs + PV of Terminal Value
- Equity Value = EV + Cash - Debt (use verified data figures)
- Per share value = Equity Value / Diluted Shares (from verified data)

STEP 3: RELATIVE VALUATION (using MARKET values, not DCF values)
- Use the trailing P/E, P/B, and EV/Revenue from the VERIFIED DATA — do not recompute
- Compare to PRIMARY PEERS: {framework.compGuidance}
- Compare to the stock's OWN 5-year historical P/E range

STEP 4: CROSS-CHECK
- Do DCF and multiples agree? If they diverge significantly, explain why
- What is the market implicitly assuming about growth/margins?

STATE YOUR CONCLUSION:
- Current price: $X (from verified data)
- Base case intrinsic value: $X per share
- Intrinsic value range: $X - $X
- Margin of safety: X% upside or downside
```

**Output:** Free-text valuation analysis with explicit arithmetic (typically 1500-2500 words)

**Key design decisions:**
- Explicit "show your work" instructions to make assumptions auditable
- The normalization step forces the model to check whether it's valuing peak or mid-cycle earnings
- Market multiples must come from the verified data (which uses market enterprise value), preventing the previous error of using DCF-derived EV for multiples
- Industry-specific framework injects tailored guidance (see below)

---

### Stage 4: Risk Assessment & Scenarios

**Model:** `google/gemini-2.5-flash:online` (web-grounded)

**Input:** Verified fact sheet + Stages 1-3 output

**Prompt (abbreviated):**
```
You are an equity analyst assessing risks and building scenarios for {ticker}.

VERIFIED DATA:
{factSheet}

RESEARCH SO FAR:
{priorResearch}

Write a thorough risk and scenario analysis:

1. Bull case (2-3 sentences): what goes right, with a specific fair value
   estimate grounded in the DCF from the research
2. Base case (2-3 sentences): most likely outcome, with fair value from the DCF
3. Bear case (2-3 sentences): what goes wrong, with downside estimate. For
   cyclical companies, include a scenario where margins revert to historical averages.

4. Key risks (4-6), each with specific detail:
   - Business/competitive risks (market share, technology, customer concentration)
   - Financial risks (leverage, currency, capex execution)
   - Regulatory or legal risks (specific to this company, from the 10-K risk factors)
   - Macro or industry risks
   - Geographic/geopolitical risks (manufacturing dependencies, trade restrictions)

5. Sensitivity analysis: which 2-3 assumptions move the valuation most? Quantify.

6. Upcoming catalysts (3-5): specific events in the next 3-6 months with dates
```

**Output:** Free-text risk analysis (typically 800-1500 words)

**Key design decisions:**
- Bear case explicitly requires a margin-reversion scenario for cyclical companies
- Risk categories include geographic/geopolitical, which was previously omitted
- Sensitivity analysis must be quantified (e.g., "1% change in WACC moves fair value by $X")
- Catalysts must be specific events with dates, not vague themes

---

### Stage 5: Consistency Check

**Model:** `anthropic/claude-sonnet-4` (reasoning model)

**Input:** Verified fact sheet (ground truth) + assembled research document

**Purpose:** Automated quality assurance. Checks the entire report against the verified fact sheet for errors before the report is finalized.

**Why this exists:** Expert review of the previous version found: numbers that contradicted the filings, arithmetic errors in P/E and EV calculations, stale market prices, sign errors on cash flow items, and the valuation using a different FCF number than stated elsewhere in the report. This stage catches those errors.

**Prompt (abbreviated):**
```
You are a financial report quality checker. Review this stock valuation report
for errors and inconsistencies.

VERIFIED DATA (ground truth):
{factSheet}

RESEARCH REPORT TO CHECK:
{researchDocument}

Check for ALL of the following:

1. NUMBER MISMATCHES: Any numbers in the report that contradict the verified data
2. ARITHMETIC ERRORS: Verify P/E = price/EPS, EV = mcap + debt - cash, etc.
3. STALE INPUTS: Prices from wrong dates, old segment names
4. SIGN ERRORS: Cash flow items with wrong positive/negative direction
5. METHODOLOGY ERRORS: Using DCF-derived EV for market multiples, annualizing a
   single quarter instead of using TTM, using non-GAAP as base without disclosure
6. PEAK-CYCLE BLINDNESS: If current margins >> 5-year averages, is this flagged?
7. LOGICAL CONTRADICTIONS: Claiming FCF is $X in one section and using $Y in another

For each error found, state:
- LOCATION: Which section
- ERROR: What is wrong
- CORRECT VALUE: What it should be
- SEVERITY: High/Medium/Low
```

**Output:** Error list or "PASS — No material errors found." This output is included in the final report under a "QUALITY CHECK" section.

**Key design decisions:**
- Uses Claude rather than Gemini because detecting logical contradictions and arithmetic errors requires stronger reasoning
- The check is included in the final document so the reader can see what was flagged
- Currently the check reports errors but does not automatically fix them — the errors are visible in the report for the user to assess

---

### Stage 6: Structured Insights Extraction

**Model:** `google/gemini-2.5-flash` (fast extraction, no web search needed)

**Input:** Final research document + verified facts (for price anchoring)

**Purpose:** Extract a structured JSON object from the free-text report to power the dashboard UI.

**Prompt (abbreviated):**
```
You are extracting structured data from a stock valuation research document
for {ticker}.

VERIFIED DATA (use these numbers, not any conflicting numbers in the report):
Current Price: ${facts.currentPrice}
Company: ${facts.companyName}
Sector: ${facts.sector}

FULL RESEARCH DOCUMENT:
{researchDocument}

Produce a JSON object with EXACTLY this schema: { ... }
```

**Output:** `StockValuationInsights` JSON object containing:
- Header: verdict (Undervalued/Fair Value/Overvalued), confidence, current price, intrinsic value, margin of safety
- Headline: 3-4 plain-English sentences for non-finance audience
- Business: summary, business model, competitive position, industry context
- Financials: revenue growth, profitability, cash generation, balance sheet, capital allocation, accounting quality (each 1-2 sentences)
- Valuation: DCF summary, multiples summary, peer comparison
- Scenarios: bull/base/bear cases with price targets
- Risks/drivers/catalysts: labeled bullet lists
- Sensitivity factors: list of key assumptions that move the valuation

**Key design decisions:**
- The prompt provides the verified current price and company name to prevent the extraction model from using stale or incorrect values from the report
- Uses Gemini Flash (non-online) because no web access is needed — the report already contains all the information
- JSON cleaning handles trailing commas and markdown fences that LLMs sometimes produce

---

## Industry Frameworks

The system detects the company's industry from the verified fact sheet and applies tailored valuation guidance. Currently implemented:

### Semiconductor / Memory
- **Valuation:** Must use mid-cycle normalized earnings, not peak-quarter. Forecast bit shipment growth, ASP trends, and cost-per-bit separately. Separate maintenance vs growth capex.
- **Normalization:** If current gross margins exceed 5-year average by >15pp, flag as cycle peak and show mid-cycle valuation.
- **Comps:** Samsung, SK hynix, Kioxia, Western Digital. NOT NVIDIA, AMD, or cloud companies.

### Financials (Banks/Insurance)
- **Valuation:** P/B and ROE as primary. Residual income model for intrinsic. DCF less useful.
- **Key metrics:** ROE, NIM, CET1 ratio, loan loss provisions, efficiency ratio.
- **Normalization:** Credit cycle. Normalize provisions vs long-term averages.

### Consumer Staples
- **Valuation:** DDM appropriate alongside DCF. Focus on organic revenue (exclude M&A, FX).
- **Key metrics:** Pricing vs volume, FCF yield, dividend growth rate, payout ratio.
- **Normalization:** Watch for divestitures, restructuring charges.

### Growth Tech / Software
- **Valuation:** EV/Revenue and EV/Gross Profit for unprofitable companies. Rule of 40.
- **Key metrics:** ARR/NRR (SaaS), SBC as % of revenue, FCF margin.
- **Normalization:** Stock-based comp is a real cost. If unprofitable including SBC, say so.

### General (default)
- Standard DCF + multiples with explicit assumptions.

---

## Data Sources & How Data Is Obtained

### How data enters the pipeline

**There is no direct API integration with financial data providers.** All financial data is obtained through LLM web search grounding. Specifically:

- Stages 0, 1, 2, and 4 use `google/gemini-2.5-flash:online`, which is Google's Gemini Flash model with the `:online` suffix. This suffix enables real-time web search — the model can search the web during generation to find and cite current information.
- When the fact extraction prompt (Stage 0) asks for "TTM GAAP diluted EPS" or "total debt from the latest 10-Q," the model searches the web in real time, finds the relevant SEC filings, earnings releases, or financial data sites, and extracts the numbers.
- The model does not have a fixed database of financial data. It performs web searches at inference time, which means it can access the most recently published filings and market prices.

### What sources the model typically accesses

Based on observed behavior and citations in generated reports, the web-grounded model typically pulls from:

| Data Type | Typical Sources |
|---|---|
| SEC filings (10-K, 10-Q) | SEC EDGAR, company investor relations pages |
| Earnings releases | Company press releases, investor relations pages |
| Current stock price | Google Finance, Yahoo Finance, major financial portals |
| Market data (shares outstanding, market cap) | Financial data aggregators, exchange data |
| Competitor information | Company 10-K "Competition" sections, industry reports |
| Management guidance | Earnings call transcripts, earnings releases |
| Historical margins/averages | Financial data sites (Macrotrends, Wisesheets, etc.) |
| Industry/analyst commentary | Fidelity, Morningstar, Seeking Alpha, financial news |

**Important caveat:** We do not control which specific sources the model accesses. The `:online` grounding performs web searches based on the prompt, and the model selects and synthesizes from the results. The model sometimes cites its sources (e.g., `[sa.marketscreener.com]`), but citation is not guaranteed or consistent.

### What data is NOT obtained from web search

- **Derived metrics** (P/E, EV, book value per share, etc.) are computed in the fact extraction prompt from the raw numbers the model finds. The prompt instructs the model to show the computation (e.g., "trailingPE = current price / TTM GAAP diluted EPS").
- **Industry framework selection** is deterministic code (string matching on sector/industry), not LLM-generated.
- **The fact sheet formatting** is deterministic TypeScript code that takes the JSON output from Stage 0 and formats it into a human-readable text block.

### Data freshness

- **Stock price:** The prompt instructs the model to use today's price. In practice, the `:online` model typically returns a price from the current or previous trading day.
- **Financial statements:** The prompt asks for the "most recent 10-K" and "most recent 10-Q." The model will find whatever is the latest published filing, which could be up to ~3 months old (if a quarterly filing hasn't been published yet).
- **TTM figures:** The prompt explicitly instructs the model to sum the last 4 reported quarters. The model identifies which 4 quarters are available and sums them.

### Reliability and verification

This is the primary weakness of the current architecture. Because all financial data enters through LLM web search rather than a deterministic API:

1. **Numbers can be wrong** if the model misreads a filing or finds a secondary source that has errors
2. **Numbers cannot be independently verified** by the system — we rely on the consistency check (Stage 5) to catch contradictions, but the fact sheet itself is not verified against a ground-truth API
3. **Source attribution is inconsistent** — the model sometimes cites URLs, sometimes doesn't

**Planned improvement:** Replace Stage 0's LLM-based fact extraction with a deterministic financial data API (e.g., SEC EDGAR XBRL for filing data, or a commercial provider like Polygon, Alpha Vantage, or Financial Modeling Prep for structured data). The LLM would then only be used for qualitative fields (guidance summary, competitor context, data quality notes), while all numerical fields would come from a verified API. This is the single highest-leverage improvement for data reliability.

### Price data for sector analysis (separate system)

For context, the sector analysis system (separate from stock valuation) uses Yahoo Finance's public API (`query1.finance.yahoo.com/v8/finance/chart/`) to fetch historical price data for sector ETFs and SPY. This is a deterministic API call, not LLM-mediated. The stock valuation system does not currently use this API — it relies entirely on the LLM's web-grounded search for price data.

---

## Data Flow

```
User triggers valuation (UI or CLI)
  │
  ├─ Quarter-freshness check: if report exists from current quarter, return it
  │
  ▼ (no fresh report exists)
Stage 0: Fact Extraction  ──→  VerifiedFacts JSON
  │                              │
  │                    ┌─────────┴──────────┐
  │                    │  Formatted as       │
  │                    │  "VERIFIED DATA     │
  │                    │   FACT SHEET"       │
  │                    │  (plain text)       │
  │                    └─────────┬──────────┘
  │                              │
  ├── Industry framework selected based on sector/industry
  │                              │
  ▼                              ▼
Stage 1: Business  ◄──── fact sheet injected into prompt
  │
  ▼ (accumulated research grows)
Stage 2: Financials  ◄── fact sheet + stage 1 output
  │
  ▼
Stage 3: Valuation  ◄── fact sheet + framework + stages 1-2
  │                      (uses Claude Sonnet for math)
  ▼
Stage 4: Risks  ◄── fact sheet + stages 1-3
  │
  ▼
Preliminary document assembled (all sections)
  │
  ▼
Stage 5: Consistency Check  ◄── fact sheet vs full document
  │                              (uses Claude Sonnet for logic)
  ▼
Final document assembled (includes quality check section)
  │
  ▼
Stage 6: Structured Extraction  ──→  StockValuationInsights JSON
  │
  ▼
Both stored in DB: research_document (text) + structured_insights (jsonb)
```

---

## Caching & Cost Control

- **Quarter-level caching:** Before generating, the system checks if a report exists for this ticker with `generatedAt` >= start of current calendar quarter. If so, the existing report is returned immediately (no LLM calls).
- **Historical preservation:** Reports are always INSERT (never UPDATE/DELETE), so every quarter's analysis is preserved for comparison.
- **Cost per report:** Approximately 7 LLM calls per report. Stages using Claude Sonnet are more expensive per token but produce more reliable valuation math.
- **Trigger model:** Reports are generated only on explicit user request (UI button or CLI command), never automatically.

---

## Database Schema

```sql
CREATE TABLE stock_valuation (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  research_document TEXT NOT NULL,        -- full report text
  structured_insights JSONB,              -- StockValuationInsights JSON
  generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## API Endpoints

### `GET /api/stocks/[ticker]/valuation`
Returns the latest valuation for a ticker (any date, not just current quarter).

### `POST /api/stocks/[ticker]/valuation`
Triggers a new valuation. Uses Server-Sent Events (SSE) to stream progress:
- If a report exists from the current quarter: returns JSON immediately (no SSE)
- Otherwise: streams `data: {"type":"progress",...}` events for each stage, then `data: {"type":"complete",...}` with the final report

---

## CLI

```bash
npm run value-stock -- --ticker KO
```

Runs the full pipeline for one ticker with console progress output.

---

## Known Limitations

1. **Fact extraction is LLM-dependent:** The verified fact sheet is extracted by Gemini with web search, not from a deterministic API. This means facts could still be wrong if the model misreads a filing. A future improvement would be to use a financial data API (e.g., SEC EDGAR XBRL, or a commercial provider) for the numerical extraction and reserve the LLM only for qualitative fields like guidance summaries.

2. **No automatic error correction:** The consistency check (Stage 5) identifies errors but does not automatically fix them. The errors are included in the report for transparency. A future improvement could loop back to re-run stages that produced errors.

3. **Industry frameworks are pattern-matched:** The framework selection uses string matching on sector/industry names. Edge cases (e.g., a semiconductor company classified under "Electronic Equipment") might not match. A future improvement could use the LLM to classify the company.

4. **Valuation math is still LLM-generated:** While Claude Sonnet is more reliable than Gemini for arithmetic, it can still make errors. The consistency check catches some of these, but a deterministic DCF calculation (code, not LLM) would be more reliable. This is the single highest-leverage future improvement.

5. **No primary source verification:** The system cannot currently access SEC EDGAR directly to verify that a specific number appears in a specific filing. It relies on the web-grounded model's ability to find and correctly read filings.

6. **Single-pass generation:** Each stage runs once. If the consistency check finds errors, they are reported but the affected stages are not re-run. A future improvement could implement retry logic for stages with high-severity errors.
