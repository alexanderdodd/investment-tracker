# Ralph loop specification

## 1. Definition

**RALPH = Reconcile -> Audit -> Localize -> Patch -> Harden**

This is the outer improvement loop for the workflow implementation. Its job is to take a candidate workflow revision and iterate until the workflow is safe to publish under the gate contract.

## 2. Purpose and scope

### Purpose

- improve the workflow until deterministic facts are correct
- ensure valuation logic is internally consistent
- ensure publish gating is safe
- ensure report-surface behavior is safe
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
6. all surfaced non-primitive numbers carry formula traces
7. critical validation failures block publication
8. cyclical DCF requires adequate validated history or else must be withheld
9. facts-only reports may surface only allowlisted fields whose dependencies all passed
10. broken-fixture negative controls are mandatory

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
- surfacing any number outside the render allowlist

## 4. Loop inputs

| Input | Type | Required | Notes |
|---|---|---:|---|
| `candidate_workflow_ref` | git ref / build id | Yes | exact code under test |
| `benchmark_suite` | JSON | Yes | includes MU golden fixture + negative controls |
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
| `run_manifest.json` | machine-readable | Yes | exact reproducibility metadata |
| `quarter_manifest.json` | machine-readable | Yes | quarter lineage used for TTM |
| `formula_traces.json` | machine-readable | Yes | formula traces for surfaced metrics |
| `suppression_audit.json` | machine-readable | Yes | failed rules -> suppressed fields/sentences |
| `artifact_inventory.json` | machine-readable | Yes | all persisted artifact paths / ids / hashes |
| `negative_control_results.json` | machine-readable | Yes | intentionally broken fixture outcomes |

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
               ├── fail → FACTS_ONLY_WITHHELD_ARTIFACTS
               │         ↓
               │       FORMULA_TRACE_BUILD
               │         ↓
               │       SURFACE_ALLOWLIST_BUILD
               │         ↓
               │       SURFACE_VALIDATION
               │         ├── fail → AUDIT_FAILURES
               │         └── pass → ACCEPT_WITH_WITHHELD or PATCH_CANDIDATE
               └── pass → GENERATE_NARRATIVE
                              ↓
                            RED_TEAM
                              ↓
                            SURFACE_VALIDATION
                              ├── fail → AUDIT_FAILURES
                              └── pass → FINAL_GATE → HARDEN_BASELINE → ACCEPT
