# Fair value synthesis and labeling

## Default method weights for MU

| Method | Default weight |
|---|---:|
| Normalized FCFF DCF | 45% |
| Reverse DCF | 20% |
| Relative valuation | 25% |
| Self-history valuation | 10% |

## Reweighting rules

- reduce relative valuation weight if peer quality is weak
- reduce DCF weight if cycle normalization confidence is weak
- reduce self-history weight if the history window is insufficient
- renormalize weights to 100%

## Fair value output

Produce:
- `low`
- `mid`
- `high`

## Label rules

| Label | Rule |
|---|---|
| `CHEAP` | current price < low |
| `FAIR` | low ≤ current price ≤ high |
| `EXPENSIVE` | current price > high |

## Stronger optional labels

Only if confidence is high:
- `DEEP_CHEAP` if current price < low × 0.85
- `DEEP_EXPENSIVE` if current price > high × 1.15

## Uncertainty rule

If `(high - low) / mid > 0.40`, the fair value range is too wide to support a trustable valuation label.

In that case:
- either keep `PUBLISH_FACTS_ONLY`, or
- publish value with `valuationLabel = WITHHELD_HIGH_UNCERTAINTY`

Recommended default for MU initial release:
- keep `PUBLISH_FACTS_ONLY`

## Mandatory traceability rule

Every surfaced valuation number must have:
- formula trace
- input provenance
- method id
- weight in synthesis
