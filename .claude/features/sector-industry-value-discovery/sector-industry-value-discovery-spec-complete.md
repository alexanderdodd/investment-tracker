# File: README.md
# Sector + Industry Value Discovery Spec Bundle

This bundle defines how to extend the app from sector-only analysis to:

- sector -> industry -> stock navigation using GICS
- industry-level analytics within each sector
- industry heatmaps and value-hunting workflows
- deterministic candidate generation for potential value stocks
- candidate validation using peer evaluation + stock valuation runs
- Ralph-loop quality gates for industry and candidate outputs
- UI designs for the new pages

## Recommended reading order

1. `01-executive-summary.md`
2. `02-product-goals-and-scope.md`
3. `03-information-architecture.md`
4. `04-data-model-and-taxonomy.md`
5. `05-sector-and-industry-analysis-framework.md`
6. `06-value-stock-candidate-methodology.md`
7. `07-ui-ux-specification.md`
8. `08-validation-and-ralph-loop.md`
9. `09-implementation-plan.md`
10. `10-prompt-for-coding-assistant.md`

## Design assets

- `design-01-sector-overview-with-industries.png`
- `design-02-sector-detail-industry-tab.png`
- `design-03-industry-detail-value-candidates.png`
- `design-04-stock-valuation-peer-panel.png`

## Product principle

Sector is the discovery layer.
Industry is the comparison layer.
Stock valuation is the decision layer.

The app should never label a stock a value candidate based on sector context alone.
A stock can only be surfaced as a value candidate if it passes:
1. sector / industry attractiveness checks
2. peer-quality checks
3. stock-level valuation publishability checks
4. explanation-surface checks

## Safety posture

- GICS-first taxonomy
- deterministic data and scoring first
- LLM explanations second
- no “potential value stock” label without a validated stock valuation artifact
- prefer “interesting but not validated” over false precision


# File: 01-executive-summary.md
# Executive summary

This specification extends the current app from sector cards and sector detail pages into a full **sector -> industry -> stock value discovery system**.

The feature adds three layers:

1. **Industry layer inside each sector**
   - every sector page gets a ranked list of industries and sub-industries
   - each industry has performance, valuation, quality, cyclicality, concentration, and candidate counts
   - industries are analyzed as the proper comparison unit for stock selection

2. **Value stock candidate engine**
   - the app generates candidate stocks within attractive industries
   - each candidate must be backed by a stock-level valuation run and a validated peer set
   - candidates are classified as:
     - validated value candidate
     - possible value candidate (needs more work)
     - likely value trap
     - not attractive

3. **Ralph-loop evaluation**
   - the loop validates not just core facts, but also:
     - GICS mappings
     - industry coverage
     - industry scores
     - peer registry quality
     - candidate scoring
     - stock-level valuation availability
     - UI surface integrity

## Core product rule

A sector can be expensive while one industry inside it is attractive.
An industry can be attractive while most stocks inside it are still poor value.
A stock can only be surfaced as a true value candidate if its own valuation report passes its publish gate.

## Why this matters

Your current UI already does a good job of:
- sector performance
- sector narrative
- sector concentration
- holdings inspection
- stock-level valuation views

What is missing is the **middle layer**:
- how to reason from sector to industry
- how to identify where value may exist inside a sector
- how to translate that into validated stock candidates

This spec fills that gap.

## Scope for the first implementation

### In scope
- sector pages gain industry analysis
- new industry detail page
- deterministic industry attractiveness scoring
- deterministic candidate generation
- candidate cards linked to stock valuation artifacts
- Ralph-loop quality thresholds for publish-safe value candidate lists

### Out of scope
- full market-wide coverage on day 1
- non-U.S. listings as first-class support
- fully automated buy/sell recommendations
- portfolio optimization or trade execution

## Recommended implementation milestone sequence

### Milestone 1
Add industries to sectors and publish industry-level analytics.

### Milestone 2
Generate “potential value stocks” inside attractive industries.

