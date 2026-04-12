# Prompt for coding assistant

You are implementing a production-safe stock valuation workflow and the next iteration of the RALPH loop.

Your mission:
Build the deterministic filing-first valuation pipeline and Ralph loop described in this specification bundle, and do not stop until the Micron (MU) golden regression case passes with the expected safe publish state **and** the report-surface integrity requirements below are satisfied.

## Operating principles

1. Numbers come from deterministic code.
2. Narrative comes from LLMs only after deterministic validation passes.
3. If critical facts fail reconciliation, DO NOT publish a valuation verdict.
4. Prefer withholding over publishing broken outputs.
5. Prompt-only fixes are forbidden when the failure is in sourcing, period identity, reconciliation, mapping, validation, render policy, or dependency suppression.
6. If a field is not validated, not formula-traced, or not allowlisted for the current gate state, it must not appear in the user-facing report.

## You must implement

- statement-table-first quarterly extraction from latest 10-Q / 10-K / iXBRL
- quarter manifest and TTM builder
- deterministic balance-sheet mapper
- share-count basis separation:
  - point-in-time shares for market cap
  - weighted-average diluted shares for EPS
- deterministic derived metrics:
  - market cap
  - enterprise value
  - trailing P/E
  - P/B
  - EV/Revenue
  - EV/EBIT
  - GAAP free cash flow
- deterministic validation suite
- two-stage publish gate:
  - facts gate
  - valuation gate
- mandatory post-render surface validation
- formula trace generation for all surfaced non-primitive numbers
- suppression audit for any field blocked by failed dependencies
- artifact persistence to Postgres on every run
- file-based iteration bundle on every Ralph loop iteration
- RALPH loop:
  Reconcile -> Audit -> Localize -> Patch -> Harden

## Highest-priority next fixes

These are the first targets for the next iterations:

1. **HIST-004**
   - Fix 5-year averages so they are computed from authoritative annual history only (FY2021–FY2025 for frozen MU)
   - Expected values:
     - gross margin average = **27.18%**
     - operating margin average = **9.70%**

2. **Surface suppression**
   - If `HIST-004` fails, suppress:
     - five-year average metrics
     - sentences comparing current margins to those averages
   - If `VAL-002` fails, suppress normalized FCF and related text
   - If `TRACE-004` fails, suppress ROE, ROIC, interest coverage, cycle confidence

3. **Formula traces**
   - Every surfaced non-primitive metric must have a formula trace
   - No trace -> no surface

4. **Negative control**
   - Add intentionally broken Micron-derived fixture
   - Must return `WITHHOLD_ALL`

5. **Strict frozen tolerances**
   - Frozen point-in-time share count must match exactly:
     - **1,127,734,051**
   - Do not allow 1% tolerance on golden share-count tests

## Use Micron as the first frozen golden regression case

### Frozen Micron baseline (must match within tolerance)

- latest 10-Q: filed 2026-03-19, period ended 2026-02-26
- latest 10-K: filed 2025-10-03, period ended 2025-08-28
- frozen price snapshot: 420.59 USD
- point-in-time shares outstanding: 1,127,734,051

#### Latest quarter (Q2 FY2026)
- revenue 23,860
- gross profit 17,755
- operating income 16,135
- net income 13,785
- diluted EPS 12.07

#### TTM (Q3 FY2025 + Q4 FY2025 + Q1 FY2026 + Q2 FY2026)
- revenue 58,119
- gross profit 33,963
- operating income 28,094
- net income 24,111
- diluted EPS 21.18
- GAAP operating cash flow 30,653
- GAAP capex 20,372
- GAAP free cash flow 10,281

#### Latest balance sheet
- cash and equivalents 13,908
- short-term investments 681
- long-term marketable investments 2,038
- total debt 10,142
- total equity 72,459

#### Annual-history baseline
- FY2021–FY2025 annual gross margin average = 27.18%
- FY2021–FY2025 annual operating margin average = 9.70%

#### Derived
- market cap approximately 474.314B
- EV approximately 467.829B
- trailing P/E approximately 19.86x
- P/B approximately 6.55x
- EV/Revenue approximately 8.05x

#### Expected publish state
- `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`

## Critical rules to implement exactly

### 1. Statement-table-first TTM builder

- Build discrete quarters from latest filing statement tables or iXBRL first.
- Reconcile to companyfacts second.
- Never use companyfacts as the primary quarter selector.

### 2. Hard period-identity checks

- If reported latest quarter does not numerically match the latest filing quarter on revenue, gross profit, operating income, net income, and diluted EPS, block the run.

### 3. Critical-field gate semantics

- If TTM revenue, TTM margins, operating cash flow, free cash flow, balance-sheet core fields, or share-count basis fail reconciliation, set valuation confidence to null and omit verdict.

### 4. History gating for cyclical names

