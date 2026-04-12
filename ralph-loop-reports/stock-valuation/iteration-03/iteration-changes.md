# RALPH Loop Iteration 3 — Changes and Comparison

**Date:** 2026-04-11
**Ticker:** MU (Micron Technology, Inc.)
**Prior iteration:** Iteration 2 (29/33 passing)

---

## Patch Summary

Fixed **HIST-004**: The pipeline's 5-year averages were wrong (GM 55.5% vs golden 27.18%, OM 36.4% vs 9.70%) because `buildAnnualHistory()` used the SEC EDGAR `fy` field as the fiscal year identifier. For non-calendar fiscal years like Micron (ending August), SEC assigns the same `fy` number to different physical fiscal years, causing:
- Three entries all labeled FY2025 (actually FY2023, FY2024, FY2025)
- Gross profit from real FY2025 ($14.9B) was paired with FY2024 revenue ($25.1B), giving 59.2% margin instead of 22.4%

## Root Cause

`buildAnnualHistory()` in `src/lib/sec-edgar/ttm.ts` deduplicated by calendar end-year but returned the SEC `fy` number. When `canonical-facts.ts` joined revenue, gross profit, and operating income histories by `fiscalYear`, the wrong entries were paired.

## Files Modified

### `src/lib/sec-edgar/ttm.ts` — `buildAnnualHistory()`
- Changed from using SEC `fy` field to using `parseInt(a.end.substring(0, 4))` (calendar year of period-end) as the fiscal year identifier
- This ensures each physical fiscal year gets a unique, stable identifier regardless of how SEC EDGAR assigns `fy` numbers
- The join in `canonical-facts.ts` now correctly pairs metrics from the same physical year

## Comparison vs Previous Iteration

| Metric | Iteration 2 | Iteration 3 | Change |
|--------|-------------|-------------|--------|
| Golden fixture | 16/16 PASS | 16/16 PASS | No regression |
| Gate status | PUBLISH_FACTS_ONLY | PUBLISH_FACTS_ONLY | Same (correct) |
| HIST-004 (5Y averages) | FAIL (GM 55.5%, OM 36.4%) | PASS (GM 27.2%, OM 9.7%) | **Fixed** |
| Annual history | 3 unique years, wrong fy labels | 5 unique years (FY2021-FY2025) | Fixed |
| Valuation gate failures | 1 (VAL-004 only) | 3 (VAL-005 x2 + VAL-004) | Improved — cycle-margin checks now fire correctly |
| Leak prevention | No leaks | No leaks | Same |

### Rules that flipped

| Rule | Iteration 2 | Iteration 3 |
|------|-------------|-------------|
| HIST-004 | FAIL | PASS |

### New gate failures detected (correct behavior)

With correct 5Y averages, the cycle-margin gate checks now fire:
- VAL-005: GM 74.4% is 2.7x the 5Y avg 27.2% — too assumption-sensitive
- VAL-005: OM 67.6% is 7.0x the 5Y avg 9.7% — extreme cycle divergence

These strengthen the withholding decision — previously only VAL-004 blocked.

## Net Result

- **0 regressions**
- **1 rule fixed** (HIST-004)
- **2 additional gate checks now firing** (VAL-005 x2 — correct behavior)
- Scorecard: **30/33** (was 29/33)