### Milestone 3
Require every surfaced candidate to have:
- validated peer pack
- stock valuation artifact
- publishable cheap/fair/expensive label
- confidence explanation

### Milestone 4
Add stock action guidance only after valuation and peer layers are stable.


# File: 02-product-goals-and-scope.md
# Product goals and scope

## User problem

The current app helps users understand sectors, but it does not yet answer the crucial next questions:

- Which industries inside this sector are actually attractive?
- Where might value exist inside those industries?
- Which specific stocks are cheap versus their own history and their true peers?
- Which stocks are merely optically cheap but probably traps?

## Primary product goals

### Goal 1 — Make sector analysis more actionable
Users should be able to move from:
- “Technology looks expensive”
to:
- “Software is mixed, Semiconductors are stretched, but IT Services may contain a few value pockets.”

### Goal 2 — Use industry as the real comparison unit
Sector is too broad for valuation.
The app should compare businesses within:
- the same industry
- ideally the same sub-industry
- with similar capital intensity, margins, and business model

### Goal 3 — Surface value candidates with evidence
A value candidate should not be just a watchlist item.
It must be backed by:
- sector context
- industry context
- peer context
- stock-level valuation artifact
- confidence reasons

### Goal 4 — Avoid false positives
The app must avoid:
- labeling pre-profit momentum names as “value” based on weak heuristics
- mixing bad peers
- surfacing candidates when stock-level valuation is missing or withheld
- using sector cheapness as a proxy for stock cheapness

## Target user

A self-directed investor who:
- understands sectors, markets, and broad stock concepts
- is not deeply trained in professional valuation workflows
- wants structured support, not just a screener
- wants to understand “why this may be attractive”

## User jobs to be done

### Sector mode
- See which sectors are attractive or stretched
- Understand what is driving each sector

### Industry mode
- See which industries inside a sector are attractive
- Understand whether that attractiveness is valuation, momentum, quality, or macro driven

### Candidate mode
- See which stocks inside the attractive industries are plausible value candidates
- Understand whether they are validated or still speculative

### Stock mode
- Open a stock page and see:
  - industry
  - peers
  - valuation label
  - confidence
  - risks and why the stock may be cheap

## Non-goals for this phase

- direct trade recommendations
- target allocation construction
- tax optimization
- options strategies
- portfolio-level buy/sell automation

## Release principle

This feature is successful when a user can say:

> “I can go from sector view to industry view to a small list of genuinely plausible value candidates, and I understand why they are there.”

It is not necessary in the first phase that every candidate be perfect.
It is necessary that obviously bad candidates are filtered out and confidence is honest.


# File: 03-information-architecture.md
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


# File: 04-data-model-and-taxonomy.md
# Data model and taxonomy

## Core taxonomy entities

### GicsSector
```ts
type GicsSector = {
  id: string
  code: string
  name: string
  etfTicker?: string
  description?: string
}
```

### GicsIndustryGroup
```ts
type GicsIndustryGroup = {
  id: string
  code: string
  name: string
  sectorId: string
}
```

### GicsIndustry
```ts
type GicsIndustry = {
  id: string
  code: string
  name: string
  sectorId: string
  industryGroupId: string
  description?: string
  valueFrameworkId: string
  cyclicalityClass: "defensive" | "mixed" | "cyclical" | "hyper_cyclical"
}
```

### GicsSubIndustry
```ts
type GicsSubIndustry = {
  id: string
  code: string
  name: string
  industryId: string
}
```

### StockClassification
```ts
type StockClassification = {
  ticker: string
  companyName: string
  sectorId: string
  industryGroupId: string
  industryId: string
  subIndustryId?: string
  source: "gics_feed" | "curated_override"
  asOf: string
}
```

## Sector / industry analytics entities

