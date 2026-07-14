# Industry Extension + Value Candidate Screening Spec Bundle

This bundle defines how to extend the current sector-first app into a sector + industry research and value-candidate workflow.

## What this feature adds

- Industry information and analysis inside each sector
- Deterministic industry-level screening for value candidates
- Deep-work handoff from screening to stock valuation / peer analysis
- Validation, publish gates, and Ralph-loop rules for safe candidate publication
- Dark-theme design mockups aligned to the current app

## Intended use

1. Treat `industry-extension-value-screening-spec-complete.md` as the master spec.
2. Treat `02-prd.md` as the product requirements source of truth.
3. Treat `06-validation-and-ralph-loop.md` as the implementation and quality contract.
4. Treat `09-ralph-loop-prompt.md` and `10-coding-assistant-prompt.md` as operational prompts for the agent.
5. Use the design PNGs as visual targets for the next UI iteration.

## Key product principle

A stock should **not** appear as a published "value candidate" merely because it screened cheap on sector/industry metrics.
It must either:
- pass deterministic screening and be clearly labeled as `SCREEN_PASS / NEEDS_DEEP_WORK`, or
- have a valid stock valuation artifact and peer-analysis artifact, and then be labeled as `PUBLISHED_VALUE_CANDIDATE`.

## Bundle contents

- `01-executive-summary.md`
- `02-prd.md`
- `03-information-architecture.md`
- `04-data-model-and-pipeline.md`
- `05-screening-and-analysis-framework.md`
- `06-validation-and-ralph-loop.md`
- `07-ui-ux-spec.md`
- `08-implementation-plan.md`
- `09-ralph-loop-prompt.md`
- `10-coding-assistant-prompt.md`
- `11-source-references.md`
- `industry-extension-value-screening-spec-complete.md`
- `design-01-sector-overview-with-industries.png`
- `design-02-sector-detail-industries-tab.png`
- `design-03-industry-detail-value-screen.png`
- `design-04-industry-candidate-detail.png`


---

# 01. Executive summary

## Goal

Extend the current sector pages so the user can:
1. see the industries inside a sector,
2. understand which industries are attractive hunting grounds for value,
3. run a deterministic value screen from an industry page,
4. review a shortlist of candidate stocks,
5. distinguish between:
   - cheap statistical screens,
   - high-quality potential value candidates,
   - names that still need deep work,
   - likely value traps.

## Core design idea

Use **GICS sector** for top-down navigation and **GICS industry / sub-industry** for actual comparability and screening.

- Sector answers: **Where should I look?**
- Industry answers: **Who is actually comparable?**
- Stock valuation answers: **Is this company cheap, fair, or expensive?**

## Why this matters

The existing sector pages are useful for top-down context, but they stop before the user can turn that context into an actionable shortlist.
This feature closes that gap by adding an industry layer and a structured screening funnel.

## Product boundaries

This feature does **not** claim that a screened stock is investable by default.
It creates a disciplined funnel:

- Stage A: universe reduction
- Stage B: sector and industry triage
- Stage C: cheapness screens
- Stage D: quality filter
- Stage E: deep work and valuation

Only Stage E can produce a publishable stock-level "value candidate" conclusion.

## Publish safety

There are now three separate publication decisions:

1. `factsGate` — can we publish the stock facts?
2. `valueGate` — can we publish fair value / cheap-fair-expensive?
3. `candidateGate` — can we publish this stock as a value candidate inside the industry experience?

If the candidate gate fails, the stock may still appear in the industry screen, but only as:

- `SCREEN_PASS`
- `NEEDS_DEEP_WORK`
- `WATCHLIST_ONLY`
- `EXCLUDED_VALUE_TRAP_RISK`

## Benchmark examples used in validation

This spec includes benchmark expectations for:
- `MU` — cyclical semiconductor / memory
- `KO` — beverages / staples
- `ALL` — insurance / financials
- `META` — interactive media & services

These examples are used to validate:
- taxonomy mapping,
- industry placement,
- peer-pack appropriateness,
- relative-metric choice,
- candidate-publication logic.


---

# 02. PRD

## Product name

**Industry Extension + Value Candidate Screening**

## Problem statement

The app currently gives users strong sector-level context, but it does not yet help them move from:

> "This sector looks interesting"

to:

> "These are the industries worth hunting in, and these are the stocks that deserve deeper valuation work."

Without an industry layer, users are forced to compare stocks across businesses with very different economics, capital intensity, regulation, and peer groups.

## Users

