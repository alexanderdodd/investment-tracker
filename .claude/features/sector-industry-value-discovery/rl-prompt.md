# Ralph Loop Prompt — Sector → Industry → Value Discovery

## Feature specification

Read the full spec before starting any work:
- `.claude/features/sector-industry-value-discovery/sector-industry-value-discovery-spec-complete.md`

The numbered spec files provide additional detail:
- `01-executive-summary.md` through `11-design-assets.md`

## What you are building

Extend the investment tracker from **sector → stock** to **sector → industry → stock value discovery**.

Three new layers:
1. **Industry layer**: Every sector page gets a ranked list of GICS industries with performance, valuation, quality, cyclicality, and candidate counts.
2. **Value candidate engine**: Deterministic candidate generation within attractive industries. Candidates are classified as validated_value, possible_value, value_trap_risk, or not_attractive.
3. **Validation suite**: Taxonomy integrity, industry analytics integrity, candidate publication integrity, peer pack integrity, and UI surface integrity.

## Core rules (non-negotiable)

1. Sector guides discovery. Industry is the comparison unit for valuation.
2. No candidate labeled "validated_value" without a stock valuation artifact.
3. No "cheap" badge without a valuation label.
4. Taxonomy must be deterministic — no LLM-generated sector/industry/peer facts.
5. LLMs may explain; they may not invent classification data.
6. Prefer suppression or downgrade over false precision.

## Implementation phases

### Phase 1 — Taxonomy and routes
- Add GICS tables: `gics_sector`, `gics_industry_group`, `gics_industry`, `gics_sub_industry`, `stock_classification`
- Add industry routes: `/sectors/[sector]/industries`, `/industries/[industrySlug]`
- Sector pages can list industries; industry detail page exists with placeholder analytics
- Seed with benchmark sectors: Technology, Consumer Staples, Financials, Industrials

### Phase 2 — Industry analytics
- Build deterministic `IndustryAnalytics` aggregation
- Industry scorecards: median multiples, valuation-vs-history, quality metrics, cyclicality
- Industry state labels: ATTRACTIVE_HUNTING_GROUND, MIXED, OVERHEATED, LOW_VISIBILITY, WITHHELD
- Industries tab on sector pages fully populated

### Phase 3 — Candidate generation engine
- Eligible stock universe per industry
- Deterministic candidate filter using stock valuation artifacts + peer quality + trap risk
- Candidate classes: validated_value, possible_value, value_trap_risk, not_attractive
- Candidate lists on industry pages; aggregated counts on sector pages

### Phase 4 — Peer pack and valuation artifact integration
- Stock candidates require: facts gate passed, valuation gate passed, valuation label == cheap, confidence >= 0.60, peer quality >= medium, trap risk < high, freshness within SLA
- Downgrade or suppress candidates that fail any gate
- Benchmark peer expectations:
  - MU: primary peers SK hynix, Samsung; secondary Western Digital; exclude NVDA/AMD/INTC as primary
  - KO: primary PEP, KDP; secondary CCEP, MNST
  - ALL: primary PGR, TRV; secondary HIG, CINF, CB
  - META: primary GOOGL; secondary PINS, SNAP, RDDT

### Phase 5 — Ralph loop validation suite
- Taxonomy tests (TAX-001 through TAX-005)
- Industry integrity tests (IND-001 through IND-005)
- Candidate integrity tests (CAND-001 through CAND-006)
- Peer pack integrity tests (PEER-IND-001 through PEER-IND-005)
- UI surface tests (SURF-IND-001 through SURF-IND-005)
- Negative controls: wrong industry, missing artifact, withheld valuation shown as validated, weak peers with validated status

### Phase 6 — Design polish
- Sector overview enhancements, industry search/filters, candidate filtering

## Existing codebase context

- **Framework**: Next.js 16 App Router, TypeScript, Tailwind CSS 4, `src/` directory
- **DB**: Drizzle ORM + Neon Postgres. Schema in `src/db/schema.ts`. Use `npm run db:push` after schema changes.
- **Auth**: NextAuth v5 with GitHub OAuth. `auth()` for server components, API routes check `session?.user?.id`.
- **Sectors**: 11 GICS sectors defined in `src/lib/sectors.ts` with ETF mappings. Sector pages at `/sectors/[sector]/`.
- **Stock metrics**: `src/lib/stock-metrics.ts` fetches from Yahoo Finance. Sector-specific thresholds for color ratings.
- **Stock valuations**: `src/db/schema.ts` → `stockValuations` table with canonicalFacts, financialModel, valuationOutputs, qualityReport as JSONB.
- **AI**: OpenRouter via `src/lib/ai.ts`. Gemini 2.5 Flash for online research. Use for explanations only, not taxonomy.
- **Existing generation pipeline**: `npm run generate-reports` runs sector reports, emerging leaders, value stocks, and sector analyses.

## Key files to read before starting

- `src/db/schema.ts` — all current tables
- `src/lib/sectors.ts` — sector constants
- `src/lib/stock-metrics.ts` — metric thresholds and Yahoo Finance integration
- `src/app/sectors/[sector]/sector-detail.tsx` — sector page data flow
- `src/app/sectors/[sector]/components/tab-holdings.tsx` — holdings tab with existing tables
- `src/app/stocks/[ticker]/valuation/page.tsx` — stock valuation page
- `src/lib/generate-value-stocks.ts` — current AI-based value stock generation (to be replaced/enhanced)

## Deliverables per Ralph loop iteration

Each iteration must produce:
- Working code changes committed to a branch
- `iteration-changes.md` — what was built/changed
- `evaluation-scorecard.md` — pass/fail for each validation rule attempted
- Summary of what works, what fails, what to do next

## Success criteria

The feature is ship-ready when:
1. Taxonomy integrity passes (all TAX-* rules)
2. Industry integrity passes (all IND-* rules)
3. Candidate integrity passes (all CAND-* rules)
4. Benchmark peer packs pass (all PEER-IND-* rules)
5. UI surface tests pass (all SURF-IND-* rules)
6. Negative controls block invalid candidate publication
7. No regressions in existing stock valuation pipeline
8. User can navigate sector → industry → validated value candidates with confidence explanations
