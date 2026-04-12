# 19 — Method agreement: industry-aware multiple filtering and tiered disagreement metric

## Problem statement

The method agreement scorecard shows 226% disagreement for Allstate (ALL). The root cause is twofold:

1. **Structural bug**: EV-based multiples (EV/EBITDA, EV/Revenue) are applied to insurance companies where they are fundamentally inappropriate. Insurance company "liabilities" are policyholder reserves, not financial debt. Applying EV multiples to thin underwriting margins and then subtracting only financial debt inflates equity values by 10-20x.

2. **Metric design issue**: Method agreement is computed pre-dampening as `(max - min) / avg`, which reflects raw data problems rather than the effective synthesis. Users see "226% disagreement" even though the dampened midpoint is driven by the two agreeing methods.

## Part A — Industry-aware multiple filtering

### Root cause

The industry framework (`selectFramework`) correctly identifies insurance companies and specifies `primaryMethods: ["residual_income", "justified_ptbv", "pe_roe"]` — no EV-based methods. However, `computeRelativeValuationFromDynamic` and `computeRelativeValuation` ignore this framework and apply EV/EBITDA and EV/Revenue to all sectors.

### Fix

Pass the `IndustryFramework` to the relative valuation functions and use it to filter which multiples are applied.

**Allowed multiples by framework type:**

| Framework | Allowed multiples | Excluded | Why |
|-----------|------------------|----------|-----|
| `financial` (banks, insurance) | P/E, P/B | EV/EBITDA, EV/Revenue | Policyholder reserves and deposits are not financial debt; EV is meaningless |
| `reit` | P/B, EV/EBITDA | EV/Revenue | Revenue not primary metric; FFO/AFFO not yet available in peer multiples |
| `semiconductor` | EV/EBITDA, EV/Revenue, P/B | (none excluded) | All valid for capital-intensive cyclicals |
| `growth_tech` | EV/Revenue, P/B | EV/EBITDA | Many growth companies have negative EBITDA |
| `general` | P/E, P/B, EV/EBITDA, EV/Revenue | (none excluded) | Default: use all available |
| `consumer_staples` | P/E, P/B, EV/EBITDA | EV/Revenue | Revenue multiples less meaningful for stable businesses |
| `commodity_cyclical` | EV/EBITDA, P/B | EV/Revenue | Revenue varies wildly with commodity prices |
| `utility` | P/E, EV/EBITDA | EV/Revenue | Rate-regulated; revenue multiples misleading |

**Implementation:**

1. Add `allowedPeerMultiples` field to `IndustryFramework` type:
   ```typescript
   allowedPeerMultiples: ("pe" | "pb" | "ev_ebitda" | "ev_revenue")[];
   ```

2. Update `selectFramework` to populate this field for each framework type.

3. Update `computeRelativeValuationFromDynamic` signature to accept `allowedMultiples`:
   ```typescript
   export function computeRelativeValuationFromDynamic(
     registry: DynamicPeerRegistry,
     subjectFacts: { ... },
     allowedMultiples?: ("pe" | "pb" | "ev_ebitda" | "ev_revenue")[]
   ): RelativeValuationResult
   ```

4. In the peer loop, skip any multiple not in `allowedMultiples`:
   ```typescript
   if (!allowedMultiples.includes("ev_ebitda")) { /* skip EV/EBITDA block */ }
   ```

5. Same for `computeRelativeValuation` (curated peer path).

6. Update `generate-stock-valuation.ts` to pass `framework.allowedPeerMultiples` when calling `computeRelativeValuationFromDynamic`.

### Expected impact for Allstate

- Before: peer uses EV/EBITDA + EV/Revenue + P/B → $4,447/share (dominated by broken EV multiples)
- After: peer uses P/E + P/B only → expected ~$200-400/share (in line with DCF and self-history)
- Method disagreement should drop from 226% to <50%

## Part B — Tiered method agreement metric with dual reporting

### Current behavior

Method agreement is a single number: `(max - min) / avg` of **pre-dampening** per-share values. This conflates two distinct questions:
1. "How much do the raw methods disagree?" (data quality signal)
2. "How much disagreement influenced the final midpoint?" (synthesis quality signal)

### Fix: report both raw and effective disagreement

**Raw disagreement** (pre-dampening): computed from original method values before outlier dampening. This is the "data quality" signal — it tells you whether a method has a structural problem (like EV multiples for insurance).

**Effective disagreement** (post-dampening): computed from dampened method values weighted by their effective weights. This is the "synthesis quality" signal — it tells you how reliable the midpoint is.

**Implementation:**

Add to `FairValueSynthesis`:
```typescript
/** Pre-dampening disagreement: (max - min) / avg of raw values */
rawMethodDisagreement: number;
/** Post-dampening disagreement: weighted deviation from midpoint */
effectiveMethodDisagreement: number;
```

**Effective disagreement formula:**
```
effectiveDisagreement = Σ(effectiveWeight_i × |value_i - mid| / mid)
```
This is the weight-adjusted mean absolute deviation from the midpoint, as a fraction. It naturally reflects dampening: a method with 0.5% effective weight barely contributes.

### Tiered thresholds

Display the **effective disagreement** on the scorecard with these tiers:

| Effective disagreement | Tier | Scorecard | Confidence penalty |
|----------------------|------|-----------|-------------------|
| ≤20% | Strong | Green check, "X% — strong agreement" | None |
| 20-50% | Moderate | Green check, "X% — moderate agreement" | -0.05 |
| 50-100% | Weak | Red X, "X% disagreement (significant)" | -0.10 |
| >100% | Structural | Red X, "X% disagreement — investigate method inputs" | -0.15 |

When raw disagreement is >100% but effective is <50%, add a note:
"Outlier method dampened — raw disagreement X%, effective Y% after dampening"

### Confidence scorecard display

Show both values:
```
Method agreement    ✓  12% effective (raw: 45%) — moderate
Method agreement    ✗  85% effective (raw: 226%) — significant; outlier dampened
```

## Validation steps

### Unit tests (add to `fair-value-consistency-test.ts`)

| Test ID | Description |
|---------|-------------|
| AGREE-001 | Financial framework excludes EV/EBITDA and EV/Revenue from peer multiples |
| AGREE-002 | Semiconductor framework allows all multiples |
| AGREE-003 | `rawMethodDisagreement` reflects pre-dampening values |
| AGREE-004 | `effectiveMethodDisagreement` reflects post-dampening weighted values |
| AGREE-005 | Effective < raw when outlier dampening is active |
| AGREE-006 | Agreeing methods produce <20% effective disagreement |
| AGREE-007 | Tiered confidence penalties match the threshold table |

### Integration tests (add to `pipeline-integration-test.ts`)

| Test ID | Description |
|---------|-------------|
| AGREE-INT-001 | For a financial-sector company (e.g., ALL), no EV-based peer values appear in `perShareValues` |
| AGREE-INT-002 | Method agreement ≤50% for financial-sector companies after multiple filtering |

### Regression checks

- All existing RANGE-001..006 tests still pass (range tightening unaffected)
- MU valuation unchanged (semiconductor framework allows all multiples)
- Golden fixture 19/19, broken fixture 10/10
