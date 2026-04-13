# Implementation plan

## Phase 1 — Add industry data model and routing
Build:
- GICS industry tables
- stock classification joins
- `/sectors/[sector]/industries`
- `/industries/[industrySlug]`

Outputs:
- sector pages can list industries
- industry detail page exists with placeholder analytics

## Phase 2 — Add deterministic industry analytics
Build:
- industry aggregation service
- industry scorecards
- valuation-vs-history state
- quality and cyclicality scores
- concentration and candidate counts

Outputs:
- industries tab fully populated
- industry heatmap / leaderboard

## Phase 3 — Add candidate generation engine
Build:
- eligible stock universe per industry
- stock candidate filter
- trap-risk engine
- candidate classes
- candidate list modules

Outputs:
- candidate list appears on industry pages
- sector page shows aggregated candidate counts

## Phase 4 — Integrate peer packs and stock valuation artifacts
Build:
- stock candidate publication checks
- peer pack lookup
- peer quality weighting
- industry -> stock reasoning trace

Outputs:
- only validated candidates show “validated”
- stock pages show candidate provenance

## Phase 5 — Ralph loop validation suite
Build:
- taxonomy tests
- industry integrity tests
- candidate integrity tests
- benchmark packs
- negative controls
- UI surface tests

Outputs:
- iteration scorecards for industry feature
- safe publish gate for candidates

## Phase 6 — Design polish and scale-out
Build:
- sector overview enhancements
- industry search and filters
- candidate filtering
- more benchmark industries / stocks

## Recommended initial benchmark set

### Sectors
- Technology
- Consumer Staples
- Financials
- Industrials

### Industries
- Semiconductors
- Software
- IT Services
- Beverages
- Property & Casualty Insurance
- Machinery

### Stocks
- MU
- KO
- ALL
- META
- one additional industrial example

## Engineering priorities

### Must do first
- taxonomy correctness
- candidate publication safety
- industry routing and scorecards
- stock valuation artifact dependency

### Can wait
- advanced charting
- broad market coverage
- personalized portfolio overlays
- action recommendations

## Rollout advice

Release this feature in stages:
1. internal-only industries tab
2. industry detail pages
3. candidate lists labeled as experimental
4. validated candidate publication after Ralph-loop thresholds pass
