# Ralph loop specification

## 1. Definition

**RALPH = Reconcile -> Audit -> Localize -> Patch -> Harden**

This is the outer improvement loop for the workflow implementation. Its job is to take a candidate workflow revision and iterate until the workflow is safe to publish under the gate contract.

## 2. Purpose and scope

### Purpose

- improve the workflow until deterministic facts are correct
- ensure valuation logic is internally consistent
- ensure publish gating is safe
- prevent regressions with frozen golden cases, starting with Micron

### Scope

- initial scope: U.S.-listed companies with 10-Q / 10-K / iXBRL coverage
- first mandatory golden: Micron (MU)
- output types:
  - diagnostic-only artifact
  - facts-only artifact with valuation withheld
  - full report if and only if all valuation prerequisites pass

## 3. Non-negotiable contracts

### Mandatory

1. filing-first architecture
2. statement-table-first quarter extraction
3. companyfacts is reconciliation/fallback, not primary quarter selection
4. no verdict on broken facts
5. all critical numbers carry provenance
6. critical validation failures block publication
7. cyclical DCF requires adequate validated history or else must be withheld

### LLM allowed

- summarize validated facts
- extract evidence from filing text into structured fields
- propose root-cause hypotheses from failure artifacts
- red-team the narrative and assumptions

### LLM forbidden

- selecting the latest quarter
- computing TTM
- filling missing financial facts
- overriding reconciled values
- overriding gate decisions
- inventing peers, valuations, or confidence when prerequisites fail

## 4. Loop inputs

| Input | Type | Required | Notes |
|---|---|---:|---|
| `candidate_workflow_ref` | git ref / build id | Yes | exact code under test |
| `benchmark_suite` | JSON | Yes | includes MU golden fixture |
| `golden_registry` | directory / object store | Yes | frozen snapshots, expected outputs |
| `source_adapters` | config | Yes | SEC, market data, local fixtures |
| `prior_iteration_bundle` | optional path | No | for diffing |
| `loop_config` | JSON | Yes | retry limits, tolerances, thresholds |

## 5. Loop outputs

| Output | Type | Required | Purpose |
|---|---|---:|---|
| `iteration_bundle` | directory | Yes | full forensic artifact set |
| `scorecard.json` | machine-readable | Yes | rule results + scores |
| `root_cause_hypotheses.json` | machine-readable | Yes | ranked hypotheses |
| `patch_plan.md` | text | Yes | concrete next fixes |
| `candidate_patch.diff` | diff | If patched | code/config change |
| `publish_matrix.json` | machine-readable | Yes | expected vs actual gate state per benchmark |
| `acceptance_decision.json` | machine-readable | Yes | accept / retry / escalate |

## 6. State machine

```text
INIT
  ↓
SNAPSHOT_INPUTS
  ↓
RUN_CANDIDATE_ON_BENCHMARKS
  ↓
DETERMINISTIC_FACT_VALIDATION
  ├── fail → DIAGNOSTIC_ONLY_ARTIFACTS → AUDIT_FAILURES → LOCALIZE_ROOT_CAUSE
  │           ↓
  │         PATCH_CANDIDATE
  │           ↓
  │         RETEST_FAILING_CASES
  │           ↓
  │         REGRESSION_SUITE
  │           ├── regress → REJECT_PATCH
  │           └── improve → next iteration
  └── pass → VALUATION_PREREQ_VALIDATION
               ├── fail → FACTS_ONLY_WITHHELD_ARTIFACTS → AUDIT_FAILURES → LOCALIZE_ROOT_CAUSE
               │         ↓
               │       PATCH_CANDIDATE or ACCEPT_WITH_WITHHELD if expected state
               └── pass → GENERATE_NARRATIVE → RED_TEAM → FINAL_GATE
                              ├── pass → HARDEN_BASELINE → ACCEPT
                              └── fail → AUDIT_FAILURES
```

## 7. Iteration steps

### Step 0 — Freeze the run

Create a run manifest with:

- exact code ref
- benchmark ids
- source timestamps
- environment hash
- model and prompt versions

### Step 1 — Build authoritative source bundle

For each benchmark:

