# Stock Valuation v2 — Implementation Plan

## Core Principle

> Numbers come from code. Narrative comes from LLMs. The narrative may explain the valuation but may not define it.

This plan turns the expert's recommendation into a phased implementation. Each phase delivers working value and can be deployed independently.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DETERMINISTIC LAYER (code)                       │
│                                                                       │
│  SEC EDGAR API ──→ Raw Source Bundle ──→ Canonical Facts              │
│  Market Data API ──→                     Evidence Pack                │
│                                                                       │
│  Canonical Facts ──→ Financial Analysis Engine ──→ Model Outputs      │
│                      (margins, ratios, cycle state, normalization)    │
│                                                                       │
│  Model Outputs ──→ Valuation Engine ──→ Valuation Outputs            │
│                    (DCF, multiples, reverse DCF, scenarios)           │
│                                                                       │
│  All Outputs ──→ Deterministic QA ──→ Pass / Fail / Warning          │
│                                                                       │
│  All Outputs ──→ UI JSON Serializer ──→ Structured Insights          │
├─────────────────────────────────────────────────────────────────────┤
│                        LLM LAYER (narrative)                          │
│                                                                       │
│  Locked Artifacts ──→ Narrative Synthesis ──→ Analyst Report          │
│                       (may explain, may NOT introduce numbers)        │
│                                                                       │
│  Full Report ──→ Red-Team Reviewer ──→ Challenge & Flag               │
│                  (may challenge, may NOT recompute)                    │
├─────────────────────────────────────────────────────────────────────┤
│                       PUBLISH GATE                                    │
│                                                                       │
│  High-severity errors → BLOCK (retry or "valuation withheld")         │
│  Medium-severity → WARN (publish with explicit caveats)               │
│  Pass → PUBLISH                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: SEC EDGAR Integration + Deterministic Fact Extraction
**Priority: Highest — this is the foundation everything else builds on**

#### What we build
- SEC EDGAR API client (`src/lib/sec-edgar/client.ts`)
  - Submissions lookup by ticker → CIK resolution
  - Company facts endpoint (XBRL data)
  - Company concept endpoint (individual metrics)
  - Rate limiting (10 req/sec max)
  - User-Agent header as required by SEC
- XBRL concept mapper (`src/lib/sec-edgar/xbrl-mapper.ts`)
  - Maps varying XBRL tags to canonical field names
  - Revenue: `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues`, `SalesRevenueNet`, etc.
  - Net income: `NetIncomeLoss`, `ProfitLoss`
  - EPS: `EarningsPerShareDiluted`, `EarningsPerShareBasic`
  - Cash flow, capex, debt, equity, shares — all mapped
- TTM calculator (`src/lib/sec-edgar/ttm.ts`)
  - Identifies latest 4 discrete quarters from XBRL data
  - Handles fiscal year mismatch (derives Q4 from annual minus Q1-Q3 when needed)
  - Validates quarterly sums against annual totals
- Market data client (`src/lib/market-data/client.ts`)
  - Current price, shares outstanding, market cap
  - Source: Yahoo Finance API (already used for sector data) or Alpha Vantage
  - Deterministic, not LLM-mediated
- Canonical facts builder (`src/lib/valuation/canonical-facts.ts`)
  - Combines EDGAR XBRL + market data into `CanonicalFacts` object
  - Every number has provenance: value, units, period, asOf, sourceType, sourceRef, method
  - Computes derived metrics in code: EV, P/E, P/B, EV/Revenue, book value per share
  - Builds 5-year history from XBRL filing history

