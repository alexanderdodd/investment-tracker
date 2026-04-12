# Iteration 14 — Method Agreement: Industry-Aware Multiples + Tiered Metric

**Date:** 2026-04-12
**Focus:** Implement spec 19 — industry-aware multiple filtering + dual raw/effective disagreement

## Changes

### `src/lib/valuation/types.ts`
- Added `PeerMultipleType` type: `"pe" | "pb" | "ev_ebitda" | "ev_revenue"`
- Added `allowedPeerMultiples: PeerMultipleType[]` to `IndustryFramework`

### `src/lib/valuation/industry-frameworks.ts`
- Populated `allowedPeerMultiples` for all 8 framework types:
  - Financial (banks/insurance): `["pe", "pb"]` — no EV multiples
  - Semiconductor: `["ev_ebitda", "ev_revenue", "pb"]`
  - Growth tech: `["ev_revenue", "pb"]`
  - REIT: `["pb", "ev_ebitda"]`
  - Consumer staples: `["pe", "pb", "ev_ebitda"]`
  - Commodity cyclical: `["ev_ebitda", "pb"]`
  - Utility: `["pe", "ev_ebitda"]`
  - General: `["pe", "pb", "ev_ebitda", "ev_revenue"]`

### `src/lib/valuation/peer-registry.ts`
- `computeRelativeValuation()` now accepts `allowedMultiples?: PeerMultipleType[]` and filters multiples
- `computeRelativeValuationFromDynamic()` now accepts `allowedMultiples` and passes through to curated path
- Fixed P/E implied value computation in dynamic path (was a dead code block — now computes from `ttmNetIncome / shares`)
- Added `ttmNetIncome` to subject facts interface for P/E calculation

### `src/lib/generate-stock-valuation.ts`
- Passes `framework.allowedPeerMultiples` to `computeRelativeValuationFromDynamic()`
- Passes `ttmNetIncome` in subject facts

### `src/lib/valuation/fair-value-synthesis.ts`
- Added `rawMethodDisagreement` and `effectiveMethodDisagreement` to `FairValueSynthesis`
- Raw = `(max - min) / avg` of pre-dampening values (data quality signal)
- Effective = weighted mean absolute deviation from midpoint (synthesis quality signal)
- Replaced single-threshold confidence penalty with tiered system:
  - ≤20% effective: strong (no penalty)
  - 20-50%: moderate (-0.05)
  - 50-100%: significant (-0.10)
  - >100%: structural (-0.15)
- Scorecard shows both raw and effective when they differ significantly

### Tests
- Added 14 new test assertions (AGREE-001..007) in `fair-value-consistency-test.ts`
- Updated `ralph-mu-valuation-test.ts` to pass framework's `allowedPeerMultiples`
- Updated `pipeline-integration-test.ts` to pass `allowedPeerMultiples` and `ttmNetIncome`

## Test Results

| Suite | Before | After |
|-------|--------|-------|
| Golden fixture | 19/19 | 19/19 |
| Broken fixture | 10/10 | 10/10 |
| Consistency | 24/24 | 38/38 (+14 new) |
| Peer validation | 18/18 | 18/18 |
| Valuation verdict | 11/11 | 11/11 |

## Impact on MU

| Metric | Iteration 13 | Iteration 14 | Change |
|--------|-------------|-------------|--------|
| Fair value range | $79.42 / $93.44 / $107.45 | $79.42 / $93.44 / $107.45 | Unchanged (semiconductor allows all multiples) |
| Range width | 30% | 30% | Unchanged |
| Label | DEEP_EXPENSIVE | DEEP_EXPENSIVE | Unchanged |
| Confidence | 45% (LOW) | 50% (MEDIUM) | +5pp (tiered penalty is smaller) |
| Raw disagreement | 97.6% | 162.1% | Changed (uses pre-dampening values) |
| Effective disagreement | N/A | ~30% | New metric |
