# Prompt for coding assistant

You are implementing the next phase of the production-safe stock valuation workflow.

Your mission:
Extend the existing facts-first Micron (MU) workflow so it can safely publish:
1. a fair value range
2. a cheap / fair / expensive label
3. conditional buy / accumulate / hold / trim / sell-zone analysis

But only when the new value and action gates pass.

## Operating principles

1. Facts remain filing-first and deterministic.
2. Valuation is an additional layer on top of validated facts.
3. Action guidance is an additional layer on top of validated valuation.
4. If value prerequisites fail, publish at most `PUBLISH_FACTS_ONLY`.
5. If action prerequisites fail, publish at most `PUBLISH_FACTS_PLUS_VALUE`.
6. Prefer withholding over false precision.
7. Prompt-only fixes are forbidden when the issue is in method selection, peer sourcing, model logic, validation, or gate behavior.

## What you must implement

### A. Deterministic peer / relative framework for MU
- build `peer_registry` or `relative_framework_registry`
- include provenance, peer roles, quality flags, and weighting penalties
- no runtime ad hoc peer invention

### B. MU valuation method stack
- normalized FCFF DCF
- reverse DCF
- relative valuation via deterministic framework
- self-history valuation
- fair value synthesis (`low`, `mid`, `high`)

### C. MU valuation labeling
- derive `CHEAP`, `FAIR`, or `EXPENSIVE` only from price vs fair-value range
- withhold if uncertainty or disagreement thresholds fail

### D. MU action layer
- compute `BUY_ZONE`, `ACCUMULATE`, `HOLD`, `TRIM`, `SELL_ZONE`
- action outputs must be conditional, threshold-based, and deterministic
- action must be withheld if action prerequisites fail

### E. New gates
- preserve existing facts gate
- add value gate
- add action gate

### F. New Ralph loop validations
- peer / relative framework integrity
- valuation method integrity
- valuation publishability
- action publishability
- calibration / trustworthiness checks

## Required artifacts

Persist and emit on every iteration:
- peer registry snapshot
- valuation method pack
- fair value synthesis artifact
- action zone artifact
- valuation confidence artifact
- action confidence artifact
- calibration results
- rendered report
- valuation surface scan
- iteration scorecard

## Use MU first

The question you are answering is:

> Can this feature publish a fair-value conclusion for MU that I would trust?

Do not generalize before MU passes.

## Hard rules

- never publish value if peer / relative framework is missing
- never publish value if range width > 40% of midpoint
- never publish value if primary-method disagreement > 25%
- never publish value if valuation confidence < 0.70
- never publish action if action confidence < 0.75
- never publish action if thesis-break triggers are missing
- never let LLM narrative create value or action numbers

## Milestones

### Milestone A
Get MU to `PUBLISH_FACTS_PLUS_VALUE`
with:
- fair value range
- valuation label
- valuation confidence

### Milestone B
Get MU to `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION`
with:
- action label
- conditional buy/sell thresholds
- thesis-break triggers

## Definition of success

Success for this phase means:
- MU facts still pass the existing golden regression fixture
- fair value range is reproducible
- valuation label is trusted and calibrated
- action analysis is only published when action gate passes
- negative controls still behave correctly
- no forbidden value/action leaks appear in withheld states

Return after each iteration:
1. failed rule ids
2. root-cause hypothesis
3. patch summary
4. regression result
5. gate status
6. whether MU can safely publish value
7. whether MU can safely publish action
8. next action