```

## 7. Iteration steps

### Step 0 — Freeze the run

Create a run manifest with:

- exact code ref
- benchmark ids
- source timestamps
- environment hash
- model and prompt versions
- market data provider and quote timestamp
- fixture ids and hashes

### Step 1 — Build authoritative source bundle

For each benchmark:

- discover latest 10-Q and 10-K
- download filing HTML / iXBRL / statement tables
- download market data snapshot
- build immutable source bundle with hashes

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

### Step 5 — Build formula traces and surface allowlist

Before rendering any user-facing report:

- build formula traces for every surfaced derived metric
- classify every candidate field into:
  - Class A authoritative fact
  - Class B directly traced deterministic derivation
  - Class C model / valuation output
  - Class D evidence-backed qualitative claim
- compute the render allowlist for the current gate state
- compute the render denylist based on failed rule dependencies

### Step 6 — Generate narrative only after gates and allowlist

Only if the relevant gates pass:

- LLM gets locked deterministic artifacts
- LLM receives the render allowlist, not the full raw model object
- LLM may explain but not alter numbers
- red-team LLM may challenge but not recompute

### Step 7 — Run surface validation

After report rendering, validate:

- no suppressed metric appears
- no forbidden valuation field appears in a withheld state
- every surfaced number maps to an allowed fact / derivation / evidence id
- every surfaced derived metric has a formula trace
- every surfaced comparison sentence depends only on passed validators

If surface validation fails:
- treat as a report-safety failure
- reject publish
- emit failure artifacts

### Step 8 — Audit failures

Build a structured failure graph:

- failed rule ids
- affected fields
- observed vs expected values
- provenance paths
- benchmark diffs
- dependency graph
- suppressed vs leaked fields
- whether regression introduced new failures

### Step 9 — Localize root cause

Use:

- deterministic pattern matching against known failure signatures
- then LLM diagnosis over the structured failure graph

Output ranked hypotheses with:

- likelihood
- supporting evidence
- likely module(s)
- recommended fix class

### Step 10 — Patch candidate

Allowed patch classes:

- parser/source patch
- mapping patch
- period resolver patch
- history loader patch
- validation patch
- render-policy patch
- market data adapter patch
- prompt patch (narrative-only failures only)

**Rule:** if any deterministic validator failed, a prompt-only patch is invalid.

### Step 11 — Retest and regress

Patch must:

1. fix the failing benchmark
2. not worsen any previously passing benchmark
3. preserve or improve gate safety
4. preserve or improve artifact completeness
5. preserve or improve report-surface safety

### Step 12 — Harden

If accepted:

- update regression snapshots only through explicit approval
- record fix signature
- add a test covering the exact failure mode
- add or update a negative control if the failure class lacked one

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
| any report-surface leak in withheld state | reject candidate patch immediately |

## 9. Termination criteria

The Ralph loop terminates successfully only when all of the following are true for the benchmark suite:

1. zero failed critical fact validators
2. actual gate state matches expected gate state
3. zero arithmetic inconsistencies in derived metrics
4. zero stale-input violations
5. zero publish-safety violations
6. zero report-surface violations
7. all required artifacts emitted
8. no verdict or confidence leaks into reports where valuation is withheld
9. every surfaced non-primitive field has a formula trace
10. every mandatory negative control passes

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
| `SIG_HISTORY_AVG_CONTAMINATED` | 5Y averages do not match authoritative annual history | history average includes quarters/TTM or wrong year window |
| `SIG_SURFACE_LEAK_AFTER_WITHHOLD` | facts-only or withheld report contains forbidden fields | render allowlist / suppression audit broken |
| `SIG_UNTRACED_DERIVED_METRIC` | surfaced derived metric lacks formula trace | formula trace builder incomplete |
| `SIG_NEGATIVE_CONTROL_MISSING` | no broken-fixture proof for WITHHOLD_ALL | negative-control harness incomplete |

### LLM second

The diagnoser LLM receives only:

- rule failures
- expected vs actual diffs
- provenance chains
- file/field map
- suppression audit
- formula trace coverage report

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
- intentionally broken Micron-derived fixture that must return `WITHHOLD_ALL`

### Recommended

- add a stable consumer company, a bank, and a utility after MU
- add a stale-market-data fixture
- add a malformed-period-order fixture

### Future

- sector-specific benchmark packs
- valuation backtesting pack

## 12. Artifact persistence

### Dual persistence model

Both of the following are mandatory:

1. **Postgres database** is the authoritative runtime artifact store.
2. **File-based iteration report bundle** is mandatory for review, diffing, and offline audit.

### Database persistence

Persist at minimum:

- `canonicalFacts`
- `financialModel`
- `valuationOutputs`
- `qualityReport`
- `researchDocument`
- `structuredInsights`
- `sourceAccessions`
- `runManifest`
- `quarterManifest`
- `formulaTraces`
- `suppressionAudit`
- `artifactInventory`
- `negativeControlResults`

### File-based iteration bundle

Every iteration must write to:

`ralph-loop-reports/iteration-{NN}/`

Required files:

- `generated-report.md`
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `quarter-manifest.json`
- `formula-traces.json`
- `suppression-audit.json`
- `artifact-inventory.json`
- `negative-control-results.json`

## 13. Mandatory iteration report

After every RALPH loop iteration, a comprehensive human-readable report **must** be written to disk. This is the primary artifact for expert review and is non-negotiable.

### Report generation is blocking

The Ralph loop must not proceed to the next iteration until the iteration report has been fully written and registered in the artifact inventory.

This ensures:

- every iteration is reviewable by a human
- the generated report is preserved even if later iterations overwrite pipeline state
- progress is visible and auditable at every step
- every surfaced report can be checked against formula traces and suppression decisions
