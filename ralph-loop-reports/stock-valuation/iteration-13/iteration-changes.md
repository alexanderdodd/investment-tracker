# Iteration 13 — Range Tightening

**Date:** 2026-04-12
**Focus:** Implement spec 18 — midpoint-anchored range with outlier dampening

## Changes

### `src/lib/valuation/fair-value-synthesis.ts`
- **Layer 1: Outlier dampening** — added preliminary midpoint computation and exponential weight dampening for methods deviating >50% from consensus. Halves weight per 50% deviation beyond threshold.
- **Layer 2: Midpoint-anchored range** — replaced outer-envelope min/max construction with weighted standard deviation (sigma) around the dampened midpoint. DCF sensitivity spread capped at 30% of midpoint.
- **Layer 3: Hard cap** — range width clamped to 30% of midpoint maximum. Sets `rangeClamped = true` when triggered.
- **New fields on FairValueSynthesis**: `rangeClamped`, `rawRangeWidth`, `preDampeningMethods`
- **Confidence scorecard**: removed the "range width > 30%" penalty (now impossible due to hard cap), kept the 20% moderate spread penalty

### `src/lib/valuation/__tests__/fair-value-consistency-test.ts`
- Added 6 new tests (RANGE-001 through RANGE-006) validating:
  - Hard cap enforcement on extreme disagreement
  - Outlier dampening reduces divergent method weights
  - Pre-dampening audit trail is recorded
  - `rangeClamped` flag set correctly
  - Agreeing methods produce tight range without clamping
  - Single method produces reasonable range from sensitivity grid

### `.claude/features/peer-registry-creation/decisions.md`
- Added DECISION-004 documenting the range tightening approach

## Test Results

| Suite | Before | After |
|-------|--------|-------|
| Golden fixture | 19/19 | 19/19 |
| Broken fixture | 10/10 | 10/10 |
| Consistency | 15/15 | 24/24 (+9 new) |
| Peer validation | 18/18 | 18/18 |
| Valuation verdict | 11/11 | 11/11 |

## Impact on MU

| Metric | Iteration 12 | Iteration 13 |
|--------|-------------|-------------|
| Fair value range | $35.97 / $99.20 / $260.63 | $79.42 / $93.44 / $107.45 |
| Range width | 226% | 30% |
| Label | EXPENSIVE | DEEP_EXPENSIVE |
| Confidence | 25% (LOW) | 45% (LOW) |
| rangeClamped | N/A | true |