### Primary user
A self-directed investor who:
- understands sectors and basic stock metrics,
- wants help finding value opportunities,
- does not want to manually sift through thousands of stocks,
- wants structured, explainable narrowing from market -> sector -> industry -> stock.

### Secondary user
A more advanced investor who:
- wants a repeatable screening workflow,
- wants clear deterministic rules before any LLM-driven narrative,
- wants to audit why a stock was surfaced or excluded.

## Jobs to be done

1. **When I am exploring a sector, help me see which industries within it are attractive or unattractive.**
2. **When I open an industry, help me quickly screen for cheap-but-possibly-good stocks.**
3. **When a stock is surfaced, show whether it is simply statistically cheap or a stronger value candidate.**
4. **When a stock is excluded, tell me whether that is because of leverage, margin collapse, dilution, weak cash conversion, or another trap signal.**
5. **When I revisit an industry later, help me see what changed.**

## Goals

### Product goals
- Add industries to each sector page in a way that feels native to the current UI.
- Launch a deterministic value screen from the industry page.
- Produce a shortlist that is explainable and ranked.
- Keep deep company analysis separate from screen-only results.
- Avoid publishing "value" claims when only shallow screening evidence exists.

### Quality goals
- Deterministic inputs and formulas wherever possible.
- LLM only for explanation, clustering, and deep-work synthesis.
- Explicit candidate publication rules.
- Ralph-loop validation for taxonomy, screening math, candidate states, and surface integrity.

## Non-goals
- Fully automated buy/sell advice from the industry page.
- Portfolio optimization.
- Predicting market timing.
- Replacing the stock valuation feature.
- Supporting every global exchange in the first release.

## Success metrics

### Product metrics
- % of sector page visits that open an industry detail page
- % of industry page visits that run the value screen
- % of screen results clicked into stock detail / valuation pages
- time-to-shortlist for a user session

### Quality metrics
- deterministic run reproducibility for same snapshot
- candidate false-positive rate from benchmark review
- candidate false-negative rate on benchmark fixtures
- percentage of surfaced candidate rows with complete evidence and peer-pack context
- zero publish-gate violations

## Functional requirements

### FR-1 Sector page includes industries
- Each sector page must show its industries.
- Each industry must show:
  - name
  - relative size / exposure
  - valuation status
  - revisions / fundamentals signal
  - candidate count
  - risk flag count
  - click-through to industry page

### FR-2 Industry page includes value screen
- User can run a deterministic value screen from the industry page.
- Screen results must be rankable and filterable.

### FR-3 Screen result states
Each stock result must be labeled as one of:
- `SCREEN_PASS`
- `NEEDS_DEEP_WORK`
- `PUBLISHED_VALUE_CANDIDATE`
- `WATCHLIST_ONLY`
- `EXCLUDED_VALUE_TRAP_RISK`

### FR-4 Stock detail integration
- A stock opened from the industry screen must show:
  - why it surfaced
  - which filters it passed
  - where it sits vs industry medians / history
  - whether it already has a valid stock valuation artifact

### FR-5 Auditability
- Every screen result must preserve:
  - input snapshot time
  - source provenance
  - thresholds used
  - benchmark / framework used
  - peer-pack status


---

# 03. Information architecture

## Navigation hierarchy

```text
Market
  └── Sectors
        └── Sector Detail
              ├── Overview
              ├── Learn
              ├── Position
              ├── Holdings
              └── Industries   ← NEW
                    └── Industry Detail
                          ├── Overview
                          ├── Value Screen   ← NEW
                          ├── Candidates     ← NEW
                          ├── Compare        ← NEW
                          └── Evidence
                                └── Stock Detail / Valuation
```

## New top-level objects

### Sector
The broad GICS level used for top-down market navigation.

### Industry
The narrower GICS level used for:
- comparability
- median valuation calculations
- screening medians and percentiles
- peer-pack expectations
- candidate publication

### Candidate
A stock surfaced by the industry screen.

Important: a `candidate` is not necessarily a published value call.

## Page roles

### Sector Overview
Purpose:
- broad sector direction
- where to hunt

### Sector Industries tab
Purpose:
- show which industries inside the sector look attractive / neutral / unattractive
- act as the launch point into industry pages

### Industry Detail
Purpose:
- explain what the industry is
- show composition, valuation, concentration, cycle state, and macro drivers

### Industry Value Screen
Purpose:
- apply the Stage A-E funnel to all stocks in the industry
- return a ranked list with deterministic reasons

### Industry Candidates
Purpose:
- show only the strongest screen passes and validated candidates
- split by confidence / publication state

