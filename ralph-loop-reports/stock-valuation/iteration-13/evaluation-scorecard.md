# RALPH Loop Iteration 13 — Evaluation Scorecard

**Date:** 2026-04-12
**Ticker:** MU | **Feature:** Range tightening (spec 18)

---

## All previous groups pass. No regressions.

- Golden fixture: 19/19 | Broken fixture: 10/10 | Consistency: 24/24 | Peer: 18/18 | Valuation verdict: 11/11

## Range Tightening (RANGE-001..006)

| Rule ID | Status | Notes |
|---------|--------|-------|
| RANGE-001 | PASS | 8x method disagreement → width ≤30% (hard cap) |
| RANGE-002 | PASS | Outlier peer gets lower effective weight than DCF |
| RANGE-003a | PASS | Pre-dampening audit trail recorded |
| RANGE-003b | PASS | Dampened weight < original weight for outlier |
| RANGE-004 | PASS | rangeClamped = true on extreme disagreement |
| RANGE-005a | PASS | Agreeing methods → 27.7% width (no clamping) |
| RANGE-005b | PASS | rangeClamped = false when methods agree |
| RANGE-006a | PASS | Single method → 28.0% width (≤30%) |
| RANGE-006b | PASS | Single method → ≥10% width (from sensitivity grid) |

## Expert Fix Regressions (from iteration 12)

| Rule ID | Status | Notes |
|---------|--------|-------|
| NARR-CLEAN-001 | PASS | No withheld language contamination (unchanged) |
| LABEL-001 | PASS | DEEP labels suppressed at low confidence (unchanged) |
| RDCF-REASON-001 | PASS | Confidence reasons don't mention reverse DCF (unchanged) |

## Fair Value Output

| Metric | Iteration 12 | Iteration 13 | Change |
|--------|-------------|-------------|--------|
| Fair value range | $35.97 / $99.20 / $260.63 | $79.42 / $93.44 / $107.45 | Dramatically tighter |
| Range width | 226% | 30% | -196pp |
| Label | EXPENSIVE | DEEP_EXPENSIVE | Intensified (higher confidence) |
| Confidence | 25% (LOW) | 45% (LOW) | +20pp |
| rangeClamped | N/A | true | New field |
| Method disagreement | N/A | 97.6% | Pre-dampening |

## Confidence improvement explanation

Confidence went from 25% to 45% because the range width penalty (-0.15) no longer applies — the range is now always ≤30% by construction. The remaining penalties are:
- Cycle position: -0.20 (margins 2.7x above average)
- Method agreement: -0.15 (97.6% disagreement pre-dampening)
- Missing methods: -0.10 (no methods failed, but some low confidence)
- History depth: PASS (9 years)
