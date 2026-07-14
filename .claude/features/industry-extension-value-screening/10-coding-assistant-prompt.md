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
