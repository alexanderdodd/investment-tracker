# Ralph loop specification for valuation publication

## Core question

The next Ralph loop must answer:

> Can this feature publish a fair-value conclusion for MU that I would trust?

## New benchmark artifacts required

### 1. `golden-mu-valuation-reference.json`
Expert-reviewed valuation reference pack containing:
- allowed valuation methods
- peer / relative framework
- acceptable fair value envelope
- acceptable expensive/fair/cheap label
- acceptable action-zone thresholds
- required assumptions and caveats

### 2. `golden-mu-historical-snapshots.json`
Historical MU snapshots across cycle states:
- trough
- recovery
- peak
- late-cycle / current-like

### 3. `peer-registry-mu.json`
Deterministic peer / relative framework registry.

## New validation groups

### Group K — Peer / relative framework integrity
- `PEER-001`: framework exists
- `PEER-002`: peers have provenance and role
- `PEER-003`: peer metrics are deterministic
- `PEER-004`: peer-quality penalties documented
- `PEER-005`: weak peer quality reduces weight automatically

### Group L — Valuation method integrity
- `VALM-001`: normalized FCFF DCF fully traced
- `VALM-002`: reverse DCF fully traced
- `VALM-003`: relative valuation fully traced
- `VALM-004`: self-history valuation fully traced
- `VALM-005`: no surfaced valuation field without trace
- `VALM-006`: fair value synthesis uses only validated method outputs

### Group M — Valuation publishability
- `VPUB-001`: range width ≤ threshold
- `VPUB-002`: method disagreement ≤ threshold
- `VPUB-003`: valuation confidence ≥ threshold
- `VPUB-004`: label matches price vs range logic
- `VPUB-005`: if any value publishability rules fail, withhold valuation

### Group N — Action publishability
- `ACT-001`: action zones computed deterministically
- `ACT-002`: expected return hurdle computed deterministically
- `ACT-003`: thesis-break triggers attached
- `ACT-004`: action confidence ≥ threshold
- `ACT-005`: if action prerequisites fail, withhold action even if value publishes

### Group O — Calibration / trustworthiness
- `CAL-001`: current MU valuation falls within expert-approved envelope
- `CAL-002`: historical snapshot outputs are directionally sensible
- `CAL-003`: outputs do not flip erratically under modest sensitivity changes
- `CAL-004`: rendered report contains only allowed value/action fields

## Hard blocks for valuation publication

If any of the following are true, publish at most `PUBLISH_FACTS_ONLY`:
- no deterministic peer / relative framework
- no validated normalized DCF
- no reverse DCF
- missing formula traces
- fair value range width > 40% of midpoint
- primary-method disagreement > 25%
- valuation confidence < 0.70
- benchmark calibration fail

## Hard blocks for action publication

If any of the following are true, publish at most `PUBLISH_FACTS_PLUS_VALUE`:
- action confidence < 0.75
- thesis-break logic missing
- expected return hurdle missing
- downside / upside asymmetry not computed
- price sits near a zone boundary with high ambiguity
