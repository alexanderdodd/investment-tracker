# Peer Registry Creation — Iteration 03 Scorecard

**Date:** 2026-04-12

## Key Result: Business-model-aware peer scoring implemented

Peers are now filtered and ranked by gross margin similarity, not just SIC code.

## Regression: 19/19 + 10/10 PASS

## Test Results

| Ticker | Peers found | Filtered | Kept | Confidence | Fair Value |
|--------|------------|----------|------|------------|------------|
| AAPL | 8 | 4 (margin gap >20pp) | 4 | 80% / 70% overall | $57-$112-$390 FAIR |
| MU | 4 dynamic + curated | 0 | 4 | 85% / 35% overall | $43-$100-$313 EXPENSIVE |
| KO | 8 | TBD | TBD | TBD | TBD |

## AAPL Peer Filtering Detail

Filtered OUT (gross margin too different from AAPL's 47%):
- FLYE: 25% GM (22pp gap)
- AXIL: 69% GM (21pp gap)
- DSNY: 84% GM (37pp gap)
- RYAM: 8% GM (39pp gap)

Kept (similar business model):
- 4 peers with gross margins within 20pp of Apple's 47%

## Scoring Weights (DECISION-003)

| Factor | Weight | Description |
|--------|--------|-------------|
| Gross margin similarity | 30% | Closest signal for business model |
| SIC code match | 25% | Industry classification |
| Market cap proximity | 20% | Size similarity |
| Data quality | 25% | Source and completeness |
