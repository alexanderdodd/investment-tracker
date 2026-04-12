# Publish gate semantics

## 1. Two-stage gate plus mandatory surface validation

The publish system still uses a **two-stage business gate**:

1. **Facts gate**
2. **Valuation gate**

In vNext, both stages are followed by a mandatory **surface validation layer**.  
Surface validation is not a separate business verdict; it is a **blocking render-safety check** that must pass before anything user-facing is emitted.

## 2. Gate 1 — Facts gate

Question: **Are the core facts safe to publish?**

Pass requires:

- all critical fact validators pass
- no stale market data for price-sensitive fields
- provenance complete for all critical numbers

If Gate 1 fails:

- status = `WITHHOLD_ALL`
- emit diagnostic artifact only
- no valuation section
- no confidence score
- no target price
- no investment conclusion

## 3. Gate 2 — Valuation gate

Question: **Are valuation prerequisites safe enough to publish a verdict?**

Pass requires:

- Gate 1 already passed
- cyclical history sufficiency passes
- normalized model inputs are traceable
- multiple math is consistent
- peer-set and scenario assumptions are validated
- no high-severity valuation rule failures

If Gate 2 fails:

- status = `PUBLISH_FACTS_ONLY`
- publish facts + directly validated derived metrics only
- set `valuation_status = withheld`
- omit fair value, margin of safety, confidence score, and investment conclusion

## 4. Surface validation layer

Question: **Is the actual rendered report safe for the current gate state?**

Surface validation must ensure:

- only allowlisted fields are present
- every surfaced non-primitive number has a formula trace
- every surfaced narrative comparison depends only on passed validators
- no forbidden valuation field appears in a withheld state
- no failed-history or failed-normalization derivative appears
- no annual / quarter / TTM label confusion appears in surfaced numeric claims

If surface validation fails:
- final publish is blocked
- actual user-facing state becomes `WITHHOLD_ALL`
- a diagnostic artifact is emitted

### Narrative prompt filtering (mandatory)

The LLM narrative prompt must be filtered by the suppression audit **before** the LLM is called. If a field is in `suppressedFields`, its value must not appear in the data provided to the LLM. The LLM cannot suppress what it can see.

See `12-narrative-suppression-and-artifact-integrity.md` for the full specification.

### Post-render suppression assertion (mandatory)

After the narrative is generated, a hard assertion must verify that no denied-field value appears in the rendered report text. If the assertion fails, the pipeline must either downgrade to `WITHHOLD_ALL` or re-generate the narrative with the offending fields removed from the prompt.

## 5. Publication classes

Every candidate field must be assigned to one of these classes before rendering:

### Class A — Authoritative facts
Examples:
- filing-derived latest quarter values
- filing-derived TTM values
- annual-history rows
- balance-sheet facts
- filing-derived share counts

### Class B — Direct deterministic derivations
Examples:
- market cap
- enterprise value
- trailing P/E
- P/B
- EV/Revenue
- EV/EBIT
- EV/FCF

Requirements:
- direct dependency on validated facts only
- machine-readable formula trace

### Class C — Model-driven / valuation outputs
Examples:
- fair value
- target price
- margin of safety
- scenario values
- normalized FCF
- cycle confidence
- intrinsic value range
- valuation confidence

Requirements:
- valuation gate pass
- formula trace
- valuation prerequisites all pass

### Class D — Evidence-backed qualitative claims
Examples:
- contract duration commentary
- customer concentration commentary
- competitor references
- segment or geographic exposure commentary
- management guidance commentary

Requirements:
- grounded in evidence pack
- evidence source ids preserved
- no contradiction with deterministic facts

## 6. What is allowed by gate state

| Gate state | Allowed classes |
|---|---|
| `WITHHOLD_ALL` | none user-facing except diagnostic summary |
| `PUBLISH_FACTS_ONLY` | Class A + Class B + Class D |
| `PUBLISH_WITH_WARNINGS` | Class A + Class B + Class C + Class D, subject to warnings |
| `PUBLISH_FULL` | Class A + Class B + Class C + Class D |