- discover latest 10-Q and 10-K
- download filing HTML / iXBRL / statement tables
- download market data snapshot
- store raw sources immutably

### Step 2 — Extract deterministic facts

Run:

- statement-table parser
- discrete-quarter builder
- TTM builder
- balance-sheet mapper
- share-count resolver
- market-cap / EV / multiples builder
- annual-history loader

### Step 3 — Run deterministic validators

Execute all fact validators before any modeling or narrative.

If any **critical fact rule** fails:

- mark `facts_publishable = false`
- skip valuation
- skip narrative
- emit diagnostic artifact only

### Step 4 — If facts pass, build valuation prerequisites

Run:

- cycle classifier
- history sufficiency checks
- peer-set availability checks
- market data freshness checks
- valuation math integrity checks
- scenario reasonableness checks

If any **valuation prerequisite** fails:

- mark `valuation_publishable = false`
- emit facts-only artifact with valuation withheld

### Step 5 — Generate narrative only after gates

Only if the relevant gates pass:

- LLM gets locked deterministic artifacts
- LLM may explain but not alter numbers
- red-team LLM may challenge but not recompute

### Step 6 — Audit failures

Build a structured failure graph:

- failed rule ids
- affected fields
- observed vs expected values
- provenance paths
- benchmark diffs
- whether regression introduced new failures

### Step 7 — Localize root cause

Use:

- deterministic pattern matching against known failure signatures
- then LLM diagnosis over the structured failure graph

Output ranked hypotheses with:

- likelihood
- supporting evidence
- likely module(s)
- recommended fix class

### Step 8 — Patch candidate

Allowed patch classes:

- parser/source patch
- mapping patch
- period resolver patch
- validation patch
- market data adapter patch
- prompt patch (narrative-only failures only)

**Rule:** if any deterministic validator failed, a prompt-only patch is invalid.

### Step 9 — Retest and regress

Patch must:

1. fix the failing benchmark
2. not worsen any previously passing benchmark
3. preserve or improve gate safety
4. preserve or improve artifact completeness

### Step 10 — Harden

If accepted:

- update regression snapshots only through explicit approval
- record fix signature
- add a test covering the exact failure mode

## 8. Retry, fail, and block semantics

| Condition | Action |
|---|---|
| transient network failure | retry once with backoff |
| SEC rate-limit or 429 | retry with backoff; preserve failure if repeated |
| deterministic fact mismatch | no retry; go directly to diagnosis |
| stale market price beyond SLA | refresh once; if still stale, valuation gate fails |
| repeated identical failure signature across two consecutive iterations | escalate patch priority; require source/parser or validator fix |
| five iterations without lowering critical-fail count | escalate to human review |
| any regression in previously passing critical rules | reject candidate patch |

## 9. Termination criteria

The Ralph loop terminates successfully only when all of the following are true for the benchmark suite:

1. zero failed critical fact validators
2. actual gate state matches expected gate state
3. zero arithmetic inconsistencies in derived metrics
4. zero stale-input violations
5. zero publish-safety violations
6. all required artifacts emitted
7. no verdict or confidence leaks into reports where valuation is withheld
8. for any benchmark where valuation is publishable, valuation prerequisites all pass

## 10. Root-cause hypothesis generation

### Deterministic first

Use a signature catalog:

| Signature | Trigger | Default hypothesis |
|---|---|---|
| `SIG_STALE_QTR_MATCHES_PRIOR` | latest-quarter facts match an older quarter within tolerance | period resolver using wrong context or stale cache |
| `SIG_TTM_TOO_LOW_OR_TOO_HIGH` | TTM differs materially from 4-quarter sum | annualization bug or quarter omission |
| `SIG_BS_FROM_WRONG_DATE` | cash, debt, or equity match prior filing instead of latest filing | stale balance-sheet mapping |
| `SIG_MARKET_CAP_SHARE_BASIS` | market cap inconsistent with price × point-in-time shares | weighted-average shares used incorrectly |
| `SIG_PE_IMPOSSIBLE` | P/E inconsistent with current price and TTM EPS | wrong EPS basis or stale price |
| `SIG_HISTORY_SHORT_FOR_CYCLICAL` | fewer than 5 annual periods for cyclical DCF | history loader incomplete; DCF should withhold |

