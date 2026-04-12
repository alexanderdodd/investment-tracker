# 18 — Range tightening: midpoint-anchored synthesis with outlier dampening

## Problem statement

The current fair value range is computed as the outer envelope of all method outputs (min of all lows, max of all highs). When methods disagree significantly — e.g., DCF at $528 vs peer comparison at $4447 — this produces ranges exceeding 200% of midpoint. The spec target is <30%.

The confidence scorecard correctly flags these issues (range width, method disagreement) but only applies soft penalties. The range itself is never constrained.

## Requirement

**The published fair value range width MUST be ≤30% of the weighted midpoint.** If the pre-clamped range exceeds this, the system must either tighten it or withhold the value.

## Root causes of wide ranges

1. **Outer-envelope construction**: `low = min(all_lows) × 0.95`, `high = max(all_highs) × 1.05` — guarantees range grows with method disagreement
2. **No outlier dampening**: a single divergent method (e.g., peer comparison at 8× DCF) dominates the high bound unchecked
3. **DCF sensitivity grid extremes**: grid corners with unrealistic WACC/growth combos pull the floor/ceiling further apart
4. **Self-history range extremes**: historical cycle peaks/troughs widen the envelope further

## Design: three-layer fix

### Layer 1 — Outlier dampening on method values

Before computing the weighted midpoint, detect and dampen outlier methods.

**Algorithm:**

1. Compute a preliminary weighted midpoint `mid₀` using all valid methods with their default weights
2. For each method, compute deviation: `dev = |methodValue - mid₀| / mid₀`
3. If `dev > 0.50` (method disagrees with consensus by >50%), apply exponential dampening:
   - `dampened_weight = base_weight × 0.5^((dev - 0.50) / 0.50)`
   - Example: method at 2× mid₀ → dev = 1.0 → dampened to 50% of original weight
   - Example: method at 4× mid₀ → dev = 3.0 → dampened to 6.25% of original weight
   - Example: method at 8× mid₀ → dev = 7.0 → dampened to 0.78% of original weight
4. Renormalize weights and recompute `mid` with dampened weights
5. Record which methods were dampened and by how much (for traceability)

**Why exponential?** Linear dampening still allows extreme outliers to pull the midpoint. Exponential ensures that wildly divergent methods contribute negligibly, while methods that are moderately off (30-50%) are unaffected.

### Layer 2 — Midpoint-anchored range construction

Replace the outer-envelope approach with a range derived from the **dispersion around the weighted midpoint**.

**Algorithm:**

1. Compute weighted standard deviation of method values around `mid`:
   ```
   σ² = Σ(effectiveWeight_i × (value_i - mid)²)
   σ = sqrt(σ²)
   ```
2. Incorporate DCF sensitivity spread (but bounded):
   ```
   dcfSpread = min(dcfHigh - dcfLow, 0.30 × mid) / 2
   ```
   The DCF sensitivity grid is useful but its extreme corners (low WACC + high growth) are unrealistic. Cap the contribution at 30% of mid.
3. Compute raw half-width:
   ```
   halfWidth = max(σ, dcfSpread)
   ```
4. Apply the hard cap (Layer 3 below)
5. Final range:
   ```
   low  = max(0, mid - halfWidth)
   high = mid + halfWidth
   ```

**Why weighted σ?** It naturally reflects how tightly methods agree. If all three methods cluster within 10%, σ is small and the range is tight. If one disagrees, dampening (Layer 1) already reduced its weight, so it contributes less to σ.

### Layer 3 — Hard cap at 30% of midpoint

After computing the raw range:

1. Compute `rangeWidth = (high - low) / mid`
2. If `rangeWidth > 0.30`:
   - Clamp: `halfWidth = 0.15 × mid` (symmetric 15% each side)
   - Set `low = mid × 0.85`, `high = mid × 1.15`
   - Set a flag: `rangeClamped = true`
3. If the **pre-dampened** method disagreement exceeds 100% (i.e., max method > 2× min method before any dampening), also set `highMethodDisagreement = true`

### Value gate enforcement

Update `evaluateValueGate` to respect the spec thresholds:

| Condition | Action |
|---|---|
| rangeClamped = false, disagreement ≤ 25% | PUBLISH_FACTS_PLUS_VALUE, no caveats |
| rangeClamped = true OR 25% < disagreement ≤ 100% | PUBLISH_FACTS_PLUS_VALUE with caveat: "Range was tightened; methods disagree significantly" |
| Pre-dampened disagreement > 100% AND fewer than 2 methods within 50% of each other | PUBLISH_FACTS_ONLY (label = WITHHELD) |

This preserves the spec's "prefer withholding over false precision" principle while still publishing useful values when the disagreement is moderate and dampening produces a credible midpoint.

## Traceability additions

The `FairValueSynthesis` output must include:

```typescript
/** Whether the range was clamped to the 30% cap */
rangeClamped: boolean;
/** Pre-dampening method values for audit trail */
preDampeningMethods: { method: string; originalValue: number; dampenedWeight: number; originalWeight: number }[];
/** Raw range width before clamping */
rawRangeWidth: number;
```

## Confidence scorecard updates

The confidence checklist should reflect the new mechanics:

- **Range width**: always passes now (hard-capped at 30%), but if `rangeClamped = true`, show detail: "Clamped from X% to 30% — treat midpoint as approximate"
- **Method agreement**: if any method was dampened >50%, show: "Peer comparison dampened from $X (weight reduced Y% → Z%) due to extreme divergence from DCF/self-history consensus"

## Implementation plan

### Step 1: Outlier dampening (in `fair-value-synthesis.ts`)
- Add `dampenOutlierMethods()` function before the existing weighted midpoint computation
- Insert between lines 276 and 285 (after filtering valid methods, before computing effective weights)
- Preserve the original per-share values for traceability

### Step 2: Replace range construction (in `fair-value-synthesis.ts`)
- Replace lines 291-311 (the min/max envelope) with the midpoint-anchored σ-based range
- Add DCF sensitivity spread capping
- Add the 30% hard cap

### Step 3: Update value gate (in `fair-value-synthesis.ts`)
- Add the `rangeClamped` and `highMethodDisagreement` checks to `evaluateValueGate`
- Enforce PUBLISH_FACTS_ONLY when disagreement is extreme

### Step 4: Update types and UI
- Add `rangeClamped`, `preDampeningMethods`, `rawRangeWidth` to `FairValueSynthesis`
- Update the confidence scorecard display to show dampening info

## Expected impact

For the case in the screenshot (DCF $528, Peer $4447, Self-history $396):

1. **Dampening**: Peer at $4447 has dev = ~1.5 from preliminary mid ~$1300. Dampened weight drops from 30% to ~15%. Self-history and DCF dominate.
2. **New midpoint**: ~$600-700 (DCF and self-history are close, peer contributes little)
3. **σ-based range**: with dampened peer contributing little, σ is modest → range ~$500-800
4. **Hard cap check**: if still >30%, clamp to ±15% of mid → e.g., $510-690

This is dramatically tighter than $263-$4669 and more defensible: it reflects the consensus of two agreeing methods rather than the outer envelope of a single outlier.

## Risks

- **False tightness**: dampening could suppress a method that is actually correct (e.g., if the peer market really does value the company much higher). Mitigation: always show the pre-dampening values in the report narrative so the analyst (LLM) can discuss why methods disagree.
- **Midpoint instability**: if all three methods disagree equally, dampening has less effect and the cap kicks in. The cap is still preferable to a 230% range.
- **Backward compatibility**: existing reports will produce different ranges. This is acceptable — the old ranges were not trustworthy.
