# Stock Valuation Next-Feature Spec (Complete)

---

## README.md

# Stock Valuation Next-Feature Spec Bundle

This bundle defines the next phase of the stock valuation workflow:

- publishable **fair value ranges**
- **cheap / fair / expensive** labels
- conditional **buy / accumulate / hold / trim / sell-zone** analysis
- a valuation-specific **RALPH loop** that answers the question:
  - **"Can this feature publish a fair-value conclusion for MU that I would trust?"**

## Intended use

1. Treat `stock-valuation-next-feature-spec-complete.md` as the canonical master document.
2. Treat this bundle as an extension of the existing facts-first / valuation-withheld workflow.
3. Keep the current deterministic facts layer unchanged as the prerequisite foundation.
4. Implement valuation publication only after the new value gate and action gate pass.
5. Use MU first; generalize later by company archetype, not by copying MU logic.

## Safety posture

- filing-first
- deterministic facts before narrative
- no value verdict on broken facts
- no action guidance on broken value layer
- explicit provenance and formula traces
- prefer withholding over false precision

## Key design decision

The next phase adds a **third gate**:

1. Facts gate
2. Value gate
3. Action gate

A stock can pass the facts gate and still fail the value gate.
A stock can pass the value gate and still fail the action gate.

That separation is required for trust.

---

## 01-executive-summary.md

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

---

## 02-scope-and-non-goals.md

# Scope and non-goals

## In scope

For MU first, and later for other equities:

- fair value range generation
- valuation labeling (`CHEAP`, `FAIR`, `EXPENSIVE`)
- conditional buy/sell analysis
- valuation-specific deterministic validation
- valuation-specific Ralph loop evaluation
- benchmark and regression design for publishable valuation

## Out of scope for this phase

- automated trading
- broker execution
- portfolio optimization
- unsupported security types without a valuation framework
- cross-sector one-size-fits-all valuation logic
- free-form narrative recommendations without deterministic support

## Release boundary

This phase is complete only when the workflow can safely publish a fair-value conclusion for MU.
It is not complete merely because a DCF number exists.

---

## 03-output-contract.md

# Output contract

## Allowed output states

| Status | Facts | Fair value | Valuation label | Action analysis |
|---|---|---|---|---|
| `WITHHOLD_ALL` | No | No | No | No |
| `PUBLISH_FACTS_ONLY` | Yes | No | No | No |
| `PUBLISH_FACTS_PLUS_VALUE` | Yes | Yes | Yes | No |
| `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION` | Yes | Yes | Yes | Yes |

## Required fields when `PUBLISH_FACTS_PLUS_VALUE`

```json
{
  "valuationStatus": "published",
  "fairValueRange": {
    "low": 0,
    "mid": 0,
    "high": 0,
    "currency": "USD"
  },
  "valuationLabel": "CHEAP | FAIR | EXPENSIVE",
  "valuationConfidence": 0.0,
  "currentPrice": 0,
  "priceVsMid": 0.0,
  "methodSummary": {
    "normalizedDcf": {},
    "reverseDcf": {},
    "relativeValuation": {},
    "selfHistory": {}
  },
  "keyAssumptions": [],
  "valuationReasons": []
}
```

## Required fields when `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION`

```json
{
  "actionStatus": "published",
  "actionLabel": "BUY_ZONE | ACCUMULATE | HOLD | TRIM | SELL_ZONE",
  "actionConfidence": 0.0,
  "buyBelow": 0,
  "trimAbove": 0,
  "sellAbove": 0,
  "thesisBreakTriggers": [],
  "whyNow": [],
  "whyNotNow": []
}
```

## Mandatory rule

If fair value is withheld:
- do not emit a cheap/fair/expensive label
- do not emit buy/sell style action labels
- do not emit valuation confidence
- do not emit price targets or margin of safety

## Action-style language rule

Allowed:
- "Buy zone below X if thesis remains intact"
- "Trim zone above Y if cycle indicators deteriorate"
- "Hold while price remains inside fair range"

Forbidden:
- "Buy now"
- "Sell now"
- "This is a must-buy"

---

## 04-mu-valuation-workflow.md

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

---

## 05-peer-registry-and-relative-framework.md

# Peer registry and relative framework

## Why this is required

The current system withholds MU valuation partly because the peer set is not deterministically sourced or curated.

That must be fixed before valuation publication can be trusted.

## Required artifact

Create a deterministic `peer_registry` or `relative_framework_registry`.

### Example schema

