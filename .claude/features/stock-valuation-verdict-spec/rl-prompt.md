# RALPH Loop — Stock Valuation Verdict (Next Feature)

You are executing the RALPH loop for the valuation verdict feature — the next phase beyond facts-only reports.

## Core question

> Can this feature publish a fair-value conclusion for MU that I would trust?

## Spec and Context

1. Read the full spec at `.claude/features/stock-valuation-verdict-spec/`.
2. Start with:
   - `13-prompt-for-coding-assistant.md`
   - `08-ralph-loop-specification-valuation-publication.md`
   - `09-validation-framework-and-thresholds.md`
   - `05-peer-registry-and-relative-framework.md`
3. The existing facts-first spec is at `.claude/features/stock-valuation-spec/` — this new feature builds on top of it.
4. Read the latest iteration report in `ralph-loop-reports/` (highest-numbered `iteration-NN/evaluation-scorecard.md`) for baseline status.
5. The golden fixture is at `src/lib/valuation/__tests__/fixtures/golden-mu.json`.
6. The golden fixture test runner is at `src/lib/valuation/__tests__/ralph-mu-test.ts`.

## Commands

- **Run golden fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts`
- **Run broken fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts`
- **Run full pipeline on MU:** `npx tsx scripts/value-stock.ts --ticker MU`
- **Type-check:** `npx tsc --noEmit`

## Milestone A — Fair Value Publication

Get MU to `PUBLISH_FACTS_PLUS_VALUE` with:
- fair value range (`low`, `mid`, `high`)
- valuation label (`CHEAP`, `FAIR`, `EXPENSIVE`)
- valuation confidence score

### Required for Milestone A

1. **Peer / relative framework** — deterministic registry for MU
   - Primary peers: SK hynix (000660.KS), Samsung (005930.KS)
   - Secondary peers: WDC, and self-history
   - Provenance, roles, quality flags, weighting penalties
   - See `05-peer-registry-and-relative-framework.md`

2. **Valuation method stack** — all four methods for MU
   - Normalized FCFF DCF (primary)
   - Reverse DCF (primary)
   - Relative valuation via peer framework (secondary)
   - Self-history valuation (secondary)
   - See `04-mu-valuation-workflow.md`

3. **Fair value synthesis** — combine methods into a range
   - `low`, `mid`, `high` with method weights
   - See `06-fair-value-synthesis-and-labeling.md`

4. **Valuation labeling** — derive from price vs range
   - `CHEAP` if price < low
   - `FAIR` if low ≤ price ≤ high
   - `EXPENSIVE` if price > high
   - See `06-fair-value-synthesis-and-labeling.md`

5. **Value gate** — new third gate
   - Facts gate must pass first
   - At least 2 valid methods must produce results
   - Fair value midpoint must be positive
   - Always publishes value when methods work — does NOT withhold on low confidence
   - Instead, includes explicit confidence rating (HIGH/MEDIUM/LOW) with reasons
   - Range width, method disagreement, and confidence score are informational, not hard blocks

6. **Validation groups K, L, M** — peer, method, and publishability checks
   - See `08-ralph-loop-specification-valuation-publication.md`

## Milestone B — Action Publication (after A)

Get MU to `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION` with:
- action label (`BUY_ZONE`, `ACCUMULATE`, `HOLD`, `TRIM`, `SELL_ZONE`)
- conditional thresholds
- thesis-break triggers
- See `07-buy-sell-action-framework.md`

## Each Iteration

### 1. Audit — Identify the highest-priority failing rule

Read the latest evaluation scorecard. Priority order:
1. Existing facts regression failures (Groups A–J) — must not regress
2. Peer / relative framework failures (Group K)
3. Valuation method failures (Group L)
4. Valuation publishability failures (Group M)
5. Calibration failures (Group O)
6. Action failures (Group N) — only after Milestone A

### 2. Localize — Diagnose root cause

Read the relevant source code. Trace data flow. Do not guess.

### 3. Patch — Fix the code

Apply one focused patch. Do not patch prompts for deterministic failures.

### 4. Validate — Run tests

1. `npx tsc --noEmit`
2. `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts` (must still pass 19/19)
3. `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts` (must still pass 10/10)
4. `npx tsx scripts/value-stock.ts --ticker MU`
5. Verify:
   - existing facts gate still passes
   - new value gate behavior is correct
   - fair value range is reproducible
   - valuation label is mechanically derived
   - no forbidden fields leak in any withheld state
   - SURFACE-007 suppression assertion passes

### 5. Report — Write iteration artifacts

Write to `ralph-loop-reports/iteration-{NN}/`:
- `generated-report.md`
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `quarter-manifest.json`
- `formula-traces.json`
- `suppression-audit.json`
- `artifact-inventory.json`
- `negative-control-results.json`
- `peer-registry.json` (NEW)
- `valuation-methods.json` (NEW)
- `fair-value-synthesis.json` (NEW)

### 6. Persist — Store DB artifacts

Persist all required artifacts to Postgres.

### 7. Commit and push

## Completion criteria

Output `<promise>RALPH COMPLETE</promise>` when:
- Milestone A is achieved: MU publishes fair value range + label
- All existing facts regression tests still pass
- All new validation groups (K, L, M) pass
- Calibration checks pass (Group O)
- No forbidden leaks in any state

Do **not** output the promise if there are fixable failures remaining.

## Known priority issues

1. **VAL-004 / Peer registry** (FIRST PRIORITY)
   - No peer registry exists yet — this blocks everything
   - Build deterministic peer/relative framework for MU
   - SK hynix, Samsung (with conglomerate penalty), WDC, self-history
   - See `05-peer-registry-and-relative-framework.md`

2. **Valuation method stack** (SECOND PRIORITY)
   - Current valuation engine exists but methods need refinement for publication
   - Normalized FCFF DCF with cycle-adjusted inputs
   - Reverse DCF interpretation
   - Relative valuation from peer framework
   - Self-history comparison

3. **Fair value synthesis** (THIRD PRIORITY)
   - Combine method outputs into `low`, `mid`, `high`
   - Weighted by method confidence and data quality
   - Range width check (≤ 40% of midpoint)

4. **Value gate** (FOURTH PRIORITY)
   - Add third gate stage after facts gate and before action gate
   - Enforce range width, method disagreement, confidence thresholds

5. **Calibration** (FIFTH PRIORITY)
   - Expert-reviewed envelope for MU fair value
   - Historical snapshot directional sanity
   - Sensitivity stability
