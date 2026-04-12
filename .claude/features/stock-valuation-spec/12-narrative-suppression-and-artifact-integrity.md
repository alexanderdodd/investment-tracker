# Narrative suppression and artifact integrity

## 1. Problem statement

As of iteration 6, the pipeline has correct deterministic facts and a functioning publish gate, but the rendered report still leaks fields that the suppression audit explicitly denies. Additionally, the supporting artifacts contain internal contradictions that undermine confidence in the "all pass" claim.

This document specifies the requirements for:
- render-time narrative suppression (the narrative LLM must not see or output denied fields)
- rule-ID semantic stability (a rule cannot be both PASS and cited as a failure reason)
- formula-trace completeness (every surfaced derived metric must have a complete trace)
- post-render suppression assertion (a hard check that no denied field appears in the final output)

## 2. Root causes

### 2a. Narrative prompt feeds denied fields to the LLM

The `formatModelOutputsForPrompt` function unconditionally includes all model outputs in the LLM prompt — ROE, ROIC, interest coverage, normalized FCF, cycle confidence, debt/EBITDA — regardless of gate state. The LLM then naturally references these values in its output.

**Fix:** The narrative prompt must be filtered by the suppression audit. If a field is in `suppressedFields`, it must not appear in the data provided to the LLM. The LLM cannot suppress what it can see.

### 2b. No post-render assertion

The surface scanner (iteration 6) checks that numeric claims map to *known* values, but it does not check whether those values are *allowed* by the current gate state. A value can be known (it exists in canonical facts) but denied (the suppression audit says it cannot appear).

**Fix:** Add a post-render assertion that cross-references every matched claim against the suppression audit's denied list.

### 2c. Rule-ID contradiction (VAL-005)

VAL-005 appears as PASS in the evaluation scorecard but is also cited in the report header and suppression audit as a reason for withholding the valuation. This happens because VAL-005 fires as a *gate reason* (cycle divergence detected → withhold valuation) but is scored as PASS (the check correctly identified peak cycle). The semantics are ambiguous.

**Fix:** Separate "detection correctness" from "gate contribution." If a rule contributes to a gate withhold, it should not also appear as PASS in the evaluation scorecard. Either:
- Score it as INFO/WARN (detected correctly, contributed to withhold), or
- Score it as PASS but never cite it as a "failure reason" in the gate output

### 2d. Formula-trace gaps

Two specific issues:
1. `derived.total_cash_and_investments` trace shows `balance_sheet.long_term_investments` as null, even though the result includes that value.
2. EV/EBITDA is surfaced in the report but has no entry in `formula-traces.json`.

**Fix:** Tighten the trace builder to (a) never show null for an input that contributed to the result, and (b) include every metric the valuation engine computes, including EV/EBITDA.

## 3. Specification: Narrative prompt filtering

### Mandatory contract

Before constructing the narrative prompt, the system must:

1. Compute the suppression audit (already happens).
2. Build a **prompt-safe data object** that excludes all denied fields.
3. Pass only the prompt-safe data object to the LLM.

### Denied-field exclusion rules

When gate state is `PUBLISH_FACTS_ONLY`:

| Field category | Included in prompt? | Reason |
|---|---|---|
| Class A facts (revenue, margins, EPS, cash flow, balance sheet) | Yes | Authoritative facts, always safe |
| Class B derivations with passing traces (market cap, EV, P/E, P/B) | Yes | Deterministically validated |
| Market multiples (P/E, P/B, EV/EBITDA, EV/Revenue, EV/FCF) | Yes | Derived from reconciled facts |
| Model: ROE | **No** | Depends on TRACE-004; Class C when valuation withheld |
| Model: ROIC | **No** | Depends on TRACE-004; Class C when valuation withheld |
| Model: interest coverage | **No** | Depends on TRACE-004; Class C when valuation withheld |
| Model: normalized FCF | **No** | Depends on VAL-002; Class C |
| Model: cycle confidence score | **No** | Class C; implies valuation usability |
| Model: normalized operating margin | **No** | Depends on VAL-002; Class C |
| Valuation: DCF, scenarios, verdict | **No** | Already handled; Class C |

### Implementation

