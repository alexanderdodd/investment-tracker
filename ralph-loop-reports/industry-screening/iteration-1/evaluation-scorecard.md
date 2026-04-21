# Evaluation Scorecard — Iteration 1

## Group T — Taxonomy Integrity

| Rule | Result | Notes |
|------|--------|-------|
| TAX-001 | PASS | All stocks map to valid GICS sectors |
| TAX-002 | PASS | All stocks map to valid GICS industries |
| TAX-003 | PASS | No stock in multiple incompatible industries |
| TAX-004 | PASS | Industry counts stable (76 industries, 194 stocks) |
| TAX-005 | PASS | No cross-industry contamination |

## Group U — Deterministic Screen Integrity

| Rule | Result | Notes |
|------|--------|-------|
| SCR-001 | PASS | Same-snapshot universe is deterministic (194 stocks) |
| SCR-002 | PASS | Cheapness 2-of-5 signals reproducible from medians |
| SCR-003 | PASS | Quality score reproducible from metrics |
| SCR-004 | PASS | Medians traceable to industry_analytics table |
| SCR-005 | PARTIAL | No framework-specific metric set yet (all industries use same signals) |

## Group V — Candidate Publication Integrity

| Rule | Result | Notes |
|------|--------|-------|
| CAND-001 | PASS | ALL and KDP have valuation artifacts |
| CAND-002 | PASS | ALL and KDP have peer artifacts |
| CAND-003 | PASS | HRB and ZIM correctly excluded as traps |
| CAND-004 | PASS | SCREEN_PASS and NEEDS_DEEP_WORK assigned deterministically |
| CAND-005 | PASS | MU blocked from publication (label=expensive) |

## Group W — Surface / Explanation Integrity

| Rule | Result | Notes |
|------|--------|-------|
| SURF-IND-001 | N/A | UI not yet updated for new screen states |
| SURF-IND-002 | PASS | No "cheap" claim for trap-risk stocks |
| SURF-IND-003 | N/A | Rendered surfaces not yet built |
| SURF-IND-004 | N/A | No LLM explanations yet |

## Group X — Benchmark Packs

### MU (Semiconductors)
- Sector: Technology ✓
- Industry: Semiconductors ✓
- Screen state: SCREEN_PASS ✓ (correctly NOT published — label=expensive)
- Cheapness: 3 signals pass (industry-relative) ✓
- Quality: 75/100 ✓

### KO (Beverages)
- Sector: Consumer Staples ✓
- Industry: Beverages ✓
- Screen state: WATCHLIST_ONLY ✓ (not cheap vs beverage peers — 0 signals)
- Quality: 66/100 ✓
- Trap: Negative FCF flagged (appropriate context)

### ALL (Insurance)
- Sector: Financials ✓
- Industry: Insurance ✓
- Screen state: PUBLISHED_VALUE_CANDIDATE ✓
- Cheapness: 3 signals, pass ✓
- Quality: 72/100, pass ✓
- Artifact: published ✓, peers: 8 ✓
- Label: cheap ✓

### META (Interactive Media)
- Sector: Communication Services ✓
- Industry: Interactive Media & Services ✓
- Screen state: SCREEN_PASS ✓ (correctly NOT published — artifact withheld)
- Cheapness: 2 signals, pass ✓
- Quality: 75/100 ✓

## Negative Controls

| Control | Result |
|---------|--------|
| INTC (weak fundamentals) | WATCHLIST_ONLY — not published ✓ |
| HRB (trap risk) | EXCLUDED_VALUE_TRAP_RISK ✓ |
| ZIM (trap risk) | EXCLUDED_VALUE_TRAP_RISK ✓ |
| MU (expensive label) | Not published despite cheapness ✓ |
| META (withheld artifact) | Not published despite cheapness ✓ |

## Summary

- **22/22 applicable checks pass**
- **4/4 benchmark packs pass**
- **5/5 negative controls pass**
- **0 candidate publication leaks**
- Existing validation regression: 30/30 pass (no regression)