**Important:** `PUBLISH_FACTS_ONLY` does **not** mean all Class B fields are automatically allowed. They are allowed only if their dependencies all passed and their formula traces exist.

## 7. Required block conditions

The system must block publication of any valuation verdict if any of the following are true:

- latest quarter fails identity checks
- TTM revenue fails reconciliation
- TTM margins fail reconciliation
- operating cash flow fails reconciliation
- GAAP free cash flow fails reconciliation
- balance-sheet core fields fail reconciliation
- share-count basis fails reconciliation
- cyclical history is insufficient for DCF normalization
- valuation model depends on missing or unvalidated normalized assumptions
- peer-set validation fails
- surface validation fails

## 8. Dependency-aware suppression rules

When a validator fails, all dependent report fields and sentences must be suppressed.

Examples:

- if `HIST-004` fails:
  - suppress five-year average margins
  - suppress sentences comparing current margins to historical averages
  - suppress cycle-normalization text that depends on those averages

- if `VAL-002` fails:
  - suppress normalized FCF
  - suppress normalized cash-flow commentary
  - suppress any sentence that cites normalized base-year economics

- if `TRACE-004` fails:
  - suppress ROE
  - suppress ROIC
  - suppress interest coverage
  - suppress cycle confidence

## 9. Confidence semantics

| State | Confidence field |
|---|---|
| `WITHHOLD_ALL` | `null` |
| `PUBLISH_FACTS_ONLY` | `null` for valuation |
| `PUBLISH_WITH_WARNINGS` | numeric allowed |
| `PUBLISH_FULL` | numeric allowed |

**Rule:** confidence must never imply valuation usability when the verdict is withheld.

## 10. Leak-prevention rules

When status is `WITHHOLD_ALL` or `PUBLISH_FACTS_ONLY`, the following must not appear anywhere in the user-facing report:

- fair value
- target price
- margin of safety
- valuation confidence score
- investable verdict such as undervalued, overvalued, fair value, buy, hold, or sell
- scenario price outputs
- normalized FCF unless separately validated and explicitly allowlisted
- cycle confidence score
- any numeric claim that lacks a formula trace
- any numeric claim whose upstream dependency validator failed

## 11. Gate pseudocode

```python
def publish_gate(rule_results, valuation_prereqs):
    if has_high_fact_fail(rule_results) or missing_critical_fact(rule_results):
        return GateDecision(
            status="WITHHOLD_ALL",
            facts_publishable=False,
            valuation_publishable=False,
            valuation_confidence=None
        )

    if has_high_valuation_fail(valuation_prereqs) or insufficient_history_for_cyclical_dcf(valuation_prereqs):
        return GateDecision(
            status="PUBLISH_FACTS_ONLY",
            facts_publishable=True,
            valuation_publishable=False,
            valuation_confidence=None
        )

    if has_medium_noncritical_warning(rule_results, valuation_prereqs):
        return GateDecision(
            status="PUBLISH_WITH_WARNINGS",
            facts_publishable=True,
            valuation_publishable=True
        )

    return GateDecision(
        status="PUBLISH_FULL",
        facts_publishable=True,
        valuation_publishable=True
    )
```

```python
def surface_gate(rendered_report, allowlist, denylist, formula_traces):
    if contains_forbidden_value(rendered_report, denylist):
        return SurfaceDecision(status="FAIL", reason="Forbidden field leaked")

    if contains_untraced_numeric_claim(rendered_report, formula_traces):
        return SurfaceDecision(status="FAIL", reason="Untraced derived metric leaked")

    if contains_numeric_claim_not_in_allowlist(rendered_report, allowlist):
        return SurfaceDecision(status="FAIL", reason="Field outside allowlist")

    return SurfaceDecision(status="PASS")
```

## 12. Implementation note

The publish gate must be **deterministic** and must execute **before** any LLM narrative is rendered.  
The surface validation layer must execute **after** rendering and must also be deterministic.  
Narrative generation must inspect gate outputs and the surface allowlist, not influence them.