### Stock Detail / Valuation
Purpose:
- connect industry context to stock valuation and peer analysis

## New tabs and entry points

### On the Sector page
Add tab:
- `Industries`

### On the Industry page
Add tabs:
- `Overview`
- `Value Screen`
- `Candidates`
- `Compare`
- `Evidence`

## Primary user flow

1. User opens **Sectors**
2. User opens **Technology**
3. User clicks **Industries**
4. User sees Software, Semiconductors, Communications Equipment, etc.
5. User opens **Semiconductors**
6. User runs **Value Screen**
7. App shows:
   - screen passes
   - exclusions
   - likely traps
   - published candidates
8. User opens a surfaced stock
9. User sees stock valuation and peer context

## Screen states

### Sector page
- all industries loaded
- partial industries loaded
- stale industry analytics
- unavailable industry analytics

### Industry screen
- no results yet
- screening in progress
- deterministic results ready
- deep work pending
- candidate publication ready


---

# 04. Data model and pipeline

## Canonical taxonomy

Use GICS as the canonical market hierarchy:

```text
Sector -> Industry Group -> Industry -> Sub-Industry
```

### Rules
- Sector is the primary navigation level.
- Industry is the primary comparison level.
- Sub-industry is used when peer precision matters.

## Core entities

### SectorSnapshot
```json
{
  "sectorId": "information-technology",
  "asOf": "2026-04-13T20:00:00Z",
  "etfProxy": "XLK",
  "valuationStatus": "EXPENSIVE",
  "trendShortTerm": "POSITIVE",
  "trendLongTerm": "POSITIVE",
  "industryCount": 8
}
```

### IndustrySnapshot
```json
{
  "industryId": "semiconductors",
  "sectorId": "information-technology",
  "asOf": "2026-04-13T20:00:00Z",
  "relativeSize": 0.28,
  "memberCount": 52,
  "valuationVsHistory": -0.2,
  "valuationVsIndustryMedian": null,
  "revisionsTrend": "IMPROVING",
  "qualityScore": 0.72,
  "cycleState": "ABOVE_MID",
  "candidateCounts": {
    "screenPass": 7,
    "publishedValueCandidate": 2,
    "watchlistOnly": 6,
    "trapRisk": 3
  }
}
```

### IndustryScreenResult
```json
{
  "ticker": "ADBE",
  "industryId": "application-software",
  "snapshotAt": "2026-04-13T20:00:00Z",
  "screenState": "SCREEN_PASS",
  "cheapnessSignals": {
    "forwardPeVsIndustryMedian": -0.18,
    "evEbitdaVsOwnHistoryPercentile": 0.22,
    "fcfYieldVsIndustryMedian": 0.03
  },
  "qualitySignals": {
    "leverageOk": true,
    "marginStabilityOk": true,
    "dilutionOk": true,
    "cashConversionOk": true
  },
  "trapFlags": [],
  "hasValuationArtifact": true,
  "hasPeerAnalysisArtifact": true,
  "candidatePublishable": false
}
```

### PublishedValueCandidate
```json
{
  "ticker": "ADBE",
  "industryId": "application-software",
  "status": "PUBLISHED_VALUE_CANDIDATE",
  "currentPrice": 0,
  "fairValueRange": { "low": 0, "mid": 0, "high": 0 },
  "valuationLabel": "CHEAP",
  "valuationConfidence": 0.76,
  "peerPackStatus": "VALIDATED",
  "candidateReasons": [],
  "thesisRisks": []
}
```

## Data source plan

### Deterministic sources
- GICS mappings / classifications
- market data API
- SEC EDGAR filings
- filing-derived fundamentals
- existing stock valuation artifacts
- peer registry / peer evaluation outputs

### LLM-permitted sources
- explanation synthesis
- industry narrative
- risk summarization
- filing excerpt classification
- deep-work candidate memo generation

### Forbidden for core screen math
- ad hoc web search
- blog or forum content
- LLM-imputed financial metrics
- unsupported fair value estimates

## Pipeline stages

### Stage 0 — taxonomy and constituent resolution
Inputs:
- sector / industry selection
- GICS mapping
- current constituent universe

Outputs:
- stock universe for the chosen industry

### Stage A — universe reduction
Deterministic filters:
- minimum liquidity
- minimum market cap
- recent filing freshness
- exclude shells / OTC / bankrupt names
- exclude extreme distress by default

### Stage B — sector and industry triage
Deterministic features:
- sector valuation vs history
- industry valuation vs history
- revisions trend
- quality medians
- concentration / cyclicality tags

