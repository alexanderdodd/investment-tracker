# Publish gate semantics

## 1. Two-stage gate

### Gate 1 — Facts gate

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

### Gate 2 — Valuation gate

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
- publish facts + derived metrics
- set `valuation_status = withheld`
- omit fair value, margin of safety, confidence score, and investment conclusion

## 2. Gate statuses

| Status | Facts | Valuation | User-visible behavior |
|---|---|---|---|
| `WITHHOLD_ALL` | failed | blocked | diagnostic artifact only |
| `PUBLISH_FACTS_ONLY` | passed | failed / withheld | publish facts, no verdict |
| `PUBLISH_WITH_WARNINGS` | passed | passed with non-critical warnings | publish full report + explicit caveats |
| `PUBLISH_FULL` | passed | passed cleanly | publish full report |

## 3. Confidence semantics

| State | Confidence field |
|---|---|
| `WITHHOLD_ALL` | `null` |
| `PUBLISH_FACTS_ONLY` | `null` for valuation |
| `PUBLISH_WITH_WARNINGS` | numeric allowed |
| `PUBLISH_FULL` | numeric allowed |

**Rule:** confidence must never imply valuation usability when the verdict is withheld.

## 4. Gate pseudocode

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

## 5. Required block conditions

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

## 6. Leak-prevention rules

When status is `WITHHOLD_ALL` or `PUBLISH_FACTS_ONLY`, the following must not appear anywhere in the user-facing report:

- fair value
- target price
- margin of safety
- valuation confidence score
- investable verdict such as undervalued, overvalued, fair value, buy, hold, or sell

## 7. Implementation note

The publish gate must be **deterministic** and must execute **before** any LLM narrative is rendered. Narrative generation must inspect gate outputs, not influence them.
