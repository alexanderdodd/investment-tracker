# RALPH Loop Iteration 4 — Changes and Comparison

**Date:** 2026-04-12
**Ticker:** MU (Micron Technology, Inc.)
**Prior iteration:** Iteration 3 (30/33, vNext spec not yet applied)
**Spec version:** vNext

---

## Patch Summary

This iteration applies the vNext spec's stricter tolerances and infrastructure requirements:

1. **Exact share count**: Swapped XBRL tag priority to prefer `dei:EntityCommonStockSharesOutstanding` (filing cover page, exact integer: 1,127,734,051) over `us-gaap:CommonStockSharesOutstanding` (balance sheet, rounded: 1,128,000,000). Tightened test tolerance from 1% to exact integer match.

2. **5Y average tests**: Added HIST-004a and HIST-004b to the golden fixture test with 0.01pp tolerance per vNext spec.

3. **Broken fixture file**: Created `golden-mu-broken.json` describing the negative-control test. Created `ralph-mu-broken-test.ts` as the dedicated test runner path the vNext rl-prompt expects.

## Files Modified

### `src/lib/sec-edgar/xbrl-mapper.ts`
- Swapped `SHARES_OUTSTANDING_TAGS` priority: `EntityCommonStockSharesOutstanding` (DEI cover page, exact) now comes before `CommonStockSharesOutstanding` (balance sheet, rounded)

### `src/lib/valuation/__tests__/ralph-mu-test.ts`
- SHARES-001: Changed from 1% tolerance to exact integer match
- Added HIST-004a: 5Y avg gross margin test (±0.01pp)
- Added HIST-004b: 5Y avg operating margin test (±0.01pp)
- Test now validates 18 rules (was 16)

### `src/lib/valuation/__tests__/fixtures/golden-mu-broken.json` (new)
- Negative-control fixture descriptor

### `src/lib/valuation/__tests__/ralph-mu-broken-test.ts` (new)
- Dedicated broken fixture test runner at the path vNext rl-prompt expects

## Comparison vs Previous Iteration

| Metric | Iteration 3 | Iteration 4 | Change |
|--------|-------------|-------------|--------|
| Golden fixture rules | 16/16 | 18/18 | +2 new rules (HIST-004a/b) |
| Share count | 1,128,000,000 (1% tol) | 1,127,734,051 (exact) | Fixed |
| Share source | us-gaap (rounded) | dei cover page (exact) | Fixed |
| 5Y avg GM tested | No | Yes (27.17% ±0.01pp) | New |
| 5Y avg OM tested | No | Yes (9.72% ±0.01pp) | New |
| Broken fixture file | No | Yes | New |
| Broken test runner path | ralph-broken-fixture-test.ts | ralph-mu-broken-test.ts | Aligned to vNext |

## Net Result

- **0 regressions**
- **2 new test rules added** (HIST-004a/b)
- **Strict share count tolerance** now enforced
- **Broken fixture infrastructure** aligned to vNext spec paths
