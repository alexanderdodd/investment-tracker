# Iteration 1 — Phase 1: GICS Taxonomy and Industry Routes

## What was built

### Database schema (src/db/schema.ts)
- `gics_sector` — 11 GICS sectors with codes, names, ETF tickers
- `gics_industry_group` — 25 industry groups linked to sectors
- `gics_industry` — 76 industries with slugs, cyclicality classes, value framework IDs
- `gics_sub_industry` — table ready for sub-industry data (not yet seeded)
- `stock_classification` — deterministic stock-to-industry mappings
- `industry_analytics` — analytics storage with valuation state, industry state, median multiples, candidate counts, confidence

### Taxonomy data (src/lib/gics-taxonomy.ts)
- Full GICS taxonomy as TypeScript constants (deterministic, no LLM involvement)
- All 11 sectors, 25 industry groups, 76 industries
- Cyclicality classification for every industry
- Value framework IDs for benchmark industries (semiconductors, software, beverages, insurance, machinery, interactive media)
- Helper functions: `gicsSectorByName`, `gicsIndustriesBySector`, `gicsIndustryBySlug`

### Seed script (scripts/seed-gics.ts)
- Seeds all taxonomy tables with upsert logic
- 40 benchmark stock classifications across 4 priority sectors:
  - Technology: MU, NVDA, AMD, INTC, AVGO, QCOM, MSFT, ORCL, CRM, ADBE, NOW, AAPL, ACN, IBM
  - Consumer Staples: KO, PEP, KDP, MNST, GIS, K, PG, CL
  - Financials: ALL, PGR, TRV, HIG, CB, GS, MS, JPM, BAC
  - Industrials: CAT, DE, RTX, LMT, ETN
  - Communication Services: META, GOOGL, PINS, SNAP
- `npm run seed-gics` command added

### API routes
- `GET /api/sectors/[sector]/industries` — lists industries for a sector with stock counts and analytics
- `GET /api/industries/[slug]` — industry detail with stocks and analytics

### UI: Industries tab on sector pages
- New "Industries" tab added to sector detail page (between Overview and Learn)
- Shows table with: Industry name (linked), Industry Group, Cyclicality, Stock count, State badge, Median metrics, Candidate counts
- Industries sorted by stock count then alphabetically

### UI: Industry detail page (/industries/[slug])
- Breadcrumb navigation: Sectors → Sector → Industry
- Header with industry name, state badge, cyclicality badge, GICS code
- Analytics summary cards (when available): Median Fwd P/E, EV/EBITDA, Op Margin, Confidence
- Stocks table with live metrics from Yahoo Finance, color-coded per sector thresholds

## What works
- Full GICS taxonomy seeded in database (11 sectors, 25 groups, 76 industries)
- 40 benchmark stocks classified to correct industries
- Sector → Industries navigation functional
- Industry detail pages render with stock metrics
- All state badges ready for Phase 2 analytics

## What's next (Phase 2)
- Build deterministic industry analytics aggregation
- Compute median multiples across classified stocks
- Assign industry state labels (ATTRACTIVE_HUNTING_GROUND, MIXED, etc.)
- Populate the analytics summary cards with real data
