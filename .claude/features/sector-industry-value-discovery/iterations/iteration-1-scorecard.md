# Iteration 1 — Evaluation Scorecard

## Phase 1 scope: Taxonomy and Routes

### TAX — Taxonomy integrity

| Rule | Check | Status | Notes |
|------|-------|--------|-------|
| TAX-001 | Every surfaced stock has sector + industry | PASS | All 40 benchmark stocks have sectorId + industryId in stock_classification |
| TAX-002 | Every surfaced industry belongs to the shown sector | PASS | Industries filtered by sectorId in API; verified Tech has 6 industries |
| TAX-003 | Industry counts are deterministic | PASS | Counts derived from stock_classification joins, not LLM |
| TAX-004 | Industry labels come from approved taxonomy source | PASS | All labels from gics-taxonomy.ts constants, official GICS codes |
| TAX-005 | No LLM-generated taxonomy fields | PASS | Taxonomy is hardcoded TypeScript; seed script is deterministic |

### SURF-IND — UI surface integrity (Phase 1 subset)

| Rule | Check | Status | Notes |
|------|-------|--------|-------|
| SURF-IND-001 | No candidate shown as validated if valuation artifact withheld | N/A | No candidates surfaced yet (Phase 3) |
| SURF-IND-002 | No "cheap" badge shown without valuation label | N/A | No valuation badges shown yet |
| SURF-IND-003 | Industry state and candidate counts match backend payload | PASS | UI renders exactly what API returns |
| SURF-IND-004 | Sector card summaries match industry table aggregates | N/A | No sector card summaries yet |
| SURF-IND-005 | Candidate reasons rendered from allowlisted fields only | N/A | No candidates yet |

### IND — Industry analytics integrity (Phase 2 — not yet applicable)

| Rule | Check | Status | Notes |
|------|-------|--------|-------|
| IND-001 through IND-005 | Industry analytics | PENDING | Analytics generation not built yet |

### CAND — Candidate integrity (Phase 3 — not yet applicable)

| Rule | Check | Status | Notes |
|------|-------|--------|-------|
| CAND-001 through CAND-006 | Candidate generation | PENDING | Not started |

### PEER-IND — Peer pack integrity (Phase 4 — not yet applicable)

| Rule | Check | Status | Notes |
|------|-------|--------|-------|
| PEER-IND-001 through PEER-IND-005 | Peer packs | PENDING | Not started |

## Summary

- **5/5 TAX rules pass** — taxonomy is deterministic and complete
- **1/5 SURF-IND rules pass** (4 not yet applicable)
- **IND, CAND, PEER-IND** — pending future phases
- **No regressions** — existing sector/stock pages unaffected
- **Build compiles clean** — `tsc --noEmit` passes with zero errors
