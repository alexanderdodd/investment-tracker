# Executive summary

## Goal

Extend the current facts-first MU report into a valuation-capable workflow that can safely answer:

> Can this feature publish a fair-value conclusion for MU that I would trust?

The feature must produce, when allowed by the gates:

1. a fair value range (`low`, `mid`, `high`)
2. a valuation label: `CHEAP`, `FAIR`, `EXPENSIVE`, or `WITHHELD`
3. a conditional action analysis:
   - `BUY_ZONE`
   - `ACCUMULATE`
   - `HOLD`
   - `TRIM`
   - `SELL_ZONE`
   - `WITHHELD`
4. a machine-readable explanation for why the system published or withheld the output

## Current baseline

The existing workflow has already achieved the correct first milestone:

- deterministic filing-first facts
- statement-table-first TTM builder
- facts publishable for MU
- valuation verdict withheld for MU when prerequisites fail
- regression protection through the Micron golden fixture

This baseline should not be weakened.

## Key design rule

Do not move directly from:

- `PUBLISH_FACTS_ONLY`

to:

- publishable buy/sell language

Instead add:

- a **Value gate** for fair value publication
- an **Action gate** for buy/sell-style publication

## Immediate strategic priority

For MU, the highest-value next feature is:

- **publish fair value + cheap/fair/expensive**

Conditional action guidance should only be added after the action gate passes.

## Product principle

Facts remain the base artifact.
Valuation is an additional layer.
Action guidance is a further layer.

These layers must remain separable.
