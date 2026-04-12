# Recommended workflow for determining MU's value

## Step 1 — Reuse the existing facts-first artifact

The existing MU facts layer remains authoritative and unchanged:

- latest quarter
- TTM financials
- annual history
- balance sheet
- share counts
- market cap / enterprise value
- market-derived multiples
- cycle context

No valuation code may bypass this layer.

## Step 2 — Determine archetype first

Classify the company before selecting methods.

For MU:
- `archetype = cyclical_semiconductor_memory`

This classification controls:
- valuation methods
- normalization rules
- history requirements
- peer / relative framework
- gate thresholds

## Step 3 — Use the MU valuation method stack

### Primary method A — Normalized FCFF DCF
Use cycle-normalized economics, not current peak quarter economics.

### Primary method B — Reverse DCF
Determine what the current market price implies about:
- revenue growth
- normalized margins
- capital intensity
- duration of favorable cycle conditions

### Secondary method C — Relative valuation
Use a deterministic peer or relative framework registry.
This must not be improvised by the LLM.

### Secondary method D — Self-history valuation
Compare current multiples and profitability to MU's own prior cycle ranges.

## Step 4 — Synthesize fair value
Produce:
- `low`
- `mid`
- `high`

Then classify:
- `CHEAP`
- `FAIR`
- `EXPENSIVE`

## Step 5 — Determine if action guidance is safe
Only after fair value publishes.

Action guidance must be conditional and threshold-based.
