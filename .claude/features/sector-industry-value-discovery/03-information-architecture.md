# Information architecture

## Taxonomy hierarchy

Use GICS as the navigational backbone:

- Sector
- Industry Group
- Industry
- Sub-Industry
- Stock

The app should visually emphasize:
- **sector** for broad market navigation
- **industry** for value discovery
- **stock** for final valuation judgment

## Navigation structure

### Current
- `/sectors`
- `/sectors/[sector]`
- `/stocks/[ticker]/valuation`

### New
- `/sectors`
- `/sectors/[sector]`
- `/sectors/[sector]/industries`
- `/industries/[industrySlug]`
- `/industries/[industrySlug]/candidates`
- `/stocks/[ticker]/valuation`

## Page responsibilities

### 1. Sector Overview page
Purpose:
- show all sectors
- rank broad attractiveness
- show quick sector state

New additions:
- industry count per sector
- “top attractive industries” summary
- “candidate count” summary
- sector-level value heat badge

### 2. Sector Detail page
Purpose:
- explain the sector
- show sector performance, concentration, and valuation context

New additions:
- **Industries** tab
- “where value might exist inside this sector”
- industry leaderboard
- industry heatmap
- industry drill-in actions

### 3. Industry Detail page (new)
Purpose:
- the main value-hunting page
- compare companies that actually belong together

Contains:
- industry description
- market structure and economics
- performance vs sector and benchmark
- valuation vs history
- peer structure
- top holdings / leaders
- value candidate list
- risk flags

### 4. Candidate List panel / page
Purpose:
- show only stocks that pass industry and stock-level filters

Contains:
- candidate type
- cheap/fair/expensive
- confidence
- peer quality
- value thesis summary
- trap risk summary

### 5. Stock Valuation page
Purpose:
- final company-level decision support

New requirements:
- show sector + industry + sub-industry prominently
- show peer set quality
- show why this stock is a candidate from the industry page
- distinguish:
  - sector story
  - industry story
  - stock story

## Cross-page consistency rules

1. Sector labels may not imply stock cheapness directly.
2. Industry attractiveness may not imply stock cheapness directly.
3. “Potential value stock” requires stock-level validation.
4. “Validated value candidate” requires:
   - publishable stock valuation
   - peer quality above threshold
   - no major trap flags
5. A stock page must show the exact industry and peer group that justified its appearance in the candidate list.

## New reusable UI entities

### SectorSummary
- sector label
- short/medium/long-term stance
- sector valuation state
- top industries
- candidate count

### IndustrySummary
- industry name
- share of sector
- performance
- valuation state
- quality
- cyclicality
- candidate count

### CandidateCard
- ticker / company
- industry
- valuation label
- confidence
- peer quality
- short value thesis
- risk / trap flag

### PeerQualityBadge
- strong / medium / weak
- deterministic or curated
- number of usable peers
- data freshness

## Minimum viable path through the app

1. User opens `/sectors`
2. Clicks Technology
3. Opens the new **Industries** tab
4. Sees Software, Semiconductors, IT Services, Hardware ranked
5. Clicks an attractive industry
6. Views industry detail + candidates
7. Opens a candidate stock
8. Reads the valuation report with peer context