#### Key data types
```typescript
interface ProvenancedValue {
  value: number | null;
  unit: string;
  period: string;         // "TTM", "Q2FY2026", "FY2025", "point-in-time"
  asOf: string;           // ISO date
  sourceType: "SEC_XBRL" | "MARKET_DATA" | "COMPUTED" | "FILING_TEXT";
  sourceRef: string;      // e.g., "CIK/10-Q/2026-02-26 us-gaap:Revenues"
  method: string;         // e.g., "sum_last_4_quarters", "point_in_time", "division"
}

interface CanonicalFacts {
  ticker: string;
  companyName: string;
  cik: string;
  sector: string;
  industry: string;
  fiscalYearEnd: string;
  reportingCurrency: string;

  // Filing metadata
  latestAnnualFiling: { accession: string; periodEnd: string; filedDate: string };
  latestQuarterlyFiling: { accession: string; periodEnd: string; filedDate: string };

  // Market data (deterministic)
  currentPrice: ProvenancedValue;
  sharesOutstandingPointInTime: ProvenancedValue;
  sharesOutstandingDilutedTTM: ProvenancedValue;
  marketCap: ProvenancedValue;
  enterpriseValue: ProvenancedValue;

  // TTM financials (sum of last 4 discrete quarters)
  ttmRevenue: ProvenancedValue;
  ttmGrossProfit: ProvenancedValue;
  ttmOperatingIncome: ProvenancedValue;
  ttmGaapNetIncome: ProvenancedValue;
  ttmGaapDilutedEPS: ProvenancedValue;
  ttmOperatingCashFlow: ProvenancedValue;
  ttmCapex: ProvenancedValue;
  ttmGaapFreeCashFlow: ProvenancedValue;
  ttmDividendsPaid: ProvenancedValue;
  ttmShareBuybacks: ProvenancedValue;
  ttmStockBasedComp: ProvenancedValue;
  ttmDepreciationAmortization: ProvenancedValue;
  quartersUsed: string[];

  // Latest quarter
  latestQuarter: {
    revenue: ProvenancedValue;
    grossMargin: ProvenancedValue;
    operatingMargin: ProvenancedValue;
    netMargin: ProvenancedValue;
    segments: { name: string; revenue: ProvenancedValue; operatingIncome?: ProvenancedValue }[];
  };

  // Balance sheet (point-in-time from latest filing)
  cashAndEquivalents: ProvenancedValue;
  shortTermInvestments: ProvenancedValue;
  totalCashAndInvestments: ProvenancedValue;
  currentDebt: ProvenancedValue;
  longTermDebt: ProvenancedValue;
  totalDebt: ProvenancedValue;
  totalEquity: ProvenancedValue;
  goodwill: ProvenancedValue;
  inventory: ProvenancedValue;
  receivables: ProvenancedValue;
  bookValuePerShare: ProvenancedValue;

  // Derived valuation metrics (computed in code)
  trailingPE: ProvenancedValue;
  priceToBook: ProvenancedValue;
  evToRevenue: ProvenancedValue;
  evToEbitda: ProvenancedValue;

  // Historical context (from XBRL filing history)
  annualHistory: {
    year: string;
    revenue: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roic: number | null;
    capexIntensity: number | null;
  }[];
  fiveYearAvgGrossMargin: ProvenancedValue;
  fiveYearAvgOperatingMargin: ProvenancedValue;

  // Competitors (from 10-K text, extracted by LLM as an exception)
  primaryCompetitors: string[];

  // Guidance (from earnings release, extracted by LLM as an exception)
  guidanceSummary: string;

  // Dividend
  annualDividendPerShare: ProvenancedValue;
  dividendYield: ProvenancedValue;

  // Data quality
  dataQualityNotes: string[];
  missingFields: string[];
}
```

