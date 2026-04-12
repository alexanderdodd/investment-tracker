# RALPH Loop Iteration 7 — Changes

**Date:** 2026-04-12
**Ticker:** MU (Micron Technology, Inc.)

## Summary

This iteration addresses the expert review findings from iteration 6. The core issue was that the rendered report leaked denied fields (ROE, ROIC, interest coverage, normalized FCF, cycle confidence) even though the suppression audit correctly identified them as denied. The root cause: the narrative LLM prompt included all model outputs regardless of gate state.

## Changes

### 1. NARR-001: Narrative prompt filtering by suppression audit

Modified `formatModelOutputsForPrompt` in `src/lib/valuation/narrative.ts` to accept a `suppressedFields` parameter. When the valuation is withheld, denied fields are removed from the data sent to the LLM:
- ROE, ROIC removed when `model.roe` / `model.roic` are suppressed
- Interest coverage removed when `model.interest_coverage` is suppressed
- Normalized FCF and normalized operating margin removed when `model.normalized_fcf` is suppressed
- Cycle confidence score never included (removed unconditionally)

### 2. NARR-002: Explicit denied-field instructions

Added a dynamic `DENIED FIELDS` block to the narrative prompt that explicitly lists each suppressed field by name and instructs the LLM not to compute or derive them from available data.

### 3. NARR-003/SURFACE-007: Post-render suppression assertion

Added `checkSuppressionCompliance` to `surface-scanner.ts` that cross-references every matched numeric claim against the suppression audit's denied fields. If a claim maps to a denied field, it's flagged as a suppression violation. Integrated into the pipeline with logging.

### 4. TRACE-006: Fixed null formula-trace inputs

Fixed `derived.total_cash_and_investments` trace in `formula-traces.ts` — the `long_term_investments` input was hardcoded as null. Now computed as `totalCash - cash - shortTermInvestments`.

### 5. TRACE-007: Added EV/EBITDA formula trace

Added `derived.ev_to_ebitda` trace to `formula-traces.ts`: `enterprise_value / (ttm_operating_income + ttm_depreciation_amortization)`. Now 14 total traces.

### 6. RULE-001/002: VAL-005 tagged as GATE_TRIGGER

Modified `qa-validators.ts` to prefix VAL-005 messages with `[GATE_TRIGGER]`. This resolves the contradiction where VAL-005 was PASS in the scorecard but cited as a gate failure reason. The GATE_TRIGGER status means the check correctly detected a condition that triggers a gate action — it's not a defect.

### 7. ART-CONSISTENCY: Single scan result object

All iteration artifacts now reference the same `ScanResult` object produced from a single scan run. Claim counts are consistent across all files.

## Files Changed

### Modified
- `src/lib/valuation/narrative.ts` — Prompt filtering, denied-field instructions
- `src/lib/valuation/surface-scanner.ts` — Suppression assertion (SURFACE-007), SuppressionViolation type
- `src/lib/valuation/formula-traces.ts` — Fixed null LT investments, added EV/EBITDA trace
- `src/lib/valuation/qa-validators.ts` — VAL-005 [GATE_TRIGGER] prefix
- `src/lib/generate-stock-valuation.ts` — Pass suppressedFields to narrative, pass audit to scanner

## Test Results

| Test | Result |
|------|--------|
| Type check (`tsc --noEmit`) | PASS |
| Golden fixture | 19/19 PASS |
| Broken fixture | 10/10 PASS |
| Full pipeline | PASS |
| Surface scan — claim matching | PASS (29/29) |
| Surface scan — period labels | PASS (0 violations) |
| Surface scan — suppression (SURFACE-007) | PASS (0 denied-field leaks) |
| Denied-field text scan | ROE: false, ROIC: false, IntCov: false, NormFCF: false, CycleConf: false |
| Gate decision | PUBLISH_FACTS_ONLY |
| Gate reasons | VAL-005 [GATE_TRIGGER] x2, VAL-004 [FAIL] |

## All Acceptance Criteria: 41/41 PASS
