# Peer Registry Creation — Iteration 03 Changes

## Summary
Implemented DECISION-003: business-model-aware peer scoring. Peers are now scored and filtered by gross margin similarity, preventing companies with fundamentally different business models from contaminating the relative valuation.

## Changes

### `peer-quality.ts` — Multi-signal scoring
- Added `scoreGrossMarginSimilarity()` — scores 1.0 for <5pp difference down to 0.15 for >20pp
- Hard filter: peers with gross margin >20pp different from subject are excluded entirely
- New weights: gross margin 30%, SIC 25%, market cap 20%, data quality 25%
- `PeerQualityScore` now includes `grossMarginSimilarity` factor and `filtered` flag

### `peer-multiples.ts` — Added grossMargin and ttmRevenue to PeerMultiples
- EDGAR-fetched peers now include gross margin and revenue for scoring
- Pipeline DB and market data channels also populate these fields

### `peer-registry.ts` — Passes subject gross margin to scorer
- `buildPeerRegistry()` accepts `subjectGrossMargin` parameter
- Filtered peers are logged with reason
- Quality computation uses only non-filtered peers

### `generate-stock-valuation.ts` — Computes subject gross margin
- Calculates subject's TTM gross margin from canonical facts
- Passes to `buildPeerRegistry()` for similarity scoring

## Impact
- AAPL: 4 of 8 SIC peers filtered out for margin dissimilarity, confidence 70% (was ~55%)
- MU: Curated override still works, slight fair value shift from dynamic peer contribution
- All regression tests pass
