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