### SectorAnalytics
```ts
type SectorAnalytics = {
  sectorId: string
  asOf: string
  performance: {
    d1: number
    m1: number
    y1: number
    y5: number
  }
  valuationState: "cheap" | "fair" | "expensive" | "withheld"
  concentrationTop3: number
  topIndustries: IndustryMiniSummary[]
  candidateCount: number
}
```

### IndustryAnalytics
```ts
type IndustryAnalytics = {
  industryId: string
  sectorId: string
  asOf: string
  universeSize: number
  aggregateWeightInSector?: number
  performanceVsSector: number
  performanceVsMarket: number
  medianMultiples: {
    forwardPe?: number | null
    evEbitda?: number | null
    evRevenue?: number | null
    priceToBook?: number | null
    fcfYield?: number | null
  }
  valuationVsHistory: {
    status: "cheap" | "fair" | "expensive" | "withheld"
    percentile: number | null
  }
  qualityMetrics: {
    medianOperatingMargin?: number | null
    medianRoe?: number | null
    medianRoic?: number | null
    debtHealthScore?: number | null
  }
  revisionTrend: "improving" | "flat" | "deteriorating" | "unknown"
  cyclicality: "defensive" | "mixed" | "cyclical" | "hyper_cyclical"
  candidateCounts: {
    validated: number
    possible: number
    trapRisk: number
  }
  confidence: number
}
```

### ValueCandidate
```ts
type ValueCandidate = {
  ticker: string
  companyName: string
  sectorId: string
  industryId: string
  subIndustryId?: string
  asOf: string
  candidateClass: "validated_value" | "possible_value" | "value_trap_risk" | "not_attractive"
  valuationLabel: "cheap" | "fair" | "expensive" | "withheld"
  valuationConfidence: number | null
  peerQuality: "strong" | "medium" | "weak" | "unknown"
  score: number
  reasonsFor: string[]
  reasonsAgainst: string[]
  requiresManualReview: boolean
}
```

## Source hierarchy

### Mandatory
1. GICS classification feed / licensed dataset or a consistent in-house mapping source
2. Validated stock valuation artifacts
3. Peer registry / peer evaluation artifacts
4. Market data and canonical facts
5. LLM explanations

### Forbidden
- using sector ETF holdings alone as the canonical industry mapping for all stocks
- inferring industry from company name
- allowing LLM-generated industry labels without deterministic classification

## Practical rollout guidance

### Phase 1
Use a curated or licensed GICS mapping for:
- sector
- industry group
- industry
- sub-industry

### Phase 2
Aggregate industries using your stock universe, not just ETF holdings.

### Phase 3
Allow ETF holdings to be used for “representative sector composition” only, not for taxonomy truth.

## Industry value frameworks

Every industry must map to a valuation framework.

Examples:
- `cyclical_semiconductor_memory_v1`
- `software_platforms_v1`
- `interactive_media_v1`
- `property_casualty_insurance_v1`
- `consumer_beverages_v1`
- `industrial_machinery_v1`

This is how the candidate engine decides:
- which multiples matter
- how to select peers
- which risks matter
- how much cyclicality penalty to apply


# File: 05-sector-and-industry-analysis-framework.md
# Sector and industry analysis framework

## Why industry matters more than sector for value discovery

Sector answers:
- where to look

Industry answers:
- who to compare
- what normal margins and multiples look like
- whether cheapness is real or misleading

The app should therefore use:
- **sector** for top-down screening
- **industry** for actual comparison
- **stock valuation** for final judgment

## Sector analysis requirements

Sector analysis should continue to include:
- relative performance
- valuation state
- macro drivers
- concentration
- confidence

Add:
- industry count
- top industries by size
- top industries by attractiveness
- sector breadth signal:
  - many industries attractive
  - few industries attractive
  - attractiveness concentrated in one pocket

## Industry analysis requirements

Each industry page should answer:

1. What is this industry?
2. How big is it inside the sector?
3. How has it performed?
4. How expensive is it?
5. What are normal economics here?
6. Is this a good hunting ground for value?
7. Which names deserve deeper work?

