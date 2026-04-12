# RALPH Loop Iteration 6 — Changes

**Date:** 2026-04-12
**Ticker:** MU (Micron Technology, Inc.)

## Summary

This iteration addressed four remaining gaps from iteration 5:

1. **MU-TTM-002** (NOT TESTED → PASS): Added TTM gross profit validation to the golden fixture test. The field was already in the fixture (`ttm.grossProfit: 33963`) and canonical facts (`ttmGrossProfit`), but the test was missing the check. Now 19/19 rules pass.

2. **TRACE-003** (PARTIAL → PASS): Built a render-time report surface scanner (`src/lib/valuation/surface-scanner.ts`) that extracts all numeric claims (dollar amounts, percentages, ratios) from the LLM-generated narrative and maps each to a known canonical fact, derived metric, or formula trace. Integrated into the pipeline after narrative generation.

3. **SURFACE-005** (NOT TESTED → PASS): Added period-label consistency checking to the surface scanner. Detects when a numeric claim's narrative context (e.g., "quarterly EPS of $X") contradicts the field's actual period scope (e.g., TTM). Uses a narrow 20-char window before the claim to avoid false positives from multi-period comparison sentences.

4. **SURFACE-006** (PARTIAL → PASS): The surface scanner enforces that no numeric claim appears if absent from the surface allowlist. Qualitative/approximate claims (Class D, marked with ~, "roughly", etc.) are allowed per gate spec.

## Files Changed

### New Files
- `src/lib/valuation/surface-scanner.ts` — Render-time report surface scanner
  - `extractNumericClaims()` — Regex extraction of dollar, percent, ratio claims
  - `buildKnownValues()` — Registry of all known values from facts/model/traces/valuation
  - `matchClaim()` — Exact + fuzzy matching (2.5% tolerance for LLM rounding)
  - `isQualitativeClaim()` — Detects Class D approximate/editorial claims
  - `detectNarrativePeriod()` — Period-label detection with narrow window (SURFACE-005)
  - `checkPeriodLabels()` — Cross-references narrative period labels with field scopes
  - `scanReportSurface()` — Main entry point, returns PASS/FAIL with match details + period violations

### Modified Files
- `src/lib/valuation/__tests__/ralph-mu-test.ts` — Added TTM-002 gross profit check (line 86)
- `src/lib/generate-stock-valuation.ts` — Imported and integrated surface scanner after narrative generation

## Test Results

| Test | Result |
|------|--------|
| Type check (`tsc --noEmit`) | PASS |
| Golden fixture (ralph-mu-test.ts) | 19/19 PASS |
| Broken fixture (ralph-mu-broken-test.ts) | 10/10 PASS |
| Full pipeline (value-stock.ts --ticker MU) | PASS |
| Surface scan — claim matching | PASS (45 claims, 0 unmatched) |
| Surface scan — period labels | PASS (0 violations) |
| Gate decision | PUBLISH_FACTS_ONLY |
| Valuation verdict | Withheld (cycle peak) |

## All Acceptance Criteria: 31/31 PASS
