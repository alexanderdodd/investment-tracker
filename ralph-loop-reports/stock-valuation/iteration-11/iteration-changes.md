# RALPH Loop Iteration 11 — Changes

**Date:** 2026-04-12
**Feature:** Expert review fixes from iteration 10

## Summary

Implements all 4 priority fixes from the expert review plus the key risks spec.

## Changes

### 1. Report-gate consistency assertion (RENDER-001..003)
Added hard assertion in `generate-stock-valuation.ts` that checks the assembled report contains: FAIR VALUE ASSESSMENT header, fair value range, label, confidence rating, and at least one confidence reason. If value gate says publish but report lacks these, logs an error.

### 2. Reverse DCF removed from midpoint (RDCF-001..005)
- Set `reverse_dcf` weight to 0 in `DEFAULT_WEIGHTS`
- Renormalized: DCF 55%, relative 30%, self-history 15%
- Updated method disagreement to compare only contributing methods
- Updated range computation to use only contributing method values
- Impact: midpoint dropped from $144.98 to $99.20, high dropped from $375.38 to $260.63

### 3. Peer confidence recalibrated (PEER-CAL-001..003)
- Samsung conglomerate penalty increased from 0.35 to 0.45
- Added -0.15 penalty for curated-only multiples
- Capped relative confidence at 0.65 when all peers use curated snapshots
- Peer-quality weakness now appears in confidence reasons
- Impact: relative confidence dropped from 0.88 to 0.65, overall confidence from 40% to 25%

### 4. Deterministic key risks (RISK-001..003)
- Replaced QA-issue-based key risks with deterministic risk derivation
- Derives from: cycle state, margin reversion, valuation uncertainty, capital intensity, industry cyclicality, leverage
- MU at peak now shows 5 risks (was 0)

## Test Results

| Test | Result |
|------|--------|
| Golden fixture | 19/19 PASS |
| Broken fixture | 10/10 PASS |
| Valuation verdict | 11/11 PASS |
| Type check | PASS |
| Full pipeline | PASS |
| RENDER-001 | PASS (report contains fair value section) |
