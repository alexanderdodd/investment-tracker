# Iteration 2 — Changes

## Patch: Framework-specific cheapness signals (SCR-005)

**File:** `src/lib/industry-screen.ts`

Added `FrameworkConfig` type and `getFrameworkConfig()` function that selects cheapness signals based on `valueFrameworkId` from the GICS taxonomy.

### Framework configurations

**Cyclical Semiconductors** (`cyclical_semiconductor_memory_v1`):
- Disables fwd P/E (unreliable at cycle peaks)
- Enables EV/EBIT as primary signal
- Uses tighter EV/EBITDA threshold (0.80x vs 0.85x default)
- Keeps P/B+ROE for capital-intensive context

**Consumer Beverages** (`consumer_beverages_v1`):
- Uses fwd P/E, EV/EBITDA (standard multiples)
- Adds margin durability signal (op margin > 12% + gross margin > 30%)
- Disables P/B (less meaningful for brand-heavy businesses)

**P&C Insurance** (`property_casualty_insurance_v1`):
- P/B+ROE as primary signal (relaxed to 0.85x threshold)
- Fwd P/E with tighter threshold (0.80x)
- EV/EBITDA as supplementary (not disabled — insurance holding companies use it)

**Interactive Media** (`interactive_media_v1`):
- All standard signals plus EV/EBIT and margin durability
- Asset-light platforms benefit from broader signal set

### Regression fix

Insurance framework initially disabled EV/EBITDA entirely, causing ALL to lose cheapness signals and drop to WATCHLIST_ONLY. Fixed by keeping EV/EBITDA as supplementary — the spec says "use P/B and ROE-style logic", not "disable everything else."

## Results

| State | Iter 1 | Iter 2 | Change |
|-------|--------|--------|--------|
| PUBLISHED_VALUE_CANDIDATE | 2 | 2 | ALL, KDP maintained |
| SCREEN_PASS | 3 | 3 | MU, PEP, META maintained |
| NEEDS_DEEP_WORK | 34 | 35 | +PINS (interactive_media framework) |
| EXCLUDED_VALUE_TRAP_RISK | 2 | 2 | HRB, ZIM maintained |
| WATCHLIST_ONLY | 153 | 152 | -1 (PINS promoted) |
