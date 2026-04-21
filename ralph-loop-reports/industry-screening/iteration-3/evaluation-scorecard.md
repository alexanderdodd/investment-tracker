# Evaluation Scorecard — Iteration 3

## Focus: SURF-IND — Surface Integrity (UI wiring)

### Changes

1. **Industry API** (`/api/industries/[slug]`): Now returns `screenResults` array with 5-state model alongside legacy `candidates`
2. **Industry detail page**: New "Value Screen Results" section shows non-WATCHLIST stocks with state badges, cheapness/quality signals, artifact status, and composite scores
3. **Sector Industries tab** (`/api/sectors/[sector]/industries`): Returns `screenCounts` per industry. Tab shows color-coded screen counts (P=published, S=screen pass, D=deep work, T=trap risk)
4. **Schema fix**: JSONB default values now match TypeScript types

### Group W — Surface / Explanation Integrity

| Rule | Result | Notes |
|------|--------|-------|
| SURF-IND-001 | PASS | UI only shows allowed fields per screen state (no valuation label for traps) |
| SURF-IND-002 | PASS | No "cheap" badge shown for EXCLUDED_VALUE_TRAP_RISK rows — they show trap flags instead |
| SURF-IND-003 | PARTIAL | Numeric claims come from screen results; industry median traces not yet surfaced |
| SURF-IND-004 | N/A | No LLM explanations yet |

### Benchmark Verification

| Ticker | Screen State | UI Behavior | Correct? |
|--------|-------------|-------------|----------|
| ALL | PUBLISHED_VALUE_CANDIDATE | Shows green "Published Candidate" badge + "Cheap" label | ✓ |
| MU | SCREEN_PASS | Shows blue "Screen Pass" badge + "Expensive" label | ✓ |
| KO | WATCHLIST_ONLY | Hidden from non-WATCHLIST results | ✓ |
| META | SCREEN_PASS | Shows blue "Screen Pass" badge + artifact withheld | ✓ |
| HRB | EXCLUDED_VALUE_TRAP_RISK | Shows red "Trap Risk" badge + trap flag text | ✓ |
| ZIM | EXCLUDED_VALUE_TRAP_RISK | Shows red "Trap Risk" badge + trap flag text | ✓ |

### Build / Regression

- Build: clean (0 TypeScript errors)
- Existing validation: 30/30 pass
- No regression

## Summary

- SURF-IND-001: PASS
- SURF-IND-002: PASS
- SURF-IND-003: PARTIAL (median traces not yet on surface)
- 4/4 benchmark packs pass
- Build clean, 30/30 regression pass