```json
{
  "ticker": "MU",
  "framework": "cyclical_semiconductor_memory_v1",
  "effectiveDate": "2026-04-12",
  "primaryPeers": [
    {
      "ticker": "000660.KS",
      "name": "SK hynix",
      "role": "memory_primary",
      "publicDataUsable": true,
      "notes": "Direct memory peer"
    },
    {
      "ticker": "005930.KS",
      "name": "Samsung Electronics",
      "role": "memory_primary_but_conglomerate",
      "publicDataUsable": true,
      "notes": "Use with weighting penalty due to conglomerate structure"
    }
  ],
  "secondaryPeers": [
    {
      "ticker": "WDC",
      "name": "Western Digital",
      "role": "storage_adjacent",
      "publicDataUsable": true
    }
  ],
  "selfHistoryAllowed": true,
  "relativeMetrics": ["EV/EBIT", "EV/EBITDA", "EV/Revenue", "P/B"],
  "weights": {
    "primaryPeers": 0.7,
    "secondaryPeers": 0.3
  },
  "caveats": [
    "Few clean public pure-play memory peers",
    "Conglomerate adjustments required for Samsung"
  ]
}
```

## Mandatory rules

1. The peer or relative framework must be deterministic.
2. Every peer entry must have provenance and role.
3. If peer quality is weak, the method weight must be reduced automatically.
4. If a clean peer set is not possible, the system may still publish valuation only if:
   - the alternative relative framework is documented
   - self-history is used as a secondary anchor
   - confidence is reduced accordingly

---

## 06-fair-value-synthesis-and-labeling.md

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

---

## 07-buy-sell-action-framework.md

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

---

## 08-ralph-loop-specification-valuation-publication.md

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

---

## 09-validation-framework-and-thresholds.md

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

---

## 10-report-structure.md

# Report structure for the next feature

## Section 1 — Facts
The current facts section remains unchanged.

## Section 2 — Valuation status
When published, include:
- valuation status
- fair value range
- current price vs range
- valuation label
- valuation confidence
- method summary

## Section 3 — Action status
When published, include:
- action status
- action label
- buy-below / trim-above / sell-above thresholds
- thesis-break triggers
- why-now / why-not-now

## Section 4 — Why the valuation is what it is
Include:
- normalized assumptions
- reverse DCF interpretation
- relative valuation summary
- self-history context
- cycle-position interpretation

## Section 5 — What would change the conclusion
Examples:
- margins normalize faster than expected
- AI/HBM demand proves more durable than assumed
- peer multiples compress materially
- capex discipline improves or worsens

## Section 6 — Withhold behavior
If valuation is withheld:
- show `VALUATION STATUS: WITHHELD`
- show exact gate reasons
- do not show fair value range, label, action zones, or valuation confidence

If action is withheld but value publishes:
- show `ACTION STATUS: WITHHELD`
- show action-gate reasons

---

## 11-acceptance-criteria-definition-of-done.md

# Acceptance criteria / definition of done

The next feature is done for MU only when all of the following are true:

1. the current facts layer still passes all existing Micron baseline checks
2. a deterministic peer / relative framework exists for MU
3. all surfaced valuation fields have formula traces
4. a reproducible fair value range is generated
5. the expensive/fair/cheap label is mechanically derived from the range
6. valuation confidence is deterministic and traceable
7. action zones are deterministic and condition-based
8. action guidance is withheld when action prerequisites fail
9. the current MU output passes the expert-reviewed valuation envelope test
10. historical MU snapshots pass directional sanity tests
11. no unsupported valuation or action claims leak into the report
12. negative controls still force `WITHHOLD_ALL` or `PUBLISH_FACTS_ONLY` as appropriate

## Milestone recommendation

### Milestone A
Publish:
- fair value range
- cheap/fair/expensive label

Do not publish action guidance yet unless the action gate also passes.

### Milestone B
Publish:
- conditional buy / accumulate / hold / trim / sell-zone analysis

Only after valuation confidence is stable and historical calibration passes.

---

## 12-implementation-guidance.md

# Implementation guidance

## Keep the current facts pipeline intact

Do not rewrite or loosen:
- statement-table-first TTM builder
- quarter identity validation
- balance-sheet / share-count logic
- publish gate semantics for facts
- suppression behavior for withheld states

## Add new modules

Suggested additions:

```text
src/
  valuation/
    peerRegistry.ts
    relativeFramework.ts
    normalizedDcf.ts
    reverseDcf.ts
    fairValueSynthesizer.ts
    actionZones.ts
    valuationCalibration.ts
  validation/
    valuationRules.ts
    actionRules.ts
  reports/
    renderValueLayer.ts
    renderActionLayer.ts
```

## LLM usage rules for this phase

### Allowed
- explain already-validated valuation outputs
- summarize assumptions
- red-team structural vs cyclical reasoning
- surface qualitative risks linked to evidence pack entries

### Forbidden
- selecting peers ad hoc
- inventing fair value numbers
- inventing buy/sell thresholds
- overriding valuation or action gates
- computing or modifying core model outputs

## Persistence requirements

Persist new artifacts alongside current ones:
- peer registry snapshot used
- valuation method pack
- fair value synthesis artifact
- action zone artifact
- valuation confidence artifact
- action confidence artifact
- calibration results
- rendered valuation-surface scan

---

## 13-prompt-for-coding-assistant.md

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

