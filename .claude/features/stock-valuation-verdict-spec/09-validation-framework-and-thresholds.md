# Validation framework and thresholds for valuation publication

## Valuation confidence model

Start at `1.00` and apply penalties.

### Suggested penalties

- `-0.15` if peer set quality is medium
- `-0.20` if current margins > 2.5x historical average
- `-0.15` if fair value range width > 30%
- `-0.15` if primary methods disagree by > 20%
- `-0.10` if reverse DCF implies a much more optimistic world than base case
- `-0.10` if history depth is only at the minimum acceptable level

## Action confidence model

Start from `valuationConfidence` and apply:
- `-0.10` if price is within 5% of a zone boundary
- `-0.10` if catalyst visibility is weak
- `-0.10` if more than one thesis-risk flag is active

## Calibration requirements

The Ralph loop should not validate only structure. It must also validate trust.

### Required calibration checks

1. Current MU fair value output must fall inside the expert-reviewed acceptable envelope.
2. Historical MU snapshots must produce directionally sensible labels:
   - trough should not label `EXPENSIVE`
   - obvious peak should not label `CHEAP`
3. Small assumption changes must not cause label instability when price is not near a boundary.
4. Surfaced value/action claims must match validated traces.

## Range policy

| Condition | Result |
|---|---|
| range width ≤ 25% of midpoint | strong |
| 25% < width ≤ 40% | usable with caution |
| width > 40% | withhold value |

## Method disagreement policy

| Condition | Result |
|---|---|
| disagreement ≤ 15% | strong |
| 15% < disagreement ≤ 25% | usable with caution |
| disagreement > 25% | withhold value |