## Industry scorecard dimensions

### 1. Valuation
- current median multiple vs industry history
- current median multiple vs sector median
- spread between highest-quality and lowest-quality names
- percent of names screening cheap

### 2. Quality
- median operating margin
- median ROIC / ROE where relevant
- balance-sheet health
- FCF conversion
- earnings quality

### 3. Revision / momentum context
- earnings revisions trend
- price momentum vs fundamentals
- breadth of participation
- whether cheapness is broad or concentrated

### 4. Cyclicality
- classify the industry as:
  - defensive
  - mixed
  - cyclical
  - hyper-cyclical
- apply different tolerances for value labeling depending on cyclicality

### 5. Concentration
- top 3 market-cap or benchmark-weight names
- share of industry economics driven by leaders
- whether the industry view is actually just one or two stocks

### 6. Candidate quality
- how many stocks are:
  - validated value candidates
  - possible value
  - trap risk
- median peer-quality score across the candidate set

## Industry attractiveness state

Each industry gets a deterministic label:

- `ATTRACTIVE_HUNTING_GROUND`
- `MIXED`
- `OVERHEATED`
- `LOW_VISIBILITY`
- `WITHHELD`

### Example logic
```ts
if (valuationCheap && qualityOkay && revisionTrendNotCollapsing && candidateCoverageGood) {
  return "ATTRACTIVE_HUNTING_GROUND"
}
if (valuationExpensive && momentumHot && concentrationHigh) {
  return "OVERHEATED"
}
if (coverageWeak || peerQualityWeak) {
  return "LOW_VISIBILITY"
}
return "MIXED"
```

## Example benchmark industries

### Technology
- Semiconductors
- Software
- IT Services
- Communications Equipment
- Hardware / Storage / Peripherals

### Consumer Staples
- Beverages
- Packaged Foods
- Household Products
- Personal Care

### Financials
- Property & Casualty Insurance
- Regional Banks
- Asset Managers
- Capital Markets

### Industrials
- Machinery
- Aerospace & Defense
- Electrical Equipment
- Building Products

The app does not need full market coverage on day 1.
It does need:
- a deterministic industry table
- framework-specific scoring
- validated candidate logic

## Sector-to-industry workflow

1. Rank sectors by valuation state and macro context
2. Within each sector, rank industries by attractiveness
3. Only within attractive or mixed industries, generate stock candidates
4. Require candidate stocks to pass stock-level validation before surfacing as “validated”


# File: 06-value-stock-candidate-methodology.md
# Value stock candidate methodology

## Objective

Identify stocks that are plausible value opportunities **within the correct industry context**.

## Core rule

A stock may not be labeled a “validated value candidate” unless:
1. the stock has a deterministic GICS industry assignment
2. the stock has a peer pack appropriate to that industry
3. the stock has a stock valuation artifact
4. the stock valuation artifact is publishable
5. the stock is cheap versus both:
   - its own fair value range
   - and/or its own history / peers in a way consistent with the framework
6. the trap-risk checks do not fail

## Candidate generation pipeline

### Step 1 — Build eligible stock universe per industry
Inputs:
- U.S.-listed stock universe (start with S&P 500 / liquid mid-large cap)
- GICS mapping
- market data
- canonical facts / valuation artifacts

### Step 2 — Run industry filter
Only generate candidates in industries that are:
- `ATTRACTIVE_HUNTING_GROUND`
- or `MIXED` with at least one cheapness signal

Do not generate value candidates for:
- `OVERHEATED`
- `WITHHELD`
unless explicitly in a “speculative / monitor” section

### Step 3 — Run stock-level candidate screen
Minimum deterministic screening fields:
- cheap/fair/expensive label
- valuation confidence
- peer quality
- balance-sheet health
- profitability / cash flow
- history sufficiency
- data freshness

### Step 4 — Classify candidate

#### Validated value candidate
Requirements:
- stock valuation label = `cheap`
- valuation confidence >= 0.60
- peer quality >= `medium`
- no major trap-risk flags
- data freshness within SLA