### Stage C — cheapness screens
Deterministic, industry-relative metrics.

### Stage D — quality filter
Deterministic risk and quality checks.

### Stage E — deep work
This is where LLM help is allowed, but only for:
- reading filings
- summarizing thesis
- explaining why a screen pass may or may not be a real value setup
- producing a candidate memo

## Candidate publication rule

A stock may be shown in the industry page as a **published value candidate** only if:
1. it passes deterministic cheapness and quality screens,
2. it has a valid stock valuation artifact,
3. it has a valid peer analysis artifact,
4. its stock-level valuation confidence is above threshold,
5. no trap-risk blocker is active.


---

# 05. Screening and analysis framework

## Overview

The industry-page screening system implements the funnel:

- Stage A — universe reduction
- Stage B — sector and industry triage
- Stage C — cheapness screens
- Stage D — quality filter
- Stage E — deep work

The first four stages are deterministic.
Stage E may include LLM analysis, but only after the deterministic screen is complete.

---

## Stage A — universe reduction

### Default deterministic filters
| Filter | Default rule | Purpose |
|---|---|---|
| Exchange | US primary listing only (phase 1) | consistent data coverage |
| Market cap | >= $2B | avoid micro-cap noise |
| Price | >= $5 | avoid penny-stock distortions |
| Liquidity | median daily dollar volume >= $10M over 30 trading days | investability |
| Filing freshness | latest 10-K <= 400 days; latest 10-Q <= 140 days if required | current reporting |
| Exclude shells / OTC | true | data quality / relevance |
| Extreme distress | exclude by default if bankruptcy risk, going-concern warning, or net-cash runway < 12 months and no specialist mode | trap prevention |

### Specialist mode
If enabled, the user can allow:
- small caps
- distressed names
- negative FCF but cash-rich names

These names must be tagged `SPECIALIST_MODE_ONLY`.

---

## Stage B — sector and industry triage

### Sector triage metrics
- sector valuation vs 5Y history
- sector performance vs fundamentals
- earnings revision trend
- macro sensitivity tag
- concentration risk tag

### Industry triage metrics
- industry median forward P/E
- industry median EV/EBITDA
- industry median P/B where relevant
- industry median FCF yield
- industry median ROIC / ROE
- revisions trend
- margin stability
- concentration / cyclicality tag

### Industry hunting-ground score

```text
IndustryHuntingGroundScore =
  0.30 * valuation_vs_history +
  0.20 * revisions_signal +
  0.20 * quality_median_signal +
  0.15 * fundamentals_vs_price_signal +
  0.10 * concentration_penalty +
  0.05 * macro_tailwind_signal
```

Normalized to 0-100.

### Industry states
- `ATTRACTIVE_HUNTING_GROUND`
- `MIXED`
- `CAUTION`
- `UNSUITABLE_FOR_VALUE_SCREEN`

---

## Stage C — cheapness screens

Cheapness is always evaluated relative to the **industry**, not the broad sector.

### Default cheapness signals
A stock passes Stage C if at least **2 of 5** signals are true, and no disqualifier is present.

| Signal | Default rule |
|---|---|
| Forward P/E vs industry median | <= 0.85x industry median |
| EV/EBITDA vs industry median | <= 0.85x industry median |
| EV/EBITDA vs own history | <= 35th percentile of 5Y history |
| P/B with acceptable ROE | P/B <= 0.8x industry median AND ROE >= threshold |
| FCF yield | >= industry median + 2 percentage points |

### Stable-fundamentals modifier
Cheapness only counts as positive if fundamentals are not deteriorating too severely:
- revenue growth > -10% YoY
- gross margin decline < 500 bps YoY
- operating margin decline < 700 bps YoY
- no catastrophic estimate revisions

If these conditions fail, the stock may move into `WATCHLIST_ONLY` or `TRAP_RISK`.

### Industry-framework variants

#### Cyclical semiconductors
Use:
- EV/EBIT
- EV/EBITDA
- EV/Revenue
- P/B
- normalized earnings context

#### Consumer staples / beverages
Use:
- forward P/E
- EV/EBITDA
- FCF yield
- operating margin stability

#### Insurance
Use:
- P/B
- justified P/B vs ROE
- forward P/E
- capital adequacy / leverage context

#### Interactive media / platform businesses
Use:
- forward P/E
- EV/EBIT
- FCF yield
- margin durability

---

## Stage D — quality filter

### Hard-exclusion quality flags
If any hard blocker is true, stock cannot become a `PUBLISHED_VALUE_CANDIDATE`:

- bankruptcy / restructuring risk
- going concern warning
- extreme dilution trend
- severe accounting restatement
- persistent negative cash conversion with no clear explanation
- governance red-flag status if supported by deterministic source

### Default quality signals
| Signal | Default rule |
|---|---|
| Liquidity | current ratio / available liquidity above threshold |
| Leverage | debt/EBITDA and debt/equity within framework bounds |
| Margins | no collapse beyond threshold |
| Dilution | share count growth below threshold |
| Cash conversion | OCF / net income above minimum |
| Returns | ROIC or ROE above minimum for framework |
| Capital allocation | no persistent destructive capital allocation signal |

### Quality score
```text
QualityScore =
  0.20 * leverage_score +
  0.20 * liquidity_score +
  0.20 * margin_stability_score +
  0.15 * dilution_score +
  0.15 * cash_conversion_score +
  0.10 * return_on_capital_score
```

### Trap-risk classification
If cheapness is present but quality is weak, classify as:
- `EXCLUDED_VALUE_TRAP_RISK`

### Watchlist classification
If cheapness is present but confidence is low or one key metric is missing, classify as:
- `WATCHLIST_ONLY`

---

## Stage E — deep work

Only a limited shortlist should reach this stage.

### Inputs
- deterministic screen outputs
- stock valuation artifact
- peer analysis artifact
- filing bundle
- industry context

### LLM tasks allowed
- summarize the business model
- explain why the market may be discounting the stock
- identify temporary vs structural concerns
- summarize risk factors from filings
- draft a candidate memo

### LLM tasks forbidden
- invent valuation metrics
- overwrite deterministic screen states
- promote a stock to `PUBLISHED_VALUE_CANDIDATE` on prose alone

### Candidate publication threshold
A stock becomes `PUBLISHED_VALUE_CANDIDATE` only if:
- Stage C passes
- Stage D passes
- stock valuation label is `CHEAP` or `FAIR with positive expected return`
- valuation confidence >= 0.65
- peer pack status is `VALIDATED`
- no hard trap flags
- deep work does not identify a thesis-breaking concern

---

## Result buckets shown on industry page

### `PUBLISHED_VALUE_CANDIDATE`
Strongest output. Safe to show as a potential value idea.

### `SCREEN_PASS`
Cheap and decent quality, but still missing stock-level validation or deep work.

### `NEEDS_DEEP_WORK`
Interesting name, but more analysis needed before surfacing as a candidate.

### `WATCHLIST_ONLY`
Worth monitoring; not ready to treat as a value idea.

### `EXCLUDED_VALUE_TRAP_RISK`
Statistically cheap, but filtered out due to structural or balance-sheet concerns.


---

# 06. Validation and Ralph loop

## Core question

> Can the system safely turn a sector-level interest signal into an industry-level shortlist of credible value candidates?

This feature adds a second funnel on top of the stock valuation system:
- sector -> industry -> screen -> candidate -> stock valuation

That means the Ralph loop must validate both:
1. **screening correctness**
2. **candidate publication safety**

---

## Ralph loop scope for this feature

The loop must answer:

1. Are industry memberships and medians correct?
2. Are deterministic screen outputs reproducible?
3. Are candidate states assigned correctly?
4. Are only eligible stocks published as value candidates?
5. Does the UI surface only what the gates allow?

---

## New validation groups

### Group T — Taxonomy integrity
| Rule ID | Check | Severity |
|---|---|---|
| `TAX-001` | sector resolves to valid GICS sector | High |
| `TAX-002` | industry resolves to valid GICS industry | High |
| `TAX-003` | every stock on industry page belongs to that industry or approved sub-industry mapping | High |
| `TAX-004` | sector-to-industry counts are stable for the same snapshot | Medium |
| `TAX-005` | no stock shown in multiple incompatible industries | High |

### Group U — Deterministic screen integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SCR-001` | same snapshot produces same universe after Stage A | High |
| `SCR-002` | same snapshot produces same cheapness pass/fail results | High |
| `SCR-003` | same snapshot produces same quality pass/fail results | High |
| `SCR-004` | medians and percentiles are reproducible and traceable | High |
| `SCR-005` | framework-specific metric set matches industry framework | High |

