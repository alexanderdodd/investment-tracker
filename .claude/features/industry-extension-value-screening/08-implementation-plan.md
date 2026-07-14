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