#### Possible value
Requirements:
- valuation label = `cheap` or `fair with upside`
- confidence between 0.40 and 0.60
- peer quality medium or weak
- some open questions remain

#### Value trap risk
Requirements:
- optically cheap, but:
  - earnings collapsing
  - leverage too high
  - margins structurally deteriorating
  - peer set weak
  - sector/industry economics worsening
  - stock valuation withheld

#### Not attractive
Requirements:
- valuation label = `fair` or `expensive`
- or industry unattractive
- or quality too weak

## Trap-risk engine

Every candidate should compute a trap-risk score.

### Suggested trap-risk checks
- persistent negative free cash flow
- net leverage too high for industry
- downward revision trend
- margin deterioration not explained by normal cycle
- peer comparison poor even when cheap
- capital allocation concerns
- missing or weak peer set
- withheld stock valuation

### Trap-risk labels
- `LOW`
- `MEDIUM`
- `HIGH`

If trap-risk is `HIGH`, the stock may not be shown as validated value.

## Framework-specific candidate logic

### Cyclical semiconductor example (MU-like)
Candidate not enough if:
- stock is cheap only because earnings are at trough
- normalized value not demonstrably above price
- cycle state too uncertain

Need:
- normalized DCF
- self-history support
- peer support
- cycle-aware confidence

### Consumer beverage example (KO / PEP / KDP style)
Need:
- peer valuation
- stable cash flow and margin profile
- dividend / FCF support
- lower cyclicality penalty

### Property & casualty insurance example (ALL / PGR / TRV style)
Need:
- P/B and P/E discipline
- ROE context
- underwriting / combined ratio context
- not EV/EBITDA-led logic

### Interactive media / platform example (META / GOOGL / PINS / SNAP)
Need:
- peer set quality
- margin durability
- ad-cycle and capital allocation context
- network-effect / scale differences accounted for

## Example benchmark peer packs

### MU — memory semiconductors
Primary:
- SK hynix
- Samsung Electronics
Secondary:
- Western Digital / storage adjacent
Exclude as primary:
- Nvidia
- AMD
- Intel

### KO — beverages
Primary:
- PepsiCo
- Keurig Dr Pepper
Secondary:
- Coca-Cola Europacific Partners
- Monster Beverage

### ALL — property & casualty insurance
Primary:
- Progressive
- Travelers
Secondary:
- Hartford
- Cincinnati Financial
- Chubb

### META — interactive media & services
Primary:
- Alphabet
Secondary:
- Pinterest
- Snap
- Reddit (if coverage acceptable)
Exclude:
- unrelated enterprise software or casinos or insurers, even if screeners suggest them

## Important validation principle

The app must validate not only the subject stock, but also the peer set behind the stock.

That means candidate publication requires:
- peer discovery
- peer scoring
- peer valuation snapshots or stock valuation artifacts
- peer freshness
- role correctness
- exclusion correctness


# File: 07-ui-ux-specification.md
# UI / UX specification

## Design principles

1. Preserve the current dark visual language.
2. Add industry depth without cluttering the sector overview.
3. Keep sectors scannable and industries drillable.
4. Separate:
   - broad market narrative
   - industry attractiveness
   - stock candidate validation
5. Never present candidate stocks as validated if their valuation is withheld.

## New navigation pattern

### Sector page tabs
Current:
- Overview
- Learn
- Position
- Holdings

Add:
- **Industries**

Optionally rename:
- `Holdings` -> `Leaders & Candidates`

## New / updated views

### A. Sector Overview page (updated)
Add to each sector card:
- number of industries
- top 2 attractive industries
- count of validated candidates

Card footer example:
- `Industries: 7`
- `Top opportunities: IT Services, Software`
- `Validated candidates: 4`

