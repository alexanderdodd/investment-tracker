# Iteration 1 — Changes

## What was built

### 1. Schema: `industry_screen_result` table
**File:** `src/db/schema.ts`

New table with:
- 5 screen states (SCREEN_PASS, NEEDS_DEEP_WORK, PUBLISHED_VALUE_CANDIDATE, WATCHLIST_ONLY, EXCLUDED_VALUE_TRAP_RISK)
- Stage C cheapness signals (industry-relative ratios)
- Stage D quality signals (6 boolean dimensions)
- Quality score (0-100 weighted composite)
- Trap flags (string array)
- Artifact linkage (valuation + peer + published status)
- Candidate gate fields (label, confidence, publishable flag)
- Composite score for ranking

### 2. Screen engine: `src/lib/industry-screen.ts`

**Stage C — Industry-Relative Cheapness (2-of-5 signals):**
- Fwd P/E <= 0.85x industry median
- EV/EBITDA <= 0.85x industry median
- EV/EBITDA <= 0.80x median (5Y percentile proxy)
- P/B <= 0.80x median AND ROE >= threshold
- FCF yield >= median + 2pp (placeholder — needs market cap per stock)

**Stable-fundamentals modifier:** Revenue growth > -10%, operating margin > -5%

**Stage D — Quality Filter (6-dimension weighted):**
- 20% leverage (negative book value = hard blocker)
- 20% liquidity (placeholder — no current ratio data yet)
- 20% margin stability (operating margin checks)
- 15% dilution (placeholder — no share count data yet)
- 15% cash conversion (positive FCF check)
- 10% returns (ROIC/ROE thresholds)

Hard blockers: negative book value, negative operating margin

**State assignment logic:**
- EXCLUDED_VALUE_TRAP_RISK: cheap but fails quality (hard blocker)
- WATCHLIST_ONLY: not cheap or fundamentals deteriorating
- PUBLISHED_VALUE_CANDIDATE: all gates pass (cheap + quality + published artifact + peers + confidence >= 0.65)
- NEEDS_DEEP_WORK: cheap + quality OK but missing artifacts
- SCREEN_PASS: cheap + quality OK + has artifacts but not enough for publication

### 3. Runner: `scripts/run-industry-screen.ts`
- Supports `--sector` flag for single-sector runs
- Prints summary by state + detailed results for non-WATCHLIST

### 4. npm script: `npm run run-industry-screen`

## What was NOT built (yet)

- Stage A universe reduction (market cap, liquidity, filing freshness filters)
- Stage B industry triage (hunting-ground score formula)
- Stage E deep work (LLM analysis)
- Framework-specific metric sets per industry type
- 5Y historical percentile computation (using proxy)
- FCF yield per stock (needs market cap data)
- Dilution tracking (needs share count history)
- Liquidity assessment (needs current ratio)
- UI updates for new screen states
- Industry page screen runner integration

## Results

| State | Count |
|-------|-------|
| PUBLISHED_VALUE_CANDIDATE | 2 (ALL, KDP) |
| SCREEN_PASS | 3 (MU, PEP, META) |
| NEEDS_DEEP_WORK | 34 |
| EXCLUDED_VALUE_TRAP_RISK | 2 (HRB, ZIM) |
| WATCHLIST_ONLY | 153 |

Benchmark regression: 30/30 existing validation rules pass.
