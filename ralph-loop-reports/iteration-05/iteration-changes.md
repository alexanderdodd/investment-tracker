# RALPH Loop Iteration 5 — Changes and Comparison

**Date:** 2026-04-12
**Ticker:** MU (Micron Technology, Inc.)
**Prior iteration:** Iteration 4 (18/18 golden, 10/10 broken, vNext Groups H/I/J not implemented)

---

## Patch Summary

Implements the three major vNext feature groups:

1. **Formula traces (Group H)** — `src/lib/valuation/formula-traces.ts`
2. **Surface allowlist + suppression audit (Group I)** — `src/lib/valuation/surface-allowlist.ts`
3. **Full iteration bundle artifacts (Group J)** — All 9 required files now written

## Files Created

### `src/lib/valuation/formula-traces.ts` (new)
- `FormulaTrace` type with field, formula, result, inputs (with validated flag), period scope, share basis
- `buildFormulaTraces()` generates 13 traces for all derived metrics: market cap, EV, P/E, BVPS, P/B, EV/Revenue, EV/EBIT, EV/FCF, FCF, total cash, total debt, ROE, ROIC
- `hasTrace()` and `traceFullyValidated()` helpers

### `src/lib/valuation/surface-allowlist.ts` (new)
- Publication class system: A (authoritative), B (derived), C (model/valuation), D (evidence)
- `FIELD_REGISTRY` with 41 classified fields, each with dependencies on validator rules
- `ALLOWED_CLASSES_BY_STATE` mapping gate states to allowed classes
- `buildSurfaceAllowlist()` produces allowlist + suppression audit
- Dependency-aware suppression: if HIST-004 fails → suppress 5Y averages; if VAL-002 fails → suppress normalized FCF; if TRACE-004 fails → suppress ROE/ROIC/interest coverage

### `src/lib/generate-stock-valuation.ts` (modified)
- Imports and calls `buildFormulaTraces()` and `buildSurfaceAllowlist()` after QA
- Collects failed rule IDs for suppression audit

## Files Written to Iteration Bundle

All 9 vNext-required files:
- `generated-report.md` — full pipeline output
- `iteration-changes.md` — this file
- `evaluation-scorecard.md` — pass/fail for all groups
- `run-manifest.json` — reproducibility metadata
- `quarter-manifest.json` — TTM quarter lineage
- `formula-traces.json` — 13 formula traces
- `suppression-audit.json` — 10 suppressed fields with reasons
- `artifact-inventory.json` — file and DB artifact listing
- `negative-control-results.json` — 10/10 broken fixture results

## Comparison vs Previous Iteration

| Metric | Iteration 4 | Iteration 5 | Change |
|--------|-------------|-------------|--------|
| Golden fixture | 18/18 | 18/18 | No regression |
| Broken fixture | 10/10 | 10/10 | No regression |
| Formula traces | 0 | 13 | **New** |
| Surface allowlist | Not built | 31 allowed, 10 denied | **New** |
| Suppression audit | Not built | 10 fields suppressed | **New** |
| Iteration bundle files | 3 (md only) | 9 (full vNext set) | **New** |

## Net Result

- **0 regressions**
- **Group H**: Formula traces implemented (13 traces)
- **Group I**: Surface allowlist + suppression audit implemented
- **Group J**: Full iteration bundle with all 9 required files
