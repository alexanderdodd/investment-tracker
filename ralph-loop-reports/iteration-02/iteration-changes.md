# RALPH Loop Iteration 2 — Changes and Comparison

**Date:** 2026-04-11
**Ticker:** MU (Micron Technology, Inc.)
**Prior iteration:** Iteration 1 (16/16 deterministic facts passing, but no publish gate)

---

## Patch Summary

This iteration implements the **two-stage publish gate** from the v4 spec. The core problem was that iteration 1 validated deterministic facts correctly (16/16) but the pipeline still published a full valuation verdict with fair value ($195.36), confidence (75%), and margin of safety (-53.6%) — violating the spec requirement that MU should be `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`.

## Root Cause

The pipeline had no concept of a two-stage gate:
1. The QA validators only checked for basic data integrity issues
2. There was no valuation-prerequisite gate checking cycle normalization, peer sets, or margin divergence
3. The orchestrator always generated narrative with full valuation details
4. The structured insights always included verdict, intrinsic value, and margin of safety
5. The LLM received DCF values and produced a narrative containing fair value numbers even when the gate should have withheld

## Files Modified

### `src/lib/valuation/types.ts`
- Added `PublishGateStatus` type: `WITHHOLD_ALL | PUBLISH_FACTS_ONLY | PUBLISH_WITH_WARNINGS | PUBLISH_FULL`
- Added `GateDecision` interface with `factsPublishable`, `valuationPublishable`, `valuationConfidence`, and failure lists
- Added `gateDecision` field to `QaReport` interface

### `src/lib/valuation/qa-validators.ts` (full rewrite)
- Implemented two-stage publish gate per spec section 06
- Gate 1 (Facts): source completeness, TTM consistency, ratio formulas, balance sheet integrity
- Gate 2 (Valuation): cycle/history prerequisites, DCF integrity, peer set availability
- Added `validateCycleAndHistoryForValuation()`: checks margin divergence ratios and peer set status
- Added `validateBalanceSheet()`: checks for null equity and cash
- Rule IDs now match spec (SRC-001, TTM-001, MULT-001, etc.)
- `computeGateDecision()` returns proper gate status based on both stages

### `src/lib/generate-stock-valuation.ts`
- Orchestrator now reads `qaReport.gateDecision` and branches:
  - `WITHHOLD_ALL`: diagnostic-only narrative, no valuation section
  - `PUBLISH_FACTS_ONLY`: narrative generated WITHOUT valuation outputs, withheld banner in report
  - `PUBLISH_WITH_WARNINGS` / `PUBLISH_FULL`: full report as before
- Report header now shows gate status label (e.g., `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`)
- **Leak prevention**: when valuation is withheld, structured insights are scrubbed:
  - `intrinsicValue = null`
  - `marginOfSafety = null`
  - `verdict = "Withheld"`
  - `confidence = "N/A"`
  - `bullCase = bearCase = baseCase = "Withheld"`

### `src/lib/valuation/narrative.ts`
- When `qa.gateDecision.valuationPublishable === false`, the narrative prompt:
  - Does NOT receive DCF value, margin of safety, verdict, or scenarios
  - Receives explicit instructions to NOT mention fair value, target price, or investment conclusions
  - Only receives market multiples (P/E, P/B, EV/EBITDA) which are derived from reconciled facts
  - Instructs LLM to write a "facts and analysis" report, not a valuation report

### `src/lib/stock-valuation-insights.ts`
- Added `"Withheld"` to verdict union type
- Added `"N/A"` to confidence union type

## Comparison vs Previous Iteration

| Metric | Iteration 1 | Iteration 2 | Change |
|--------|-------------|-------------|--------|
| Deterministic facts (golden fixture) | 16/16 PASS | 16/16 PASS | No regression |
| Pipeline status | `published` | `published_with_warnings` (gate: `PUBLISH_FACTS_ONLY`) | Fixed |
| Gate: facts publishable | Not checked | `true` | New |
| Gate: valuation publishable | Not checked | `false` | New |
| Report contains fair value | Yes ($195.36) | No | Fixed |
| Report contains margin of safety | Yes (-53.6%) | No | Fixed |
| Report contains verdict | Yes (Highly Uncertain) | Withheld | Fixed |
| Structured insights: intrinsicValue | $195.36 | `null` | Fixed |
| Structured insights: marginOfSafety | -53.6% | `null` | Fixed |
| Structured insights: verdict | Fair Value | Withheld | Fixed |
| Narrative mentions DCF fair value | Yes | No | Fixed |
| Valuation gate failures | None (no gate) | VAL-004: peer set not sourced | New |

## Net Result

- **0 regressions** in deterministic fact validation
- **6 new publish-safety violations fixed** (verdict, fair value, margin of safety, confidence, scenarios, DCF value leak)
- Gate correctly returns `PUBLISH_FACTS_ONLY` for MU at peak cycle