```typescript
function formatModelOutputsForPrompt(
  model: FinancialModelOutputs,
  suppressedFields: string[]
): string {
  const suppressed = new Set(suppressedFields);
  const f = (v: number | null, decimals = 2) => v !== null ? v.toFixed(decimals) : "N/A";
  const fPct = (v: number | null) => v !== null ? `${(v * 100).toFixed(1)}%` : "N/A";

  let text = `FINANCIAL MODEL OUTPUTS\n`;
  text += `  Cycle State: ${model.cycleState}\n`;
  text += `  Cash Conversion: ${f(model.cashConversionRatio)}x\n`;

  if (!suppressed.has("model.roe"))
    text += `  ROE: ${fPct(model.roe)}\n`;
  if (!suppressed.has("model.roic"))
    text += `  ROIC: ${fPct(model.roic)}\n`;

  text += `  Debt/Equity: ${f(model.debtToEquity)}\n`;

  if (!suppressed.has("model.interest_coverage"))
    text += `  Interest Coverage: ${f(model.interestCoverage)}x\n`;

  text += `  Capex Intensity: ${fPct(model.capexIntensity)}\n`;
  text += `  SBC/Revenue: ${fPct(model.sbcAsPercentOfRevenue)}\n`;

  if (!suppressed.has("model.normalized_fcf")) {
    text += `  Normalized Op Margin: ${fPct(model.normalizedOperatingMargin)}\n`;
    text += `  Normalized FCF: ${model.normalizedFCF !== null ? `$${(model.normalizedFCF / 1e9).toFixed(2)}B` : "N/A"}\n`;
  }

  // Never include cycle confidence score in prompt — it implies valuation usability
  // text += `  Cycle Confidence: ${f(model.cycleConfidence, 1)}\n`;

  return text;
}
```

### Narrative instruction reinforcement

When valuation is withheld, the narrative instructions must explicitly list the denied fields:

```
DENIED FIELDS — DO NOT MENTION THESE IN YOUR REPORT:
- Normalized free cash flow or normalized FCF
- Cycle confidence score or cycle confidence level
- ROE (return on equity) or ROIC (return on invested capital)
- Interest coverage ratio
- Any fair value, target price, or valuation verdict
```

## 4. Specification: Post-render suppression assertion

### Mandatory contract

After the narrative is generated and the full report is assembled, the system must run a **suppression assertion** that:

1. Takes the suppression audit's `suppressedFields` list.
2. Takes the rendered report text.
3. For each denied field, checks whether its value appears in the report.
4. If any denied field value is found, the assertion **fails**.

### Failure behavior

If the suppression assertion fails:
- The pipeline must log the violation with field name, value, and location.
- The pipeline must either:
  - (a) Downgrade the gate to `WITHHOLD_ALL` and emit diagnostic-only output, or
  - (b) Re-run the narrative with the offending fields explicitly removed from the prompt, then re-check.
- The iteration scorecard must record this as a SURFACE-007 failure.

### New validation rule

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `SURFACE-007` | no denied-field value appears in the rendered report text | High | report |

### Implementation sketch

```typescript
function assertSuppressionCompliance(
  reportText: string,
  suppressionAudit: SuppressionAudit,
  facts: CanonicalFacts,
  model: FinancialModelOutputs
): { pass: boolean; violations: string[] } {
  const violations: string[] = [];

  // Map suppressed field names to their actual values
  const deniedValues = buildDeniedValueMap(suppressionAudit.suppressedFields, facts, model);

  for (const [field, patterns] of deniedValues) {
    for (const pattern of patterns) {
      if (reportText.includes(pattern)) {
        violations.push(`Denied field "${field}" found in report: "${pattern}"`);
      }
    }
  }

  return { pass: violations.length === 0, violations };
}
```

## 5. Specification: Rule-ID semantic stability

### Problem

A rule can currently be:
- PASS in the evaluation scorecard (the check itself ran correctly)
- Cited as a "failure reason" in the gate output (because it *detected* something that triggers a withhold)

This is confusing and internally contradictory.

### Resolution: Three-valued rule status

Extend rule status from `PASS | FAIL` to `PASS | FAIL | GATE_TRIGGER`:

| Status | Meaning |
|---|---|
| `PASS` | Rule ran, condition is satisfied, no action needed |
| `FAIL` | Rule ran, condition is NOT satisfied, this is a defect to fix |
| `GATE_TRIGGER` | Rule ran correctly, detected a condition that triggers a gate action (e.g., cycle peak detected → withhold valuation). Not a defect, but does affect the gate. |

### Application to VAL-005

VAL-005 checks whether cycle divergence is extreme enough to make DCF unreliable.

- If the check correctly identifies a cycle peak: status = `GATE_TRIGGER` (not PASS, not FAIL)
- If the check fails to detect a peak when one exists: status = `FAIL`
- If no peak condition exists: status = `PASS`

The gate output should cite `GATE_TRIGGER` rules as reasons for withholding, but they should NOT appear in "failure" counts.

### Scorecard update

The evaluation scorecard summary table should add a `Gate Trigger` column:

| Category | Passed | Gate Trigger | Fail | Total |
|----------|--------|-------------|------|-------|
| Group G | 4 | 2 | 0 | 6 |

### Gate-reason format

Gate failure reasons should distinguish between actual failures and triggers:

```
VAL-004: [FAIL] Direct peer set not deterministically sourced
VAL-005: [GATE_TRIGGER] Cycle divergence detected — margins 2.7x historical average
```

