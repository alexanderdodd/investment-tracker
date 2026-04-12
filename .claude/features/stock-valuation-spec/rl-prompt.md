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
   - **no denied-field values in rendered report** (SURFACE-007 assertion)
   - **no null inputs in formula traces for contributing values** (TRACE-006)
   - **every surfaced derived metric has a formula trace** (TRACE-007)
   - **no rule is PASS in scorecard and cited as gate failure reason**
   - **claim counts are consistent across all artifacts**

### 5. Report — Write iteration artifacts

Write to `ralph-loop-reports/stock-valuation/iteration-{NN}/` (zero-padded, next number after the latest):

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

1. **HIST-004** (RESOLVED in iteration 4)
   - five-year averages must match annual-history-only baseline:
     - gross margin 27.18%
     - operating margin 9.70%

2. **Surface suppression** (RESOLVED in iteration 5)
   - no failed-history metrics or dependent commentary in facts-only reports
   - no normalized FCF / ROE / ROIC / interest coverage without trace + allowlist

3. **Broken fixture** (RESOLVED in iteration 5)
   - add and validate `WITHHOLD_ALL`

4. **Artifact completeness** (RESOLVED in iteration 5)
   - DB + file artifacts must both exist

5. **TRACE-003 / SURFACE-005 / SURFACE-006** (RESOLVED in iteration 6)
   - render-time surface scanner validates all numeric claims in narrative
   - period-label consistency check automated

6. **Narrative suppression leak** (ACTIVE — HIGHEST PRIORITY)
   - See `12-narrative-suppression-and-artifact-integrity.md` for the full spec
   - The LLM narrative still surfaces denied fields (ROE, ROIC, interest coverage,
     normalized FCF, cycle confidence) because the prompt feeds them all model outputs
   - **Priority 1:** Filter `formatModelOutputsForPrompt` by suppression audit —
     do not feed denied fields to the LLM at all
   - **Priority 2:** Add post-render suppression assertion (SURFACE-007) — hard-fail
     if any denied field value appears in the rendered report
   - **Priority 3:** Add explicit denied-field instructions to the narrative prompt
   - New acceptance criteria: NARR-001 through NARR-004

7. **Formula-trace completeness** (ACTIVE)
   - `total_cash_and_investments` trace shows null for `long_term_investments`
     even though the value contributes to the result — fix the trace builder
   - EV/EBITDA is surfaced in the report but has no formula trace entry — add it
   - Add TRACE-006 (no null inputs for contributing values) and TRACE-007
     (trace inventory covers all surfaced derived metrics)
   - Every surfaced derived metric in the report must have a matching trace

8. **Rule-ID semantic stability** (ACTIVE)
   - VAL-005 is simultaneously PASS in scorecard and cited as a gate failure reason
   - Add `GATE_TRIGGER` status: rule ran correctly and detected a condition that
     triggers a gate action (not a defect, but affects the gate)
   - VAL-005 should be `GATE_TRIGGER`, not PASS, when it detects cycle peak
   - Gate reasons must distinguish `[FAIL]` from `[GATE_TRIGGER]`
   - New acceptance criteria: RULE-001, RULE-002

9. **Artifact internal consistency** (ACTIVE)
   - Surface-scan claim counts differ across artifacts (45 vs 42)
   - All artifacts must reference the same scan result object
   - New acceptance criteria: ART-CONSISTENCY-001, ART-CONSISTENCY-002

10. **VAL-004 — Peer registry** (QUEUED — after items 6-9)
    - See `11-peer-registry-specification.md` for the full spec
    - Implement curated seed lists for semiconductor peers
    - Build algorithmic filtering (size, activity, data availability)
    - Fetch peer multiples (pipeline DB + market data fallback)
    - Compute peer comparison (median/mean multiples)
    - Update QA validator to use real peer check
    - New acceptance criteria: PEER-001 through PEER-012
