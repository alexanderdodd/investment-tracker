# RALPH Loop — Stock Valuation Pipeline

You are executing the RALPH loop (Reconcile → Audit → Localize → Patch → Harden) for the stock valuation pipeline.

## Spec and Context

1. Read the full spec at `.claude/features/stock-valuation-spec/` — start with `08-prompt-for-coding-assistant.md` for your mission, then `05-deterministic-validation-framework.md` for validation rules, and `06-publish-gate-semantics.md` for gate behavior.
2. Read the latest iteration report in `ralph-loop-reports/` (find the highest-numbered `iteration-NN/evaluation-scorecard.md`) to see what's passing and what's failing.
3. The golden fixture is at `src/lib/valuation/__tests__/fixtures/golden-mu.json`.
4. The golden fixture test runner is at `src/lib/valuation/__tests__/ralph-mu-test.ts`.

## Commands

- **Run golden fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts`
- **Run full pipeline on MU:** `npx tsx scripts/value-stock.ts --ticker MU`
- **Type-check:** `npx tsc --noEmit`

## Each Iteration

For each iteration, do the following steps in order:

### 1. Audit — Identify the highest-priority failing rule

Read the latest evaluation scorecard. Pick the most impactful FAIL to fix. Priority order:
- HIGH severity facts failures (Groups A-E)
- HIGH severity valuation prerequisite failures (Groups F-G)
- Acceptance criteria failures
- MEDIUM severity issues

### 2. Localize — Diagnose root cause

Read the relevant source code. Identify exactly which module/function/line produces the wrong output. Don't guess — trace the data flow.

### 3. Patch — Fix the code

Apply one focused patch. If the failure is in sourcing/parsing/period/mapping/validation, fix the code — do NOT patch prompts. Keep changes minimal.

### 4. Validate — Run tests

1. Run `npx tsc --noEmit` to verify compilation
2. Run `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts` — must still pass 16/16
3. Run `npx tsx scripts/value-stock.ts --ticker MU` — check gate behavior
4. Verify: gate returns `PUBLISH_FACTS_ONLY` for MU, no valuation verdict leaks

### 5. Report — Write iteration artifacts

Write to `ralph-loop-reports/iteration-{NN}/` (zero-padded, next number after the latest):

- **`generated-report.md`** — The complete generated report for MU as it would appear in the app. Extract from the database after running the pipeline. This is the most important artifact.
- **`iteration-changes.md`** — What you changed, why, and comparison vs prior iteration (which rules flipped, net delta).
- **`evaluation-scorecard.md`** — Pass/fail table for every validation rule (Groups A-G) and acceptance test, with overall summary.

### 6. Commit and push

Commit all changes (code + iteration report) with a descriptive message. Push to remote.

## Completion Criteria

Output `<promise>RALPH COMPLETE</promise>` when:
- All evaluation rules pass, OR
- All remaining failures are expected/structural (e.g., VAL-004 peer registry not yet built)

Do NOT output the promise if there are fixable failures remaining.

## Known Remaining Issues (as of last iteration)

Check the latest scorecard — these were known issues previously:
- **HIST-004**: 5Y averages mismatch — pipeline computes different values than golden fixture
- **BROKEN-FIX-001**: No intentionally broken fixture to test WITHHOLD_ALL
- **RLOOP-001**: Artifact bundle only goes to DB, not file-based
- **VAL-004**: No peer registry (expected structural fail)