## 6. Specification: Formula-trace completeness

### Mandatory requirements

1. **No null inputs for contributing values.** If a formula trace's result depends on a value, that value must appear as a non-null input. If the value is actually zero or missing and the formula handles it (e.g., defaults to zero), the trace should say so explicitly:

```json
{
  "field": "balance_sheet.long_term_investments",
  "value": 2038000000,
  "validated": true,
  "note": "from AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"
}
```

2. **Every surfaced derived metric must have a trace.** If the valuation engine computes a metric and the narrative references it, it must be in `formula-traces.json`. Specifically, EV/EBITDA must be traced if it appears in the report:

```json
{
  "field": "derived.ev_to_ebitda",
  "formula": "enterprise_value / (ttm_operating_income + ttm_depreciation_amortization)",
  "inputs": [
    {"field": "derived.enterprise_value", "value": 467829000000, "validated": true},
    {"field": "ttm.operating_income", "value": 28094000000, "validated": true},
    {"field": "ttm.depreciation_amortization", "value": 8740000000, "validated": true}
  ],
  "period_scope": "TTM",
  "share_basis": null
}
```

3. **Trace inventory assertion.** The surface scanner should verify that every derived metric matched in the report has a corresponding entry in the formula traces. If a numeric claim matches a derived field but that field has no trace, the scanner should flag it.

### New validation rule

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `TRACE-006` | every formula trace input that contributes to the result is non-null and sourced | High | report |
| `TRACE-007` | every surfaced derived metric in the rendered report has a formula trace entry | High | report |

## 7. Specification: Artifact internal consistency

### Mandatory requirements

1. **Claim counts must be consistent.** The same surface-scan run must produce identical counts in `artifact-inventory.json`, `evaluation-scorecard.md`, and `iteration-changes.md`. All three should reference the same scan result object.

2. **Rule statuses must be consistent.** If the evaluation scorecard says a rule is PASS, no other artifact may cite that rule as a failure reason. This is enforced by the three-valued status model in section 5.

3. **Single source of truth.** The pipeline should produce a single `ScanResult` object and a single `SuppressionAudit` object per run. All artifacts must reference these objects, not independently computed values.

## 8. Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `NARR-001` | Narrative prompt filtered by suppression audit | Denied fields are not present in the LLM prompt data |
| `NARR-002` | Denied field instruction in narrative prompt | When valuation is withheld, the LLM prompt explicitly lists denied fields |
| `NARR-003` | No denied field value in rendered report | Post-render suppression assertion passes (SURFACE-007) |
| `NARR-004` | Suppression assertion failure → downgrade or re-run | If denied fields leak, pipeline either downgrades to WITHHOLD_ALL or re-generates |
| `RULE-001` | Rule-ID semantic stability | No rule is simultaneously PASS and cited as a gate failure reason |
| `RULE-002` | GATE_TRIGGER status used for cycle/history detection rules | VAL-005-type rules use GATE_TRIGGER, not PASS/FAIL |
| `TRACE-006` | No null inputs in formula traces for contributing values | Every input that contributes to a trace result is non-null |
| `TRACE-007` | Trace inventory covers all surfaced derived metrics | If a derived metric appears in the report, it has a formula trace |
| `ART-CONSISTENCY-001` | Claim counts consistent across artifacts | Same number in inventory, scorecard, and changelog |
| `ART-CONSISTENCY-002` | Rule statuses consistent across artifacts | No contradiction between scorecard and gate reasons |

## 9. Implementation priority

These four issues should be fixed in this order in the next RALPH loop iterations:

### Priority 1: Narrative prompt filtering (blocks everything else)

The LLM cannot suppress what it sees. Filter the prompt data first.

- Modify `formatModelOutputsForPrompt` to accept `suppressedFields`
- Remove denied fields from the data object before sending to LLM
- Add explicit denied-field instructions to the narrative prompt
- This is the single most impactful fix

### Priority 2: Post-render suppression assertion

Even with a filtered prompt, the LLM might hallucinate values. Add a hard assertion.

- Build `assertSuppressionCompliance` function
- Run it after narrative generation, before final report assembly
- If it fails, either downgrade or re-generate
- Wire into the surface scanner results

### Priority 3: Formula-trace tightening

Fix the two specific issues, then add the general assertion.

- Fix `total_cash_and_investments` trace to include non-null `long_term_investments`
- Add EV/EBITDA to the formula trace builder
- Add TRACE-006 and TRACE-007 validation rules
- Add trace-inventory assertion to the surface scanner

### Priority 4: Rule-ID stability and artifact consistency

Architectural cleanup to make the artifact bundle trustworthy.

- Add `GATE_TRIGGER` status to the rule result schema
- Update VAL-005 to use GATE_TRIGGER instead of PASS
- Ensure all artifacts reference the same scan result object
- Add consistency checks to the artifact writer