### B. Sector Detail — Industries tab (new)
Core modules:
1. Industry heatmap / table
2. Industry cards ranked by attractiveness
3. “Where value may exist” summary
4. Candidate counts by industry
5. Filters:
   - all industries
   - attractive only
   - validated candidate count > 0
   - cyclical only
   - defensive only

### C. Industry Detail page (new)
Header:
- Industry name
- sector
- attractiveness state
- confidence
- updated timestamp

Sections:
1. What this industry includes
2. Performance vs sector / market
3. Valuation vs own history
4. Quality profile
5. Top companies and concentration
6. Candidate value stocks
7. Risks and what to watch
8. Peer quality notes

### D. Candidate stocks module (new)
Display:
- ticker / company
- valuation label
- confidence
- peer quality
- trap risk
- short value thesis
- why it is here
- CTA: open valuation report

### E. Stock valuation page (updated)
Add:
- sector / industry / sub-industry breadcrumb
- peer-set quality badge
- industry median multiples panel
- “why surfaced from industry screen” panel
- “value candidate status” badge

## UI states

### Candidate state badge set
- `Validated value`
- `Possible value`
- `Trap risk`
- `Not attractive`
- `Withheld`

### Industry state badge set
- `Attractive hunting ground`
- `Mixed`
- `Overheated`
- `Low visibility`
- `Withheld`

## Interaction requirements

### Sector → industry drill-in
Clicking an industry row must preserve context:
- sector
- selected time horizon
- valuation filter
- view mode

### Candidate clicks
Opening a candidate stock should pass:
- source industry
- source sector
- candidate class
- screening reasons

That allows the stock page to explain:
> “Surfaced from Technology > IT Services because it screens cheap vs peers and history, with medium peer quality and low trap risk.”

## Accessibility and clarity
- avoid red/green only; include text badges
- show confidence as text + tooltip
- show withheld reasons explicitly
- show peer quality with explanation on hover

## Recommended new screens
- Sector overview with industry strip
- Sector detail industries tab
- Industry detail with candidate list
- Stock valuation page with peer panel and industry context


# File: 08-validation-and-ralph-loop.md
# Validation and Ralph-loop specification

## Core question

> Can the system safely publish industry-level value insights and validated stock candidates?

## Extension of current safety model

The current stock valuation workflow validates:
- facts
- valuation publishability
- report surface safety

This feature adds three new validation layers:
1. **taxonomy integrity**
2. **industry analysis integrity**
3. **candidate publication integrity**

## New Ralph loop scope

### Loop objectives
- ensure GICS mapping is stable and deterministic
- ensure industries are scored with the right framework
- ensure candidate stocks are backed by valid stock valuation artifacts
- ensure peer packs are good enough for the stock and the industry
- ensure the UI never shows unsupported candidate labels

## New validation groups

### Group I1 — Taxonomy integrity
| Rule ID | Check | Severity |
|---|---|---|
| `TAX-001` | every surfaced stock has sector + industry | High |
| `TAX-002` | every surfaced industry belongs to the shown sector | High |
| `TAX-003` | industry counts are deterministic | Medium |
| `TAX-004` | industry labels come from approved taxonomy source | High |
| `TAX-005` | no LLM-generated taxonomy fields | High |

### Group I2 — Industry analytics integrity
| Rule ID | Check | Severity |
|---|---|---|
| `IND-001` | every industry scorecard has deterministic source inputs | High |
| `IND-002` | industry valuation state has formula trace | High |
| `IND-003` | industry confidence bounded and explained | Medium |
| `IND-004` | candidate counts equal underlying validated stock counts | High |
| `IND-005` | industry state withheld if coverage too weak | High |

### Group I3 — Candidate generation integrity
| Rule ID | Check | Severity |
|---|---|---|
| `CAND-001` | every validated candidate has a stock valuation artifact | High |
| `CAND-002` | every validated candidate has valuation label != withheld | High |
| `CAND-003` | every validated candidate has peer quality >= medium | High |
| `CAND-004` | trap-risk high blocks validated status | High |
| `CAND-005` | stale stock valuations block candidate publication | High |
| `CAND-006` | possible-value candidates are labeled distinctly | Medium |