### Group V — Candidate publication integrity
| Rule ID | Check | Severity |
|---|---|---|
| `CAND-001` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` without valid stock valuation artifact | High |
| `CAND-002` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` without peer analysis artifact | High |
| `CAND-003` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` when trap-risk blocker is active | High |
| `CAND-004` | `SCREEN_PASS` and `NEEDS_DEEP_WORK` labels are assigned deterministically | High |
| `CAND-005` | if valuation confidence < threshold, candidate is demoted from published state | High |

### Group W — Surface and explanation integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SURF-IND-001` | UI only shows allowed candidate fields for each state | High |
| `SURF-IND-002` | no "cheap" claim appears for excluded trap-risk rows | High |
| `SURF-IND-003` | all surfaced numeric claims match facts or traces | High |
| `SURF-IND-004` | explanation text cannot override deterministic state | High |

### Group X — Benchmark packs
This feature requires benchmark packs, not just generic rules.

#### Benchmark pack: MU
Expected:
- sector = Information Technology
- industry = Semiconductors
- memory-specific framework used
- direct peers / peer pack reflect memory context
- MU should **not** appear as a published value candidate when current valuation label is expensive / confidence low

#### Benchmark pack: KO
Expected:
- sector = Consumer Staples
- industry = Beverages
- beverage framework used
- peers should include PEP and KDP in primary or secondary roles
- KO should not be compared primarily to unrelated staples categories

#### Benchmark pack: ALL
Expected:
- sector = Financials
- industry = Insurance
- insurance framework uses P/B and ROE-style logic, not EV/EBITDA as primary
- peers should include PGR / TRV / HIG / CB / CINF-type analogs

#### Benchmark pack: META
Expected:
- sector = Communication Services
- industry = Interactive Media & Services
- platform/media framework used
- candidate logic should not compare META primarily to casinos, insurers, or unrelated software names

---

## Negative controls

At least these must be present:

1. wrong GICS mapping
2. stale market-data snapshot
3. empty industry universe
4. industry median built from mixed frameworks
5. stock marked candidate without valuation artifact
6. trap-risk stock incorrectly surfaced as candidate
7. peer pack missing but candidate published
8. surface leak: UI text says "undervalued" for excluded stock

All must fail safely.

---

## Artifact requirements per iteration

Each iteration must emit:
- `run-manifest.json`
- `taxonomy-manifest.json`
- `industry-universe.json`
- `screen-results.json`
- `candidate-publication-audit.json`
- `industry-median-traces.json`
- `surface-scan.json`
- `evaluation-scorecard.md`
- `iteration-changes.md`
- `generated-report.md` or relevant rendered page artifacts

---

## Gates

### Screening gate
Determines if industry screen can publish.
Fails if:
- taxonomy fails
- market data stale
- medians not traceable
- framework not resolved

### Candidate gate
Determines if a stock can appear as a published value candidate.
Fails if:
- no stock valuation artifact
- no peer artifact
- confidence too low
- trap blocker active
- explanation contradicts deterministic result

---

## Success threshold for this milestone

The feature is "good enough to rely on" when:
- deterministic screen reproducibility is stable
- benchmark packs pass
- no candidate publication leaks occur
- value-trap exclusions are working
- surfaced candidate lists are short, explainable, and grounded

It does **not** need perfect stock-picking accuracy.
It does need **safe candidate publication**.


---

# 07. UI / UX specification

## Design goals
- preserve the app's existing dark, card-based style
- keep sectors as the top-level mental model
- make industries feel like the "bridge" into stock screening
- clearly separate deterministic screen output from deeper valuation output

---

## Screen 1 — Sector Overview with industry summary strips

### Additions
Each sector card gains:
- number of industries
- top 3 industries by weight / relevance
- "value hunting ground" indicator
- candidate count badge

### Interaction
Clicking a sector card still opens the sector page.
New quick action:
- `Industries`

---

## Screen 2 — Sector Detail / Industries tab

### Header
Keep current sector header with stance, confidence, update time.

### New industries section
For each industry card show:
- industry name
- share of sector
- valuation status (`cheap / fair / expensive`)
- revision trend
- quality median
- candidate count
- trap-risk count
- button: `Open Industry`

### CTA
Primary CTA:
- `Run value screen for this industry`

---

## Screen 3 — Industry Detail page

### Hero
- industry name
- sector breadcrumb
- industry status
- update time
- member count
- sub-industry count
- concentration note

### Tabs
- Overview
- Value Screen
- Candidates
- Compare
- Evidence

### Overview tab
Show:
- what the industry does
- top holdings / leaders
- median valuation vs history
- margin and growth medians
- key macro drivers
- cycle state

### Value Screen tab
Show the deterministic funnel:
- Stage A passed universe size
- Stage B hunting-ground score
- Stage C cheapness passes
- Stage D quality passes
- rows grouped by result state