- If fewer than 5 annual periods are loaded for a cyclical semiconductor name, DCF must be withheld.
- If the annual-history average does not match the annual-history-only methodology, suppress dependent fields even if the facts gate passed.

### 5. Golden-file regression tests

- Micron is a permanent CI fixture.
- Use the frozen snapshot above for regression.
- Add a broken-fixture negative control.

### 6. Surface allowlist rules

- In `PUBLISH_FACTS_ONLY`, only surface:
  - authoritative facts
  - directly traced deterministic derivations
  - evidence-backed qualitative claims
- Do not surface:
  - fair value
  - target price
  - margin of safety
  - scenario values
  - normalized FCF
  - ROE / ROIC / interest coverage
  - cycle confidence
  unless they are explicitly validated and allowlisted

## Ralph loop execution protocol

For each iteration:

A. Run candidate workflow on:
- MU frozen fixture
- broken negative-control fixture
- any existing regression suite

B. Persist all artifacts to Postgres:
- raw sources
- parsed statement tables
- quarter manifest
- canonical facts
- validation results
- valuation outputs
- gate decision
- narrative prompt and response
- red-team prompt and response
- diff vs golden
- patch plan
- formula traces
- suppression audit
- negative control results

C. Write all required files to `ralph-loop-reports/iteration-{NN}/`:
- `generated-report.md`
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `quarter-manifest.json`
- `formula-traces.json`
- `suppression-audit.json`
- `artifact-inventory.json`
- `negative-control-results.json`

D. If any critical deterministic rule fails:
- skip narrative
- skip valuation verdict
- emit diagnostic-only artifact
- classify root-cause signature
- propose fix in source/parser/period/mapping/history/validation/render-policy layer

E. Apply one focused patch.

F. Re-run:
1. `npx tsc --noEmit`
2. frozen Micron regression
3. broken negative-control fixture
4. full regression suite
5. pipeline report generation for MU

G. Reject the patch if it introduces any regression.

H. Continue until:
- exact baseline facts are achieved
- expected gate state is achieved
- surface validation passes
- negative control passes
- artifact completeness passes

## Do not do these things

- Do not patch prompts to hide deterministic failures.
- Do not annualize a single quarter to get TTM.
- Do not mix balance-sheet-date shares and weighted-average diluted shares.
- Do not compute EV using DCF EV inside market multiple calculations.
- Do not publish a target price, fair value, or confidence score if facts or valuation prerequisites fail.
- Do not silently fall back to stale quarters.
- Do not accept `published_with_warnings` when the correct state is `withheld` or `facts only`.
- Do not surface untraced derived metrics in a facts-only report.
- Do not surface historical comparison text if `HIST-004` failed.

## Implementation preference

- First fix annual-history averaging and report-surface suppression.
- Then add formula traces and broken negative control.
- Then tighten frozen tolerances.
- Then improve peer-set support and eventual valuation logic.
- Only after those pass, improve narrative richness.

## Definition of success

- Micron frozen fixture matches the baseline above within tolerance.
- Latest quarter is Q2 FY2026, not an older quarter.
- TTM math reconciles exactly from quarter manifest.
- Annual-history averages are exact annual-only values.
- Publish gate returns `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD` for the frozen baseline.
- Facts-only report contains no forbidden or untraced metrics.
- Broken negative-control fixture returns `WITHHOLD_ALL`.
- All artifacts are persisted to Postgres and written to disk on every iteration.

## Mandatory iteration report — write to disk after every iteration

After every Ralph loop iteration, you **must** write a comprehensive report to `ralph-loop-reports/iteration-{N}/` (zero-padded, e.g. `iteration-01`). Do not proceed to the next iteration until this is done.

### Required files in each iteration folder

#### 1. `generated-report.md`
The complete generated report exactly as shown to the user.

#### 2. `iteration-changes.md`
What changed, why it changed, and what pass/fail delta occurred versus the previous iteration.

#### 3. `evaluation-scorecard.md`
Pass/fail table for every validation rule (Groups A–J) and every acceptance criterion.

#### 4. `run-manifest.json`
Code ref, fixture ids, source timestamps, prompt hashes, model ids, environment hash.

#### 5. `quarter-manifest.json`
Quarter lineage for the TTM builder with filing accession, period end, field sources, and derivation method.

#### 6. `formula-traces.json`
Formula traces for every surfaced non-primitive numeric field.

#### 7. `suppression-audit.json`
Failed rules, dependent fields, suppressed fields, and any detected leaks.

#### 8. `artifact-inventory.json`
All DB ids, paths, hashes, and report artifacts emitted in the iteration.

#### 9. `negative-control-results.json`
Broken fixture outcome, gate state, and leak-prevention result.

## Return after each iteration

1. failed rule ids
2. root-cause hypothesis
3. patch summary
4. regression result
5. current gate state
6. surface validation result
7. next action