### Group I4 — Peer pack integrity
| Rule ID | Check | Severity |
|---|---|---|
| `PEER-IND-001` | every candidate stock has a peer pack appropriate to its industry framework | High |
| `PEER-IND-002` | peer roles (primary/secondary/excluded) match benchmark pack when available | High |
| `PEER-IND-003` | peer quality is deterministic | High |
| `PEER-IND-004` | at least one usable peer valuation snapshot exists for publishable candidate status | High |
| `PEER-IND-005` | weak peers reduce candidate confidence or force possible-value status | High |

### Group I5 — UI surface integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SURF-IND-001` | no candidate shown as validated if valuation artifact withheld | High |
| `SURF-IND-002` | no “cheap” badge shown without valuation label | High |
| `SURF-IND-003` | industry state and candidate counts match backend payload | High |
| `SURF-IND-004` | sector card summaries match industry table aggregates | Medium |
| `SURF-IND-005` | candidate reasons rendered from allowlisted fields only | High |

## Ralph loop state additions

Add these benchmark suites:

### Benchmark suite A — sector / industry structure
Examples:
- Technology sector with correct industries
- Financials sector with correct industries
- Consumer Staples sector with correct industries

### Benchmark suite B — stock candidate packs
Examples:
- MU memory peers and candidate state
- KO beverage peers and candidate state
- ALL insurance peers and candidate state
- META interactive media peers and candidate state

### Benchmark suite C — negative controls
Examples:
- stock appears in wrong industry
- candidate shown without stock valuation artifact
- candidate shown with withheld valuation
- weak peer quality but “validated value” status
- industry shown as attractive with zero underlying support

## Candidate publish gate

A candidate stock can only be published as `validated_value` if:
- stock facts gate passed
- stock valuation gate passed
- stock valuation label == cheap
- stock valuation confidence >= 0.60
- peer quality >= medium
- trap risk < high
- valuation freshness within SLA

Else:
- downgrade to `possible_value`, `trap_risk`, or suppress entirely

## Industry publish gate

An industry can publish as `ATTRACTIVE_HUNTING_GROUND` only if:
- valuation state not withheld
- coverage above minimum stock count
- enough stocks inside the industry have usable valuation artifacts
- candidate set is not empty or industry valuation is compelling enough on its own
- confidence >= threshold

Else:
- downgrade to `MIXED` or `LOW_VISIBILITY`

## Stop conditions for Ralph loop

The feature is safe enough to ship when:
1. taxonomy integrity passes
2. industry integrity passes
3. candidate integrity passes
4. benchmark peer packs pass
5. UI surface tests pass
6. negative controls pass
7. no regression in existing stock valuation workflow


# File: 09-implementation-plan.md
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


# File: 10-prompt-for-coding-assistant.md
# Prompt for coding assistant

You are implementing the next product layer for the investment tracker:

> sector -> industry -> stock value discovery

Your goal is to extend the existing sector and stock valuation system so the app can:
- show industries inside each GICS sector
- analyze those industries as value-hunting grounds
- generate potential value stock candidates
- only surface validated candidates when stock-level valuation and peer quality are good enough

## Mission

Build this feature without weakening the existing filing-first valuation workflow.

The current app already has:
- sector pages
- stock valuation pages
- deterministic stock facts and valuation artifacts
- Ralph-loop validation for stock valuation

You must add the missing middle layer:
- industry structure
- industry analysis
- candidate generation
- candidate validation

## Non-negotiable rules

1. Sector is not enough for valuation.
   - Sector may guide discovery.
   - Industry must be used for comparison.
2. No candidate stock can be labeled “validated value” without a stock valuation artifact.
3. No candidate stock can be labeled “cheap” if its stock valuation label is withheld.
4. Taxonomy must be deterministic.
5. LLMs may explain; they may not invent sector, industry, candidate, or peer facts.
6. Prefer suppression or downgrade over false precision.