### Candidates tab
Show only:
- published candidates
- screen passes
- needs-deep-work list
with clear labels

### Compare tab
Show:
- medians
- percentiles
- peer-pack context
- charts

---

## Screen 4 — Stock page with industry context

Add an industry context panel:
- sector
- industry
- industry medians
- stock vs industry percentile
- why it surfaced from the industry page
- candidate state
- link to full valuation report

---

## Content rules

### Allowed labels
- Attractive hunting ground
- Mixed
- Caution
- Screen pass
- Needs deep work
- Watchlist only
- Excluded: value trap risk
- Published value candidate

### Forbidden labels without stock-level valuation support
- Best value stock
- Buy now
- Strong buy
- Undervalued by X%
- Hidden gem

### Tone
Use:
- "screened cheap relative to industry"
- "requires deep work"
- "published candidate based on validated valuation artifact"

Avoid:
- certainty language when confidence is moderate or low

---

## Empty and edge states

### No industries available
- show taxonomy/data issue
- no screening CTA

### No candidates found
- show why:
  - industry expensive
  - no cheap names with acceptable quality
  - insufficient data

### Too many results
- default to top 20 ranked by score
- expose filters and sorting


---

# 08. Implementation plan

## Phase 1 — Taxonomy + industry pages
Build:
- GICS industry mappings
- sector -> industries tab
- industry detail route
- industry snapshot API

Deliverable:
- sector pages now show industries with industry cards

## Phase 2 — Deterministic industry screening
Build:
- Stage A-D screen engine
- industry medians / percentiles engine
- result-state assignment
- screening artifacts and traces

Deliverable:
- user can run a value screen from the industry page

## Phase 3 — Candidate publication integration
Build:
- link stock valuation artifacts into screen results
- candidate gate
- candidate state derivation
- candidate list rendering

Deliverable:
- published candidates appear only when fully supported

## Phase 4 — Ralph-loop validation
Build:
- benchmark packs (MU, KO, ALL, META)
- negative controls
- taxonomy manifest
- candidate-publication audit
- surface scanner for candidate leaks

Deliverable:
- full iteration scorecard for this feature

## Phase 5 — UI polish and compare tools
Build:
- compare tab
- candidate sort / filter UX
- stock-page industry context panel

Deliverable:
- polished user flow from sector to industry to stock

## Recommended implementation order
1. taxonomy and industry routing
2. deterministic screen engine
3. validation + negative controls
4. candidate gate
5. UI polish
6. LLM explanations

## What not to do first
Do not start with:
- LLM narratives
- broad candidate explanations
- fancy ranking heuristics
- buy/sell language

The hard part is building the deterministic funnel and the candidate gate.


---

# 09. Ralph-loop prompt

You are executing the RALPH loop for the **Industry Extension + Value Candidate Screening** feature.

## Core question

> Can the system safely turn a sector page into an industry-level value-screening experience that produces credible candidate states without leaking unsupported value claims?

## Read first

1. `02-prd.md`
2. `04-data-model-and-pipeline.md`
3. `05-screening-and-analysis-framework.md`
4. `06-validation-and-ralph-loop.md`
5. the latest iteration report in `ralph-loop-reports/industry-screening/`

## Each iteration

### 1. Audit
Read the latest scorecard.
Pick the highest-priority failing rule in this order:
- taxonomy integrity
- deterministic screen integrity
- candidate publication integrity
- surface leakage
- benchmark pack failures

### 2. Localize
Trace the failure to the exact source:
- taxonomy mapping
- median computation
- screen thresholds
- candidate gate
- UI renderer
- artifact writer

### 3. Patch
Apply **one focused patch**.
If the failure is deterministic, do not patch prompts.

### 4. Validate
Run:
- benchmark packs
- negative controls
- same-snapshot reproducibility tests
- candidate-publication audit
- rendered surface checks

### 5. Regress
Verify no benchmark regression for:
- MU
- KO
- ALL
- META

### 6. Emit artifacts
Must emit:
- run-manifest.json
- taxonomy-manifest.json
- industry-universe.json
- screen-results.json
- candidate-publication-audit.json
- industry-median-traces.json
- generated-report.md or rendered page artifact
- iteration-changes.md
- evaluation-scorecard.md

## Rules

- Do not publish a stock as `PUBLISHED_VALUE_CANDIDATE` without stock valuation + peer artifacts.
- Do not let explanation text override deterministic state.
- Do not mix industry frameworks.
- Do not compare stocks across obviously incompatible industries.
- Prefer demotion to `NEEDS_DEEP_WORK` over unsafe publication.

