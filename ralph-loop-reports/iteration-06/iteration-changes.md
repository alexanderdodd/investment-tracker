# RALPH Loop Iteration 6 — Changes

**Date:** 2026-04-12
**Ticker:** MU (Micron Technology, Inc.)

## Summary

This iteration addressed three remaining gaps from iteration 5:

1. **MU-TTM-002** (NOT TESTED → PASS): Added TTM gross profit validation to the golden fixture test. The field was already in the fixture (`ttm.grossProfit: 33963`) and canonical facts (`ttmGrossProfit`), but the test was missing the check. Now 19/19 rules pass.

2. **TRACE-003** (PARTIAL → PASS): Built a render-time report surface scanner (`src/lib/valuation/surface-scanner.ts`) that extracts all numeric claims (dollar amounts, percentages, ratios) from the LLM-generated narrative and maps each to a known canonical fact, derived metric, or formula trace. Integrated into the pipeline after narrative generation.

3. **SURFACE-006** (PARTIAL → PASS): The same surface scanner also enforces that no numeric claim appears if absent from the surface allowlist. All 42 numeric claims in the latest MU report mapped successfully to known values.

## Files Changed

### New Files
- `src/lib/valuation/surface-scanner.ts` — Render-time report surface scanner
  - `extractNumericClaims()` — Regex extraction of dollar, percent, ratio claims
  - `buildKnownValues()` — Registry of all known values from facts/model/traces/valuation
  - `matchClaim()` — Exact + fuzzy matching (2.5% tolerance for LLM rounding)
  - `scanReportSurface()` — Main entry point, returns PASS/FAIL with match details

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
| Surface scan | PASS (42 claims, 0 unmatched) |
| Gate decision | PUBLISH_FACTS_ONLY |
| Valuation verdict | Withheld (cycle peak) |