## Build order

### Phase 1 — Taxonomy and routes
- add sector -> industry -> stock navigation
- add GICS tables and stock classifications
- add industry routes and basic page shells

### Phase 2 — Industry analytics
- build deterministic `IndustryAnalytics`
- add industry leaderboard and heatmap data
- add industry state labels:
  - ATTRACTIVE_HUNTING_GROUND
  - MIXED
  - OVERHEATED
  - LOW_VISIBILITY
  - WITHHELD

### Phase 3 — Candidate engine
- create deterministic `ValueCandidate` generator
- use stock valuation artifacts + peer quality + trap risk
- add candidate classes:
  - validated_value
  - possible_value
  - value_trap_risk
  - not_attractive

### Phase 4 — Validation and Ralph-loop
- add taxonomy validation
- add industry integrity validation
- add candidate integrity validation
- add benchmark packs for:
  - MU
  - KO
  - ALL
  - META
- add negative controls

## Required artifact dependencies

A stock may only appear as `validated_value` if:
- facts gate passed
- value gate passed
- valuation label is cheap
- valuation confidence >= 0.60
- peer quality >= medium
- trap risk is not high
- valuation freshness within SLA

If any of these fail:
- downgrade to `possible_value`
- or mark `value_trap_risk`
- or suppress entirely

## Required benchmark peer expectations

### MU
Primary memory peers:
- SK hynix
- Samsung Electronics
Secondary:
- Western Digital
Exclude as primary:
- NVDA
- AMD
- INTC

### KO
Primary:
- PEP
- KDP
Secondary:
- CCEP
- MNST

### ALL
Primary:
- PGR
- TRV
Secondary:
- HIG
- CINF
- CB

### META
Primary:
- GOOGL
Secondary:
- PINS
- SNAP
- RDDT when coverage acceptable
Do not allow random SIC-adjacent but economically irrelevant peers.

## Validation requirements

You must implement and run:
- taxonomy tests
- sector / industry aggregate consistency tests
- candidate publication tests
- UI surface tests
- negative controls

Add a Ralph-loop scorecard that answers:
1. Are sector -> industry mappings correct?
2. Are industry states justified by deterministic inputs?
3. Are candidate counts and classes correct?
4. Are validated candidates actually backed by stock valuation artifacts?
5. Are peer packs appropriate for each benchmark stock?
6. Do the screens render only allowed labels and metrics?

## Deliverables per iteration

For each Ralph-loop iteration, emit:
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `industry-benchmark-results.json`
- `candidate-benchmark-results.json`
- `generated-industry-report.md` or equivalent screen payloads
- artifact inventory

## Success definition

The feature is good enough when:
- sector pages show correct industries
- industry pages show deterministic analytics
- validated candidates are truly backed by stock valuations
- benchmark stocks land in sensible industries with sensible peers
- negative controls block invalid candidate publication
- no regressions occur in the existing stock valuation pipeline


# File: 11-design-assets.md
# Design assets index

This file describes the included mockups.

## design-01-sector-overview-with-industries.png
Updated sector overview page.
Adds:
- industry count
- top attractive industries
- validated candidate counts
- more explicit “where to look” cues on each sector card

## design-02-sector-detail-industry-tab.png
New industries tab inside a sector detail page.
Adds:
- industry heatmap
- industry leaderboard
- candidate counts
- attractiveness labels
- sector breadth summary

## design-03-industry-detail-value-candidates.png
New industry detail page.
Adds:
- industry overview
- valuation vs history
- quality / cyclicality cards
- top companies
- validated / possible / trap-risk candidate list
- peer quality legend

## design-04-stock-valuation-peer-panel.png
Updated stock valuation page.
Adds:
- industry breadcrumb
- peer quality panel
- industry median multiples
- candidate provenance panel
- “why this stock surfaced” context