### LLM second

The diagnoser LLM receives only:

- rule failures
- expected vs actual diffs
- provenance chains
- file/field map

It returns:

- ranked hypotheses
- likely impacted modules
- proposed fix class
- confidence and evidence references

## 11. Regression prevention

### Mandatory

- Micron frozen fixture in CI
- fixed filing accession pair
- fixed market price snapshot for golden regression
- exact expected canonical facts with tolerances
- expected publish state

### Recommended

- add a stable consumer company, a bank, and a utility after MU

### Future

- sector-specific benchmark packs

## 12. Artifact persistence

All pipeline artifacts are persisted to the **Postgres database** via the `stock_valuations` table. Each run stores the following as JSONB columns:

- `canonicalFacts` — full extracted facts with provenance
- `financialModel` — cycle state, normalization, ratios
- `valuationOutputs` — DCF, multiples, scenarios, verdict
- `qualityReport` — QA issues + gate decision (includes `gateDecision` with status, failures)
- `researchDocument` — the complete generated report text
- `structuredInsights` — dashboard-ready summaries
- `sourceAccessions` — filing accession numbers for traceability

The database is the authoritative artifact store. A file-based artifact bundle is **not required** — the DB provides full queryability, auditability, and persistence. All fields needed for forensic review (provenance, gate failures, validation results) are stored in the JSONB columns.

### Querying artifacts

To inspect a specific run:

```sql
SELECT status, "qualityReport"->'gateDecision' as gate,
       "canonicalFacts"->'quartersUsed' as quarters,
       "generatedAt"
FROM stock_valuations
WHERE ticker = 'MU'
ORDER BY "generatedAt" DESC
LIMIT 1;
```

## 13. Mandatory iteration report

After every RALPH loop iteration, a comprehensive human-readable report **must** be written to disk. This is the primary artifact for expert review and is non-negotiable.

### Report location

Write to: `ralph-loop-reports/iteration-{N}/` where `{N}` is the iteration number (zero-padded, e.g. `iteration-01`).

### Required contents

The iteration report folder must contain the following files:

#### 1. `generated-report.md` — The actual generated stock valuation report

This is the **most important artifact**. It is the raw output of the pipeline for the benchmark ticker (e.g. MU) exactly as it would appear to a user in the application. This includes:

- all sections the report renderer would produce (metadata, facts, derived metrics, narrative if generated, valuation if not withheld)
- the publish status banner (e.g. `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`)
- any warnings or caveats the gate system attached

**This file must be a complete, standalone report** — not a summary or excerpt. A reviewer should be able to read this single file and see exactly what the system would have shown to a user.

#### 2. `iteration-changes.md` — What changed in this iteration

A structured breakdown of:

- **Patch summary:** what code/config/prompt changes were made in this iteration
- **Files modified:** list of files changed with brief description of each change
- **Rationale:** why these changes were made (linked to root-cause diagnosis from prior iteration)
- **Comparison vs previous iteration:** if this is iteration 2+, include:
  - which previously failing rules now pass
  - which previously passing rules still pass (regression check)
  - any new failures introduced
  - net change in critical-fail count
  - delta in scorecard (e.g. "12/16 → 14/16 passing")

#### 3. `evaluation-scorecard.md` — Pass/fail for every evaluation parameter

A table showing every validation rule from the deterministic validation framework (Groups A–G) and the acceptance criteria, with:

| Rule ID | Description | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|

Include:

- every rule from Groups A through G (SRC, PERIOD, TTM, BS, SHARES, MKT, MULT, HIST, VAL rules)
- every acceptance test from the definition of done (MU-SRC-001, MU-QTR-001, MU-TTM-001, etc.)
- the gate decisions (facts gate, valuation gate)
- leak-prevention check (no verdict/confidence/target-price leaks in withheld reports)
- overall scorecard summary: `{passed}/{total}` rules passing, with breakdown by group

### Report generation is blocking

The RALPH loop must not proceed to the next iteration until the iteration report has been fully written. This ensures:

- every iteration is reviewable by a human
- the generated report is preserved even if later iterations overwrite pipeline state
- progress is visible and auditable at every step