#### What changes from current
- Stage 0 moves from Gemini :online web search to SEC EDGAR API + Yahoo Finance
- ~90% of fact extraction becomes deterministic code
- Only competitors and guidance summary still use LLM (because they're in unstructured text)
- Every number has machine-readable provenance

#### XBRL tag mapping challenge
Companies use different XBRL tags for the same concept. We need a mapper:
```typescript
const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "SalesRevenueServicesNet",
  "InterestAndDividendIncomeOperating", // banks
];
// Try in order, take first non-null
```

---

### Phase 2: Evidence Pack Extraction
**Priority: High — grounds the LLM narrative in primary sources**

#### What we build
- Filing text parser (`src/lib/sec-edgar/filing-parser.ts`)
  - Downloads 10-K and 10-Q HTML from EDGAR
  - Extracts key sections: Item 1 (Business), Item 1A (Risk Factors), Item 7 (MD&A)
  - For 10-Q: Item 2 (MD&A), Item 1 (Legal), notes
- Evidence extractor (`src/lib/valuation/evidence-pack.ts`)
  - Uses LLM to extract structured evidence snippets from filing text
  - Each snippet has: source type, accession, section, excerpt, freshness date
  - Categories: segments, competitive landscape, customer concentration, contract terms, geographic exposure, legal proceedings, tax commentary, guidance, capital allocation, strategic pivots
- Source tier enforcement
  - Tier 1 (SEC filings, company IR) — facts
  - Tier 2 (market data providers) — prices
  - Tier 3 (news, transcripts) — context only
  - Tier 4 (blogs, weak portals) — disallowed for fact layer

#### What this fixes
- Micron's 10-K directly names competitors → extracted as structured data
- Micron's 10-K says "over half of revenue from top 10 customers" → captured
- Micron's 10-Q says "substantially all contracts are short-term" → captured
- No more LLM inventing or overstating revenue visibility

---

### Phase 3: Deterministic Financial Analysis Engine
**Priority: High — replaces LLM financial math with code**

#### What we build
- Ratio calculator (`src/lib/valuation/ratios.ts`)
  - Revenue growth (YoY, 3Y CAGR, 5Y CAGR)
  - Margin trends (gross, operating, net)
  - Cash conversion (OCF/Net Income)
  - Return on capital (ROE, ROIC)
  - Leverage (debt/equity, debt/EBITDA, interest coverage)
  - Working capital metrics (DSO, DIO, DPO)
  - Capital allocation (dividend payout, buyback yield, capex intensity)
  - Non-GAAP/GAAP divergence tracking
- Cycle state detector (`src/lib/valuation/cycle-state.ts`)
  - Classifies: trough / below-mid / mid-cycle / above-mid / peak
  - Based on: margin percentile vs own 5Y history, inventory trends, capex intensity
  - Industry-specific thresholds
- Normalizer (`src/lib/valuation/normalizer.ts`)
  - Normalizes revenue, margins, and FCF to mid-cycle levels for cyclical companies
  - Framework-specific rules (semiconductor: normalize ASP and utilization; banks: normalize provisions)
  - Outputs: reported case, current run-rate, normalized mid-cycle case

#### Output type
```typescript
interface FinancialModelOutputs {
  revenueGrowth: { period: string; value: number }[];
  marginHistory: { period: string; gross: number; operating: number; net: number }[];
  cashConversion: number;
  returnOnCapital: { roe: number; roic: number };
  leverage: { debtToEquity: number; debtToEbitda: number; interestCoverage: number };
  workingCapital: { dso: number; dio: number; dpo: number };
  capitalAllocation: { dividendPayout: number; buybackYield: number; capexIntensity: number };
  cycleState: "trough" | "below_mid" | "mid_cycle" | "above_mid" | "peak";
  cycleConfidence: number;
  normalizedMetrics: {
    reported: { revenue: number; operatingMargin: number; fcf: number };
    midCycle: { revenue: number; operatingMargin: number; fcf: number };
    runRate: { revenue: number; operatingMargin: number; fcf: number };
  };
}
```

---

### Phase 4: Deterministic Valuation Engine
**Priority: High — the core improvement over LLM-generated DCF math**

#### What we build
- DCF engine (`src/lib/valuation/dcf.ts`)
  - FCFF computation from normalized model outputs (not LLM prose)
  - WACC calculator: risk-free rate (from market data), equity risk premium, beta, cost of equity (CAPM), cost of debt, capital structure weights
  - 5-year projection with tapering growth
  - Terminal value (Gordon growth model)
  - Full sensitivity grid (WACC vs terminal growth)
  - Per-share value: (EV + cash - debt) / diluted shares
  - All inputs are from CanonicalFacts and FinancialModelOutputs
- Multiples engine (`src/lib/valuation/multiples.ts`)
  - Computes from MARKET enterprise value (not DCF EV)
  - P/E, P/B, EV/EBITDA, EV/Revenue, EV/FCF
  - Peer comparison (peers from evidence pack / 10-K)
  - Historical comparison (5Y range from filing history)
- Reverse DCF (`src/lib/valuation/reverse-dcf.ts`)
  - Given current price, what growth/margin is the market implying?
  - Often more informative than forward DCF for richly valued stocks
- Scenario builder (`src/lib/valuation/scenarios.ts`)
  - Bull/base/bear using framework-specific assumptions
  - Each scenario has: growth rate, margin assumption, WACC, terminal growth, resulting per-share value
- Value synthesizer (`src/lib/valuation/synthesizer.ts`)
  - Combines DCF, multiples, reverse DCF, scenarios
  - If method dispersion is large → widen range, lower confidence
  - Produces verdict: Undervalued / Fair Value / Overvalued / Highly Uncertain

#### Output type
```typescript
interface ValuationOutputs {
  dcf: {
    baseYear: { reported: number; normalized: number };
    projections: { year: number; fcf: number; pv: number }[];
    terminalValue: number;
    pvTerminal: number;
    enterpriseValue: number;
    equityValue: number;
    perShareValue: number;
    wacc: { riskFreeRate: number; erp: number; beta: number; costOfEquity: number; costOfDebt: number; debtWeight: number; equityWeight: number; wacc: number };
    terminalGrowth: number;
    sensitivityGrid: { wacc: number; terminalGrowth: number; perShareValue: number }[];
  };
  multiples: {
    current: { pe: number; pb: number; evEbitda: number; evRevenue: number };
    peers: { ticker: string; pe: number; pb: number; evEbitda: number }[];
    historicalRange: { metric: string; low: number; median: number; high: number; current: number }[];
  };
  reverseDcf: {
    impliedRevenueGrowth: number;
    impliedMargin: number;
    interpretation: string;
  };
  scenarios: {
    bull: { perShareValue: number; assumptions: string };
    base: { perShareValue: number; assumptions: string };
    bear: { perShareValue: number; assumptions: string };
  };
  verdict: "Undervalued" | "Fair Value" | "Overvalued" | "Highly Uncertain";
  confidenceScore: number;
  intrinsicValueRange: { low: number; mid: number; high: number };
  marginOfSafety: number; // percentage vs current price
}
```

#### Industry-specific method selection
```typescript
function selectMethods(framework: IndustryFramework): ValuationMethod[] {
  switch (framework.type) {
    case "semiconductor":
      return ["normalized_fcff_dcf", "normalized_ev_ebit", "pb_sanity", "reverse_dcf"];
    case "financial":
      return ["residual_income", "justified_ptbv", "pe_roe"];
    case "consumer_staples":
      return ["fcff_dcf", "ddm", "pe_relative"];
    case "growth_tech":
      return ["ev_revenue", "ev_gross_profit", "rule_of_40", "reverse_dcf"];
    case "reit":
      return ["affo_yield", "nav", "cap_rate"];
    default:
      return ["fcff_dcf", "pe_relative", "ev_ebitda_relative", "reverse_dcf"];
  }
}
```

---

### Phase 5: Deterministic QA + Publish Gate
**Priority: High — prevents bad reports from reaching users**

#### What we build
- Deterministic validators (`src/lib/valuation/validators.ts`)
  - Source completeness check (10-K exists, 10-Q exists, market data fresh)
  - TTM reconciliation (quarterly sums ≈ annual within tolerance)
  - Ratio formula verification (P/E = price/EPS, EV = mcap + debt - cash, etc.)
  - Price timestamp freshness (< 24 hours)
  - Share-count consistency (market cap uses point-in-time, EPS uses weighted avg)
  - DCF formula integrity (FCFF formula, discount factors, terminal value)
  - Peer-set compliance (no disallowed peers from framework)
  - Normalized vs reported distinction (no mixing)
- Severity classifier
  - High: numeric contradiction, wrong formula, stale price, wrong share count basis
  - Medium: missing optional field, peer set too small, wide method dispersion
  - Low: formatting, minor rounding difference
- Publish gate (`src/lib/valuation/publish-gate.ts`)
  - High severity → BLOCK (return "valuation withheld" with error details)
  - Medium severity → WARN (publish with explicit caveats in the report)
  - All pass → PUBLISH

#### What changes from current
- Consistency check moves from LLM (Stage 5) to deterministic code
- The LLM red-team review becomes supplementary, not the primary QA
- Reports with high-severity errors are blocked, not published with a footnote

---

### Phase 6: LLM Narrative Synthesis (Locked to Artifacts)
**Priority: Medium — improves the prose but not the numbers**

#### What changes
- The LLM receives ALL deterministic outputs as locked context
- The prompt explicitly states: "You may not introduce new numbers. You may not change values from CanonicalFacts or ValuationOutputs."
- Narrative sections:
  1. Verified fact sheet (rendered from CanonicalFacts)
  2. Business and industry overview (LLM, grounded in EvidencePack)
  3. Financial analysis (LLM, explaining FinancialModelOutputs)
  4. Valuation assessment (LLM, explaining ValuationOutputs)
  5. Risk and scenario analysis (LLM, explaining scenarios + evidence)
  6. Methodology and confidence (from QA + confidence engine)
  7. Source appendix (from provenance data)

#### Red-team reviewer
- Separate LLM call that challenges the report
- May flag: unsupported optimism, missed risks, structural vs cyclical confusion
- May NOT: recompute numbers, introduce new facts, change the valuation

---

### Phase 7: Structured Storage + Event-Based Freshness
**Priority: Medium — improves caching and historical comparison**

#### New DB schema
```sql
CREATE TABLE valuation_run (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  cik TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  price_timestamp TIMESTAMP NOT NULL,
  status TEXT NOT NULL,  -- 'published', 'withheld', 'draft'
  framework_id TEXT NOT NULL,
  framework_version TEXT NOT NULL,

  -- Separated artifacts (not one text blob)
  canonical_facts JSONB NOT NULL,
  evidence_pack JSONB,
  financial_model JSONB,
  valuation_outputs JSONB,
  risk_outputs JSONB,
  confidence JSONB,
  quality_report JSONB,
  narrative_markdown TEXT,
  ui_insights JSONB,

  -- Source tracking
  source_bundle_hash TEXT NOT NULL,
  latest_10k_accession TEXT,
  latest_10q_accession TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Event-based freshness (replaces quarter caching)
```
New filing detected (10-K, 10-Q, material 8-K) → full rebuild
Price > 24h stale → refresh price-sensitive outputs only
Framework version change → rebuild valuation + narrative
No change → serve cached
```

---

## Implementation Order

| Phase | What | Effort | Depends On |
|-------|------|--------|------------|
| **1** | SEC EDGAR client + XBRL mapper + TTM calculator + CanonicalFacts | Large | Nothing |
| **2** | Evidence pack extraction from filing text | Medium | Phase 1 |
| **3** | Financial analysis engine (ratios, cycle state, normalization) | Medium | Phase 1 |
| **4** | Valuation engine (DCF, multiples, reverse DCF, scenarios) | Large | Phase 1, 3 |
| **5** | Deterministic QA + publish gate | Medium | Phase 1, 4 |
| **6** | LLM narrative (locked to artifacts) + red-team | Medium | Phase 1-5 |
| **7** | New DB schema + event-based freshness | Medium | Phase 1-6 |

**Recommended order:** 1 → 3 → 4 → 5 → 2 → 6 → 7

Rationale: Phase 1 (facts) is the foundation. Phase 3 (ratios) and 4 (valuation) directly improve the core output quality. Phase 5 (QA) prevents bad reports. Phase 2 (evidence pack) improves narrative grounding. Phase 6 (narrative) and 7 (storage) are refinements.

---

## Migration Strategy

During implementation, the system should support both paths:
- **v1 (current):** LLM-generated everything, available as fallback
- **v2 (new):** Deterministic facts + code valuation + LLM narrative

A feature flag (`USE_DETERMINISTIC_VALUATION=true`) can switch between them. When v2 is stable and the expert reviewer signs off, v1 is retired.

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| XBRL tag mapping is incomplete for some companies | Build a mapping table with fallbacks; flag when no tag matches |
| SEC EDGAR rate limit (10 req/sec) slows pipeline | Batch requests; cache aggressively; use bulk downloads for initial load |
| Some companies have poor XBRL coverage | Fall back to LLM extraction for that company with explicit data quality warning |
| Deterministic DCF requires assumption inputs (growth, WACC) | Use framework-specific defaults with explicit disclosure; allow manual override |
| Not all countries file with SEC | Scope v2 to US-listed companies; non-US uses v1 LLM pipeline |
| Beta and risk-free rate need external sources | Use Yahoo Finance for beta; use 10-year Treasury yield from FRED or similar |

---

## Success Criteria

The v2 pipeline should be evaluated by the same expert reviewer who critiqued the v1 Micron report. Success means:

1. **No fact errors** that contradict SEC filings
2. **No arithmetic errors** in P/E, EV, DCF math
3. **No stale inputs** (prices, segments, share counts)
4. **Correct methodology** (TTM from 4 quarters, market EV for multiples, normalized base for DCF)
5. **Cycle awareness** (flags peak margins, shows mid-cycle valuation)
6. **Correct peers** (from 10-K, not ecosystem partners)
7. **Publish gate works** (bad reports are withheld, not published with a footnote)
8. **Provenance is traceable** (every number links to its source)
