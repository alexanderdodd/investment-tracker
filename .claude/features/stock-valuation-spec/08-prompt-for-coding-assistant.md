# Prompt for coding assistant

You are implementing a production-safe stock valuation workflow.

Your mission:
Build the deterministic filing-first valuation pipeline and RALPH loop described in the attached specification, and do not stop until the Micron (MU) golden regression case passes with the expected safe publish state.

## Operating principles

1. Numbers come from deterministic code.
2. Narrative comes from LLMs only after deterministic validation passes.
3. If critical facts fail reconciliation, DO NOT publish a valuation verdict.
4. Prefer withholding over publishing broken outputs.
5. Prompt-only fixes are forbidden when the failure is in sourcing, period identity, reconciliation, mapping, or validation.

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
- artifact bundle emission on every run
- RALPH loop:
  Reconcile -> Audit -> Localize -> Patch -> Harden

## Use Micron as the first frozen golden regression case

### Frozen Micron baseline (must match within tolerance)

- latest 10-Q: filed 2026-03-19, period ended 2026-02-26
- latest 10-K: filed 2025-10-03, period ended 2025-08-28
- frozen price snapshot: 420.59 USD
- point-in-time shares outstanding: 1,127,734,051
- latest quarter (Q2 FY2026):
  - revenue 23,860
  - gross profit 17,755
  - operating income 16,135
  - net income 13,785
  - diluted EPS 12.07
- TTM (Q3 FY2025 + Q4 FY2025 + Q1 FY2026 + Q2 FY2026):
  - revenue 58,119
  - gross profit 33,963
  - operating income 28,094
  - net income 24,111
  - diluted EPS 21.18
  - GAAP operating cash flow 30,653
  - GAAP capex 20,372
  - GAAP free cash flow 10,281
- latest balance sheet:
  - cash and equivalents 13,908
  - short-term investments 681
  - long-term marketable investments 2,038
  - total debt 10,142
  - total equity 72,459
- derived:
  - market cap approximately 474.314B
  - EV approximately 467.829B
  - trailing P/E approximately 19.86x
  - P/B approximately 6.55x
  - EV/Revenue approximately 8.05x
- expected publish state:
  FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD

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

### 5. Golden-file regression tests

- Micron is a permanent CI fixture.
- Use the frozen snapshot above for regression.

## RALPH loop execution protocol

For each iteration:

A. Run candidate workflow on MU frozen fixture.
B. Emit full artifact bundle:
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

C. If any critical deterministic rule fails:
- skip narrative and valuation verdict
- emit diagnostic-only artifact
- classify root-cause signature
- propose fix in source/parser/period/mapping/validation layer

D. Apply one focused patch.
E. Re-run MU and then the regression suite.
F. Reject the patch if it introduces any regression.
G. Continue until expected gate state and exact baseline facts are achieved.

## Do not do these things

- Do not patch prompts to hide deterministic failures.
- Do not annualize a single quarter to get TTM.
- Do not mix balance-sheet-date shares and weighted-average diluted shares.
- Do not compute EV using DCF EV inside market multiple calculations.
- Do not publish a target price, fair value, or confidence score if facts or valuation prerequisites fail.
- Do not silently fall back to stale quarters.
- Do not accept `published_with_warnings` when the correct state is `withheld` or `facts only`.

## Implementation preference

- First fix source discovery and quarter extraction.
- Then fix TTM builder and balance-sheet mapping.
- Then fix validator coverage and gate wiring.
- Only after those pass, improve valuation logic and narrative.

## Definition of success

- Micron frozen fixture matches the baseline above within tolerance.
- Latest quarter is Q2 FY2026, not an older quarter.
- TTM math reconciles exactly from quarter manifest.
- Publish gate returns FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD for the frozen baseline.
- Any intentionally broken fixture causes WITHHOLD_ALL.
- Full artifact bundle is emitted on every iteration.

## Mandatory iteration report — write to disk after every iteration

After every RALPH loop iteration, you **must** write a comprehensive report to `ralph-loop-reports/iteration-{N}/` (zero-padded, e.g. `iteration-01`). Do not proceed to the next iteration until this is done.

### Required files in each iteration folder:

#### 1. `generated-report.md` — The actual generated stock valuation report

This is the **most critical artifact**. It must contain the complete report for MU exactly as it would appear to a user in the application — all sections, all numbers, the publish status banner, any warnings. A reviewer must be able to read this single file and see exactly what the pipeline produced. This is not a summary — it is the full raw output.

#### 2. `iteration-changes.md` — What changed and how it compares

- What code/config/prompt changes were made
- Files modified with brief descriptions
- Why (linked to root-cause from prior iteration)
- If iteration 2+: comparison vs previous iteration — which rules flipped pass/fail, net change in critical-fail count, delta scorecard (e.g. "12/16 → 14/16")

#### 3. `evaluation-scorecard.md` — Pass/fail for every evaluation parameter

A table covering every validation rule (Groups A–G: SRC, PERIOD, TTM, BS, SHARES, MKT, MULT, HIST, VAL) and every acceptance test (MU-SRC-001, MU-QTR-001, etc.), showing:

| Rule ID | Description | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|

Plus: gate decisions, leak-prevention check, and overall summary (`{passed}/{total}`).

## Return after each iteration

1. failed rule ids
2. root-cause hypothesis
3. patch summary
4. regression result
5. current gate state
6. next action
