# Buy / sell action framework

## Action guidance is a separate gate

A stock can have a publishable fair-value label without having publishable buy/sell guidance.

Therefore the workflow must separate:
- **Value gate**
- **Action gate**

## Action labels

| Label | Meaning |
|---|---|
| `BUY_ZONE` | valuation attractive and expected return favorable |
| `ACCUMULATE` | below fair value but not at strongest discount |
| `HOLD` | fairly valued or mixed setup |
| `TRIM` | above fair value while thesis remains intact |
| `SELL_ZONE` | materially above fair value or thesis is degrading |
| `WITHHELD` | action analysis not safe to publish |

## Deterministic default rules

| Action | Rule |
|---|---|
| `BUY_ZONE` | current price ≤ low bound AND expected annualized return ≥ 15% AND no thesis-break flags |
| `ACCUMULATE` | price between low and midpoint AND expected annualized return between 10% and 15% |
| `HOLD` | price inside fair range AND expected annualized return between 5% and 10% |
| `TRIM` | price above high bound AND expected annualized return < 5% with thesis intact |
| `SELL_ZONE` | price materially above high OR thesis-break flags triggered |

## Thesis-break triggers for MU

Must include deterministic or evidence-based flags such as:
- gross margin compression beyond threshold
- inventory build inconsistent with demand
- bit supply growth materially above demand
- hyperscaler / AI memory demand slowdown
- competitor capacity ramp / share loss
- balance sheet deterioration
- capital allocation discipline breakdown

## Action safety rule

Do not publish action analysis if:
- fair value is withheld
- expected return hurdle is not computed
- thesis-break logic is missing
- action confidence is below threshold
- price is too close to zone boundary