## Success condition

The iteration succeeds when:
- benchmark packs pass
- negative controls pass
- no candidate publication leaks exist
- deterministic screen results are reproducible
- rendered surfaces show only allowed fields and labels


---

# 10. Coding assistant prompt

You are implementing the **Industry Extension + Value Candidate Screening** feature for a filing-first stock analysis app.

## Mission

Extend the current sector pages so the user can navigate:
`Sector -> Industry -> Value Screen -> Candidate -> Stock Valuation`

Implement the deterministic screening funnel, candidate gate, benchmark validation, and UI changes described in the attached spec.

## Non-negotiable rules

1. GICS sector is the navigation layer; industry is the screening/comparison layer.
2. Deterministic screening happens before any LLM narrative.
3. A screened stock is **not** automatically a published value candidate.
4. A stock cannot be `PUBLISHED_VALUE_CANDIDATE` without:
   - valid stock valuation artifact
   - valid peer analysis artifact
   - sufficient confidence
   - no trap-risk blocker
5. Explanatory text may not override deterministic state.

## Implement first

### A. Taxonomy + industry routing
- Add sector -> industries tab
- Resolve GICS industry / sub-industry mappings
- Build industry snapshot objects

### B. Deterministic screen engine
Implement Stage A-D:
- universe reduction
- sector/industry triage
- cheapness screens
- quality filter

### C. Result states
Implement:
- SCREEN_PASS
- NEEDS_DEEP_WORK
- PUBLISHED_VALUE_CANDIDATE
- WATCHLIST_ONLY
- EXCLUDED_VALUE_TRAP_RISK

### D. Candidate gate
A stock must not be published as a value candidate unless:
- stock valuation exists
- peer artifact exists
- valuation confidence >= threshold
- no hard trap blocker
- candidate publication audit passes

### E. Validation + Ralph loop
Implement validation groups:
- TAX
- SCR
- CAND
- SURF
- benchmark packs

### F. UI
Add:
- Industries tab on sector page
- Industry detail page
- Value Screen tab
- Candidates tab
- Compare tab
- Stock-page industry context panel

## Benchmark packs to support

### MU
- sector: Information Technology
- industry: Semiconductors
- use cyclical semiconductor / memory framework
- should not be published as a value candidate when expensive / low confidence

### KO
- sector: Consumer Staples
- industry: Beverages
- primary or secondary peers should include PEP and KDP
- beverage framework only

### ALL
- sector: Financials
- industry: Insurance
- primary framework should use P/B and ROE-style logic
- no EV/EBITDA-primary insurance comparison

### META
- sector: Communication Services
- industry: Interactive Media & Services
- must not receive unrelated peers from casinos / insurers / unrelated software

## Artifacts to emit each run

- run-manifest.json
- taxonomy-manifest.json
- industry-universe.json
- screen-results.json
- candidate-publication-audit.json
- industry-median-traces.json
- evaluation-scorecard.md
- iteration-changes.md
- rendered report/page artifact

## What not to do

- Do not start with LLM-written candidate ideas.
- Do not label stocks as undervalued from industry screens alone.
- Do not use sector-level medians as stock-comparison substitutes.
- Do not compare across incompatible industries.
- Do not surface trap-risk stocks as published candidates.

## Definition of done

This feature is done for the next milestone when:
- industries appear correctly on sector pages
- an industry screen can run deterministically
- candidate states are reproducible
- benchmark packs pass
- no unsupported candidate publication leaks into the UI


---

# 11. Source references

## Core references

1. MSCI GICS methodology / hierarchy  
   https://www.msci.com/indexes/documents/methodology/0_MSCI_Global_Industry_Classification_Standard_GICS_Methodology_20240801.pdf

2. MSCI GICS overview / hierarchy  
   https://www.msci.com/indexes/index-resources/gics

3. S&P Dow Jones GICS overview  
   https://www.spglobal.com/spdji/en/landing/topic/gics/

4. CFA Institute — Industry and Competitive Analysis  
   https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/industry-and-competitive-analysis

5. SEC EDGAR APIs  
   https://www.sec.gov/search-filings/edgar-application-programming-interfaces

## Notes

- GICS provides the sector -> industry group -> industry -> sub-industry hierarchy used in this feature.
- Industry context matters because valuation comparability is usually stronger at the industry or sub-industry level than at the broad sector level.
- SEC EDGAR remains the canonical filing source for stock-level deterministic artifacts in the deeper valuation stage.
