# RALPH Loop — Stock Valuation Pipeline (vNext)

You are executing the RALPH loop (Reconcile → Audit → Localize → Patch → Harden) for the stock valuation pipeline.

## Spec and Context

1. Read the full spec at `.claude/features/stock-valuation-spec/`.
2. Start with:
   - `08-prompt-for-coding-assistant.md`
   - `05-deterministic-validation-framework.md`
   - `06-publish-gate-semantics.md`
3. Read the latest iteration report in `ralph-loop-reports/` (highest-numbered `iteration-NN/evaluation-scorecard.md`) to see what is passing and failing.
4. The golden fixture is at `src/lib/valuation/__tests__/fixtures/golden-mu.json`.
5. The broken negative-control fixture must exist at `src/lib/valuation/__tests__/fixtures/golden-mu-broken.json`.
6. The golden fixture test runner is at `src/lib/valuation/__tests__/ralph-mu-test.ts`.

## Commands

- **Run golden fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts`
- **Run broken negative-control test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts`
- **Run full pipeline on MU:** `npx tsx scripts/value-stock.ts --ticker MU`
- **Type-check:** `npx tsc --noEmit`

## Each Iteration

For each iteration, do the following steps in order.

### 1. Audit — Identify the highest-priority failing rule

Read the latest evaluation scorecard. Pick the most impactful FAIL to fix. Priority order:

1. HIGH severity facts failures (Groups A–E)
2. HIGH severity report-surface failures (Groups H–I)
3. HIGH severity valuation prerequisite failures (Groups F–G)
4. Acceptance criteria failures
5. MEDIUM severity issues

### 2. Localize — Diagnose root cause

Read the relevant source code. Identify exactly which module/function/line produces the wrong output. Do not guess. Trace the data flow and the dependency graph.

### 3. Patch — Fix the code

Apply one focused patch.

If the failure is in sourcing/parsing/period/mapping/history/validation/render-policy/suppression, fix the code.  
Do **not** patch prompts for deterministic failures.

### 4. Validate — Run tests

1. Run `npx tsc --noEmit`
2. Run `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts`
3. Run `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts`
4. Run `npx tsx scripts/value-stock.ts --ticker MU`
5. Verify:
   - gate returns `PUBLISH_FACTS_ONLY` for MU frozen baseline
   - gate returns `WITHHOLD_ALL` for broken fixture
   - no valuation verdict leaks
   - no surface-allowlist violations
   - no untraced derived metrics in generated report

### 5. Report — Write iteration artifacts

Write to `ralph-loop-reports/iteration-{NN}/` (zero-padded, next number after the latest):

- `generated-report.md`
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `quarter-manifest.json`
- `formula-traces.json`
- `suppression-audit.json`
- `artifact-inventory.json`
- `negative-control-results.json`

### 6. Persist — Store DB artifacts

Persist all required runtime artifacts to Postgres:
- canonical facts
- financial model
- valuation outputs
- quality report
- research document
- structured insights
- run manifest
- quarter manifest
- formula traces
- suppression audit
- artifact inventory
- negative control results

### 7. Commit and push

Commit all changes (code + iteration report) with a descriptive message. Push to remote.

## Completion criteria

Output `<promise>RALPH COMPLETE</promise>` when:
- all evaluation rules pass, OR
- all remaining failures are expected/structural and explicitly allowed by the current release policy

Do **not** output the promise if there are fixable failures remaining.

## Known priority issues to clear first

1. **HIST-004**
   - five-year averages must match annual-history-only baseline:
     - gross margin 27.18%
     - operating margin 9.70%

2. **Surface suppression**
   - no failed-history metrics or dependent commentary in facts-only reports
   - no normalized FCF / ROE / ROIC / interest coverage without trace + allowlist

3. **Broken fixture**
   - add and validate `WITHHOLD_ALL`

4. **Artifact completeness**
   - DB + file artifacts must both exist

5. **VAL-004**
   - peer registry remains an allowed structural fail only if valuation is withheld correctly and no forbidden fields leak
