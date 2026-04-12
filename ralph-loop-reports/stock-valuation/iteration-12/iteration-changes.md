# RALPH Loop Iteration 12 — Changes

**Date:** 2026-04-12
**Feature:** Expert cleanup fixes — small targeted changes

## Changes

### 1. NARR-CLEAN: Eliminated withheld-language contamination
- Added new code path in pipeline: when `valueGate.valuePublishable` is true, narrative gets published-value instructions with fair value range, label, confidence
- Narrative LLM prompt now includes explicit "VALUATION CONTEXT — FAIR VALUE PUBLISHED" block telling LLM to reference and explain the fair value
- Added post-render assertion scanning for contradictory phrases ("cannot be determined", "valuation withheld")
- Result: narrative now discusses the fair value assessment instead of saying it's withheld

### 2. LABEL-001: De-intensified labels at low confidence
- Added rule: if `valuationConfidence < 0.35`, collapse DEEP_CHEAP → CHEAP, DEEP_EXPENSIVE → EXPENSIVE
- MU at 25% confidence now shows EXPENSIVE (was DEEP_EXPENSIVE)

### 3. RDCF-REASON: Reworded confidence reason
- Changed "Primary methods (DCF vs reverse DCF) disagree by X%" to "Contributing valuation methods disagree by X% — normalized economics, peer comparisons, and historical analysis produce different estimates"
- No longer references reverse DCF which is diagnostic-only

### 4. Surface scanner: Fixed dollar regex + added fair value values
- Fixed bug: `$36 to` was parsed as "$36 trillion" because regex `T` option matched start of "to"
- Removed ambiguous single-letter suffixes (B/M/T), now only matches "billion"/"million"/"trillion"
- Added fair value synthesis values (range, percentages, method per-share values) to known values registry

## Test Results

| Test | Result |
|------|--------|
| Golden fixture | 19/19 PASS |
| Broken fixture | 10/10 PASS |
| Valuation verdict | 11/11 PASS |
| NARR-CLEAN-001 | PASS (no withheld contamination) |
| NARR-CLEAN-002 | PASS (narrative references fair value) |
| LABEL-001 | PASS (EXPENSIVE not DEEP_EXPENSIVE at 25%) |
| RDCF-REASON-001 | PASS (no "reverse DCF" in reasons) |
| Surface scan | PASS (0 unmatched) |
