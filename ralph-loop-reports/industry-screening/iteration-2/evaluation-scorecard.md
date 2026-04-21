# Evaluation Scorecard — Iteration 2

## Focus: SCR-005 — Framework-Specific Metric Sets

### Frameworks implemented

| Framework ID | Industries | Signals Used |
|-------------|-----------|-------------|
| `cyclical_semiconductor_memory_v1` | Semiconductors | EV/EBIT, EV/EBITDA, EV/EBITDA history, P/B+ROE (no fwd P/E) |
| `consumer_beverages_v1` | Beverages | Fwd P/E, EV/EBITDA, FCF yield, margin durability |
| `property_casualty_insurance_v1` | Insurance | Fwd P/E (0.80x), EV/EBITDA, P/B+ROE (0.85x) |
| `interactive_media_v1` | Interactive Media | Fwd P/E, EV/EBIT, EV/EBITDA, margin durability |
| `default` | All others | All 5 generic signals |

### Benchmark Results

| Ticker | Industry | Framework | State | Signals | Correct? |
|--------|----------|-----------|-------|---------|----------|
| MU | Semiconductors | cyclical_semiconductor | SCREEN_PASS | 3 | ✓ (not published — label=expensive) |
| KO | Beverages | consumer_beverages | WATCHLIST_ONLY | 0 | ✓ (not cheap vs peers) |
| ALL | Insurance | property_casualty_insurance | PUBLISHED_VALUE_CANDIDATE | 2 | ✓ (cheap + artifact + peers) |
| META | Interactive Media | interactive_media | SCREEN_PASS | 4 | ✓ (cheap but artifact withheld) |

### Framework-specific improvements

- **META**: 2→4 signals (EV/EBIT and margin durability added by interactive_media framework)
- **PINS**: Now NEEDS_DEEP_WORK (was WATCHLIST_ONLY) — interactive_media framework revealed cheapness
- **ALL**: Maintained PUBLISHED_VALUE_CANDIDATE after fixing insurance framework to keep EV/EBITDA as supplementary

### Regression caught and fixed

ALL initially regressed to WATCHLIST_ONLY when insurance framework disabled EV/EBITDA. Fixed by keeping EV/EBITDA as supplementary signal — insurance P/B+ROE is primary, not exclusive.

## Summary

- SCR-005: **PASS** (4 framework-specific signal sets + default)
- 4/4 benchmark packs pass
- Negative controls pass
- Existing 30/30 validation: no regression
- 0 candidate publication leaks
