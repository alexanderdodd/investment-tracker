# Peer Registry Creation — Iteration 02 Changes

## Fix: Peer multiples waterfall acceptance threshold

Yahoo Finance's quoteSummary endpoint now requires auth (crumb), so market cap and P/E/P/B were always null for peers. The waterfall was checking `marketCap > 0` which always failed.

Fixed to accept market data results with `usableMultipleCount >= 1` — having a current price (from the chart API which still works) counts as usable.

## Result
- KO: 8 peers discovered, 8 usable, 75% confidence (was 0 usable)
- MU: Unchanged (curated override still works)
- All regression tests pass
