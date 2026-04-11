# Stock valuation Ralph loop spec - complete bundle


---

# Executive summary

This specification makes **deterministic reconciliation the non-negotiable contract** for the stock valuation workflow. The workflow must build quarterly and trailing-twelve-month facts from **statement tables or iXBRL in the latest 10-Q and 10-K first**, reconcile those facts to secondary sources second, and **block any valuation verdict** if critical fields fail validation.

For Micron, the latest authoritative financial base for the frozen regression snapshot is the **Q2 FY2026 10-Q filed March 19, 2026 for the quarter ended February 26, 2026**, together with the **FY2025 10-K filed October 3, 2025 for the year ended August 28, 2025**, plus prior official quarterly releases needed for the trailing-twelve-month roll-forward.

Using that filing-first approach and a frozen market-price snapshot of **$420.59**, the reconciled baseline is:

- latest-quarter revenue: **$23.860B**
- TTM revenue: **$58.119B**
- TTM GAAP net income: **$24.111B**
- TTM GAAP operating cash flow: **$30.653B**
- TTM GAAP free cash flow: **$10.281B**
- cash and investments: **$16.627B**
- total debt: **$10.142B**
- point-in-time shares outstanding: **1,127,734,051**

The current workflow failures are best explained by a **stale-quarter bug + incomplete-history bug + broken publish-gate wiring**, not by generic LLM hallucination. The system selected the wrong latest quarter, corrupted TTM metrics, mis-mapped cash flow and balance sheet facts, and then published a valuation verdict when it should have withheld.

The proposed RALPH loop is:

- **R**econcile
- **A**udit
- **L**ocalize
- **P**atch
- **H**arden

Its job is to iteratively improve the workflow against frozen golden cases until the pipeline is publish-safe.

## Core operating rule

A valuation report may only publish a fair-value verdict if all of the following are true:

1. deterministic fact extraction passed
2. critical-field reconciliation passed
3. valuation prerequisites passed
4. publish gate passed
5. narrative was generated only from locked validated artifacts

If those conditions are not met, the correct outputs are either:

- **diagnostic artifact only**, or
- **facts-only artifact with valuation withheld**

That is the target safe behavior for the current phase.


---

# Golden Micron valuation report

## MICRON TECHNOLOGY, INC. (MU) — Golden baseline report

**Artifact type:** facts-first golden regression artifact  
**As-of market data:** 2026-04-11 00:15 UTC  
**Financial source of truth:** latest 10-Q + latest 10-K + prior official quarterly releases for TTM roll-forward  
**Publish status:** `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`

---

## 1. Metadata and provenance

| Field | Value |
|---|---:|
| Ticker | MU |
| Company | Micron Technology, Inc. |
| Latest quarterly filing | 10-Q filed 2026-03-19, period ended 2026-02-26 |
| Latest annual filing | 10-K filed 2025-10-03, period ended 2025-08-28 |
| Current price snapshot | $420.59 |
| Price timestamp | 2026-04-11 00:15 UTC |

This artifact is a frozen baseline for regression testing. It is not a live recommendation.

---

## 2. Authoritative facts

### 2.1 Latest quarter (Q2 FY2026)

| Metric | Value | Provenance |
|---|---:|---|
| Revenue | $23.860B | Q2 FY2026 10-Q statement of operations |
| Gross profit | $17.755B | Q2 FY2026 10-Q statement of operations |
| Gross margin | 74.4% | Q2 FY2026 earnings release / 10-Q |
| Operating income | $16.135B | Q2 FY2026 10-Q statement of operations |
| Operating margin | 67.6% | Q2 FY2026 earnings release / 10-Q |
| Net income | $13.785B | Q2 FY2026 10-Q statement of operations |
| Diluted EPS | $12.07 | Q2 FY2026 10-Q statement of operations |
| Weighted-average diluted shares | 1.142B | Q2 FY2026 EPS note |
| GAAP operating cash flow | $11.903B | Q2 FY2026 earnings release reconciliation |
| GAAP capex (PP&E expenditures) | $6.387B | Q2 FY2026 earnings release reconciliation |
| Segment revenue: CMBU | $7.749B | Q2 FY2026 segment note |
| Segment revenue: CDBU | $5.687B | Q2 FY2026 segment note |
| Segment revenue: MCBU | $7.711B | Q2 FY2026 segment note |
| Segment revenue: AEBU | $2.708B | Q2 FY2026 segment note |
| Management guide for Q3 FY2026 | Revenue $33.5B ± $0.75B; GAAP gross margin ~81%; GAAP diluted EPS $18.90 ± $0.40 | Q2 FY2026 earnings release |

### 2.2 Trailing twelve months (Q3 FY2025 + Q4 FY2025 + Q1 FY2026 + Q2 FY2026)

| Metric | Value | Derivation |
|---|---:|---|
| TTM revenue | $58.119B | 9.301 + 11.315 + 13.643 + 23.860 |
| TTM gross profit | $33.963B | 3.508 + 5.054 + 7.646 + 17.755 |
| TTM gross margin | 58.44% | 33.963 / 58.119 |
| TTM operating income | $28.094B | 2.169 + 3.654 + 6.136 + 16.135 |
| TTM operating margin | 48.34% | 28.094 / 58.119 |
| TTM GAAP net income | $24.111B | 1.885 + 3.201 + 5.240 + 13.785 |
| TTM diluted EPS | $21.18 | 1.68 + 2.83 + 4.60 + 12.07 |
| TTM GAAP operating cash flow | $30.653B | 4.609 + 5.730 + 8.411 + 11.903 |
| TTM GAAP capex | $20.372B | 2.938 + 5.658 + 5.389 + 6.387 |
| TTM GAAP free cash flow | $10.281B | 30.653 − 20.372 |
| TTM GAAP FCF margin | 17.69% | 10.281 / 58.119 |
| OCF / net income | 1.27x | 30.653 / 24.111 |

### 2.3 Annual history (FY2021–FY2025)

| Fiscal year | Revenue | Gross margin | Operating margin | Net income | Diluted EPS | Operating cash flow |
|---|---:|---:|---:|---:|---:|---:|
| FY2021 | $27.705B | 37.6% | 22.7% | $5.861B | $5.14 | $12.47B |
| FY2022 | $30.758B | 45.2% | 31.5% | $8.687B | $7.75 | $15.18B |
| FY2023 | $15.540B | -9.1% | -37.0% | -$5.833B | -$5.34 | $1.56B |
| FY2024 | $25.111B | 22.4% | 5.2% | $0.778B | $0.70 | $8.51B |
| FY2025 | $37.378B | 39.8% | 26.1% | $8.539B | $7.59 | $17.53B |

Five-year average gross margin: **27.18%**  
Five-year average operating margin: **9.70%**

### 2.4 Latest balance sheet and share count

| Metric | Value | Provenance |
|---|---:|---|
| Cash and cash equivalents | $13.908B | Q2 FY2026 balance sheet |
| Short-term investments | $0.681B | Q2 FY2026 balance sheet |
| Long-term marketable investments | $2.038B | Q2 FY2026 balance sheet |
| Total cash and investments | $16.627B | Derived from balance sheet |
| Receivables | $17.314B | Q2 FY2026 balance sheet |
| Inventory | $8.267B | Q2 FY2026 balance sheet |
| Current debt | $0.585B | Q2 FY2026 balance sheet |
| Long-term debt | $9.557B | Q2 FY2026 balance sheet |
| Total debt | $10.142B | Derived from balance sheet |
| Total equity | $72.459B | Q2 FY2026 balance sheet |
| Shares outstanding at balance-sheet date | 1.128B | Q2 FY2026 balance sheet |
| Shares outstanding at filing cover date | 1,127,734,051 | Q2 FY2026 cover page |

---

## 3. Derived metrics

| Metric | Value |
|---|---:|
| Current price | $420.59 |
| Market cap | $474.314B |
| Enterprise value | $467.829B |
| Book value per share | $64.24 |
| Trailing P/E | 19.86x |
| Price / book | 6.55x |
| EV / revenue | 8.05x |
| EV / EBIT | 16.65x |
| EV / FCF | 45.50x |

### Formula notes

- `market_cap = price × point_in_time_shares`
- `enterprise_value = market_cap + total_debt − total_cash_and_investments`
- `trailing_pe = price / ttm_diluted_eps`
- `book_value_per_share = total_equity / point_in_time_shares`
- `price_to_book = price / book_value_per_share`
- `ev_to_revenue = enterprise_value / ttm_revenue`
- `ev_to_ebit = enterprise_value / ttm_operating_income`
- `ev_to_fcf = enterprise_value / ttm_gaap_free_cash_flow`

---

## 4. Interpretation / narrative

### 4.1 What is authoritative

The latest-quarter and TTM facts show Micron in an exceptionally strong earnings regime, not merely “emerging from a trough.”

- Q2 FY2026 gross margin: **74.4%**
- Q2 FY2026 operating margin: **67.6%**
- TTM gross margin: **58.4%**
- TTM operating margin: **48.3%**

These sit far above Micron’s FY2021–FY2025 averages:

- 5-year average gross margin: **27.2%**
- 5-year average operating margin: **9.7%**

Management’s Q3 FY2026 guide of **$33.5B revenue** and about **81% GAAP gross margin** points to even stronger near-term conditions.

### 4.2 Structural and risk context

Micron’s current earnings power is being helped by AI-driven memory demand, but the filing-derived evidence still supports a cautious interpretation of durability:

- substantially all customer contracts are short-term
- future performance obligations beyond one year were not material
- over half of 2025 revenue came from the top ten customers
- about half of 2025 revenue was concentrated in the data-center end market
- one customer represented 13% of first-half FY2026 revenue, primarily in CMBU

The correct reading is:

- current earnings strength is real
- near-term visibility is better than in older cycles
- durability is not yet proven enough to force a single publishable fair-value conclusion without a validated cycle-normalization model

---

## 5. Valuation conclusion and safe publish behavior

**Valuation verdict: WITHHELD**

### Reason

The factual base is reconciled and publishable, but a publishable fair-value verdict still requires:

1. a validated cycle-normalization model for memory semiconductors
2. a deterministically sourced direct peer set
3. valuation-prerequisite checks that pass in the gate

Because current quarter and TTM margins sit far above multi-year annual averages, a single-point DCF is too assumption-sensitive to serve as the golden baseline verdict.

### Correct safe behavior for this golden artifact

- publish reconciled facts
- publish derived market multiples
- omit fair value, target price, margin of safety, and valuation confidence
- set `valuation_status = withheld`
- preserve all underlying evidence for later model validation

---

## 6. Machine-readable baseline expectations

```json
{
  "ticker": "MU",
  "as_of_market_data": "2026-04-11T00:15:00Z",
  "publish_status": "FACTS_PUBLISHABLE__VALUATION_VERDICT_WITHHELD",
  "latest_quarter": {
    "label": "Q2_FY2026",
    "revenue": 23860,
    "gross_profit": 17755,
    "operating_income": 16135,
    "net_income": 13785,
    "diluted_eps": 12.07
  },
  "ttm": {
    "revenue": 58119,
    "gross_profit": 33963,
    "operating_income": 28094,
    "net_income": 24111,
    "diluted_eps": 21.18,
    "operating_cash_flow": 30653,
    "capex": 20372,
    "gaap_free_cash_flow": 10281
  },
  "balance_sheet": {
    "cash_and_equivalents": 13908,
    "short_term_investments": 681,
    "long_term_marketable_investments": 2038,
    "total_cash_and_investments": 16627,
    "total_debt": 10142,
    "total_equity": 72459,
    "point_in_time_shares": 1127734051
  },
  "derived": {
    "market_cap": 474314,
    "enterprise_value": 467829,
    "trailing_pe": 19.86,
    "price_to_book": 6.55,
    "ev_to_revenue": 8.05
  }
}
```


---

# Root-cause diagnosis of current workflow failures

The current workflow failures are consistent with a **stale-quarter bug + incomplete-history bug + broken gate wiring**.

## 1. Failure table

| Failure symptom | Authoritative counter-fact | Likely root cause | Severity |
|---|---|---|---|
| Latest quarter showed ~37.7% gross margin / ~23.5% operating margin | Actual latest quarter in-scope is Q2 FY2026 with 74.4% gross margin and 67.6% operating margin | Quarter resolver selected the wrong period context or stale cached quarter | High |
| TTM revenue and profitability were materially understated | Reconciled TTM is $58.119B revenue and $24.111B GAAP net income | TTM builder used wrong quarter set or annualized the wrong interim values | High |
| Cash flow and free cash flow were wrong | Reconciled TTM GAAP OCF is $30.653B and TTM GAAP FCF is $10.281B | Quarter manifest and cash-flow mapping were broken | High |
| Balance-sheet cash and debt were wrong | Latest balance sheet shows $16.627B cash/investments and $10.142B total debt | Wrong statement date, wrong tag mapping, or stale filing reference | High |
| P/E exploded to implausible levels | Reconciled trailing P/E is about 19.86x at the frozen price snapshot | Wrong EPS basis, wrong share-count basis, or stale market-cap chain | High |
| Published a valuation verdict despite broken facts | Broken facts should have blocked valuation entirely | Publish gate not wired to deterministic failure severity | High |
| Only two years of annual history were loaded for a cyclical name | Five annual periods are available and required for cycle normalization | History loader incomplete | Medium |

## 2. Primary diagnosis

The most likely primary defect chain is:

1. quarter selection relied on aggregate or stale contexts instead of statement tables from the latest filing
2. the system selected a quarter whose metrics resemble Q3 FY2025 rather than the latest 10-Q quarter
3. the TTM builder rolled forward from the wrong anchor
4. cash flow, FCF, multiples, and valuation inherited that bad anchor
5. the publish gate did not treat those failures as publish-blocking

This is a **systems problem**, not a prose problem.

## 3. Secondary diagnosis

Secondary defects likely include:

- share-count basis confusion between point-in-time shares and weighted-average diluted shares
- GAAP vs non-GAAP capex / FCF mixing
- stale market-data acceptance
- history under-collection for a cyclical name
- validator severity misclassification

## 4. Design implications

The diagnosis implies the following implementation priorities:

1. **Statement-table-first TTM builder**
2. **Hard period-identity checks**
3. **Critical-field gate semantics**
4. **Golden-file regression tests with Micron**
5. **History gating for cyclical names**

## 5. What not to do

Do not try to patch this with narrative prompts.

If any deterministic validator fails in:

- quarter identity
- TTM construction
- balance-sheet mapping
- share-count basis
- market-cap / EV math

then the next fix must be in:

- source discovery
- filing parser
- statement-table parser
- period resolver
- mapper
- validation logic
- publish-gate wiring

Prompt-only fixes are invalid for these failure classes.


---

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

## 12. Artifact contract per iteration

```text
/run_{timestamp}_{iteration}/
  manifest.json
  source_bundle/
    sec/
      latest_10q.html
      latest_10q_ixbrl.xml
      latest_10k.html
      latest_10k_ixbrl.xml
      prior_quarter_sources/
    market/
      quote_snapshot.json
  extracted/
    statement_tables.json
    discrete_quarters.json
    annual_history.json
    canonical_facts.json
    evidence_pack.json
  validation/
    rule_results.json
    fact_reconciliation.json
    period_identity.json
    history_coverage.json
    valuation_prereqs.json
  model/
    financial_model.json
    valuation_outputs.json
    gate_decision.json
  llm/
    narrative_prompt.txt
    narrative_response.md
    redteam_prompt.txt
    redteam_response.md
    diagnosis_prompt.txt
    diagnosis_response.json
  regression/
    diff_vs_golden.json
    suite_scorecard.json
  patch/
    patch_plan.md
    candidate_patch.diff
  summary/
    iteration_report.md
```


---

# Deterministic validation framework

## 1. Rule-result schema

```json
{
  "rule_id": "PERIOD-001",
  "severity": "HIGH",
  "status": "FAIL",
  "field": "latest_quarter.revenue",
  "expected": 23860,
  "actual": 9301,
  "tolerance": {
    "abs": 1,
    "rel_pct": 0.1
  },
  "provenance_expected": "10-Q 2026-02-26 statement table",
  "provenance_actual": "candidate latest-quarter artifact",
  "message": "Latest quarter revenue does not match latest filing quarter",
  "blocks": ["facts_publishable", "valuation_publishable"]
}
```

## 2. Validation groups

### Group A — Filing discovery and source integrity

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `SRC-001` | latest 10-Q exists and is newest quarterly filing | High | facts |
| `SRC-002` | latest 10-K exists and is newest annual filing | High | facts |
| `SRC-003` | raw filing files downloaded and hashed | High | facts |
| `SRC-004` | market data snapshot freshness within SLA | Medium/High | valuation |

### Group B — Period identity

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `PERIOD-001` | latest-quarter revenue equals latest 10-Q discrete quarter revenue | High | facts |
| `PERIOD-002` | latest-quarter gross profit / operating income / net income / diluted EPS all match latest 10-Q quarter | High | facts |
| `PERIOD-003` | latest-quarter cash flow metrics match latest quarter source if available | High | facts |
| `PERIOD-004` | fiscal-calendar metadata respected, including 52/53-week year awareness | High | facts |
| `PERIOD-005` | previous-quarter chain is chronologically continuous | High | facts |

**Rule:** if the reported latest quarter numerically matches an older quarter better than the latest one, fail as `SIG_STALE_QTR_MATCHES_PRIOR`.

### Group C — Statement-table-first TTM builder

#### Mandatory algorithm

1. Parse the latest 10-Q statement tables or iXBRL for the latest discrete quarter.
2. Walk backward for the previous three quarters.
3. If the prior filing is annual, derive Q4 from annual less Q1–Q3 or use official comparative quarter tables.
4. Build a `quarter_manifest` with:
   - quarter label
   - period end
   - accession
   - source field ids
   - derivation method
5. Sum the four quarters into TTM.
6. Reconcile to companyfacts and to any official comparative tables.

#### Validator rules

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `TTM-001` | TTM revenue equals sum of quarter manifest | High | facts |
| `TTM-002` | TTM gross profit equals sum of quarter manifest | High | facts |
| `TTM-003` | TTM operating income equals sum of quarter manifest | High | facts |
| `TTM-004` | TTM net income equals sum of quarter manifest | High | facts |
| `TTM-005` | TTM diluted EPS equals sum of four quarter diluted EPS values or documented diluted-share method | High | facts |
| `TTM-006` | TTM OCF equals sum of quarterly OCF | High | facts |
| `TTM-007` | TTM capex equals sum of quarterly GAAP PP&E expenditures | High | facts |
| `TTM-008` | TTM GAAP FCF = TTM OCF − TTM GAAP capex | High | facts |

**Prohibition:** companyfacts may not be the primary selector for the four quarters.

### Group D — Balance sheet and share-count integrity

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `BS-001` | cash, short-term investments, LT marketable investments map to latest balance sheet | High | facts |
| `BS-002` | current debt, long-term debt, and total equity map to latest balance sheet | High | facts |
| `BS-003` | book value per share uses balance-sheet-date shares or explicitly documented basis | Medium | facts |
| `SHARES-001` | point-in-time shares for market cap come from filing cover or market data, not EPS denominator | High | facts |
| `SHARES-002` | diluted weighted-average shares for EPS come from EPS note or quarter release | High | facts |
| `SHARES-003` | mixed share basis is forbidden in one calculation chain | High | facts |

### Group E — Derived-metric integrity

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `MKT-001` | market cap = price × point-in-time shares | High | facts |
| `MKT-002` | EV = market cap + total debt − total cash/investments | High | facts |
| `MULT-001` | trailing P/E = price / TTM diluted EPS | High | facts |
| `MULT-002` | P/B = price / book value per share | High | facts |
| `MULT-003` | EV/Revenue = EV / TTM revenue | High | facts |
| `MULT-004` | EV/EBIT, EV/FCF, etc. use market EV, never DCF EV | High | valuation |

### Group F — History gating for cyclical names

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `HIST-001` | at least 5 annual periods loaded for cyclical semiconductor normalization | Medium/High | valuation |
| `HIST-002` | annual periods are continuous and source-provenanced | High | valuation |
| `HIST-003` | if `HIST-001` fails, DCF must widen materially or withhold | High | valuation |
| `HIST-004` | five-year averages must be computed only from authoritative annual history | High | valuation |

### Group G — Valuation-prerequisite integrity

| Rule ID | Check | Severity | Block |
|---|---|---|---|
| `VAL-001` | cycle classification computed from validated history, not LLM opinion | High | valuation |
| `VAL-002` | normalized base-year FCF documented and reproducible | High | valuation |
| `VAL-003` | WACC inputs have provenance and calculation trace | High | valuation |
| `VAL-004` | direct peer set for multiples is deterministically sourced or curated | Medium/High | valuation |
| `VAL-005` | scenario spread must be reasonable for cyclical names; over-tight bands fail | Medium | valuation |
| `VAL-006` | if any of `VAL-001..004` fail, verdict withheld | High | valuation |

## 3. Pseudocode for core checks

### Latest quarter identity

```python
def validate_latest_quarter(candidate, source_latest):
    fields = ["revenue", "gross_profit", "operating_income", "net_income", "diluted_eps"]
    for f in fields:
        assert within_tolerance(candidate.latest_quarter[f], source_latest[f])

    if matches_prior_quarter(candidate.latest_quarter, candidate.prior_quarters):
        fail("PERIOD-001", signature="SIG_STALE_QTR_MATCHES_PRIOR")
```

### Statement-table-first TTM builder

```python
def build_ttm(source_bundle):
    latest_q = parse_discrete_quarter(source_bundle.latest_10q)
    q_minus_1 = resolve_prior_quarter(source_bundle, latest_q)
    q_minus_2 = resolve_prior_quarter(source_bundle, q_minus_1)
    q_minus_3 = resolve_prior_quarter(source_bundle, q_minus_2)

    quarter_manifest = [latest_q, q_minus_1, q_minus_2, q_minus_3]
    ttm = sum_quarters(quarter_manifest)
    reconcile_to_companyfacts(ttm, source_bundle.companyfacts)
    return quarter_manifest, ttm
```

### Critical-field collapse

```python
CRITICAL_FACT_FIELDS = [
    "latest_quarter.revenue",
    "latest_quarter.operating_income",
    "ttm.revenue",
    "ttm.gross_margin",
    "ttm.operating_cash_flow",
    "ttm.gaap_free_cash_flow",
    "balance_sheet.total_equity",
    "shares.point_in_time",
]

if any_critical_field_failed(rule_results):
    gate.facts_publishable = False
    gate.valuation_publishable = False
    output.status = "WITHHOLD_ALL"
    output.valuation = None
    output.valuation_confidence = None
```

## 4. Critical design rules

### Mandatory

- deterministic facts must validate before any narrative is trusted
- companyfacts may reconcile but may not drive quarter identity
- weighted-average diluted shares must not be used for market cap
- DCF EV must never be used inside market multiple calculations
- cyclical DCF must not publish if history is insufficient

### Recommendations

- preserve XBRL context ids in the artifact bundle
- store statement-table row and column lineage
- capture both filing-date and period-end metadata for every critical value

### Future enhancements

- automated confidence calibration using historical backtests
- sector-specific cycle-state thresholds
- statement-parser fuzz testing across issuers


---

# Publish gate semantics

## 1. Two-stage gate

### Gate 1 — Facts gate

Question: **Are the core facts safe to publish?**

Pass requires:

- all critical fact validators pass
- no stale market data for price-sensitive fields
- provenance complete for all critical numbers

If Gate 1 fails:

- status = `WITHHOLD_ALL`
- emit diagnostic artifact only
- no valuation section
- no confidence score
- no target price
- no investment conclusion

### Gate 2 — Valuation gate

Question: **Are valuation prerequisites safe enough to publish a verdict?**

Pass requires:

- Gate 1 already passed
- cyclical history sufficiency passes
- normalized model inputs are traceable
- multiple math is consistent
- peer-set and scenario assumptions are validated
- no high-severity valuation rule failures

If Gate 2 fails:

- status = `PUBLISH_FACTS_ONLY`
- publish facts + derived metrics
- set `valuation_status = withheld`
- omit fair value, margin of safety, confidence score, and investment conclusion

## 2. Gate statuses

| Status | Facts | Valuation | User-visible behavior |
|---|---|---|---|
| `WITHHOLD_ALL` | failed | blocked | diagnostic artifact only |
| `PUBLISH_FACTS_ONLY` | passed | failed / withheld | publish facts, no verdict |
| `PUBLISH_WITH_WARNINGS` | passed | passed with non-critical warnings | publish full report + explicit caveats |
| `PUBLISH_FULL` | passed | passed cleanly | publish full report |

## 3. Confidence semantics

| State | Confidence field |
|---|---|
| `WITHHOLD_ALL` | `null` |
| `PUBLISH_FACTS_ONLY` | `null` for valuation |
| `PUBLISH_WITH_WARNINGS` | numeric allowed |
| `PUBLISH_FULL` | numeric allowed |

**Rule:** confidence must never imply valuation usability when the verdict is withheld.

## 4. Gate pseudocode

```python
def publish_gate(rule_results, valuation_prereqs):
    if has_high_fact_fail(rule_results) or missing_critical_fact(rule_results):
        return GateDecision(
            status="WITHHOLD_ALL",
            facts_publishable=False,
            valuation_publishable=False,
            valuation_confidence=None
        )

    if has_high_valuation_fail(valuation_prereqs) or insufficient_history_for_cyclical_dcf(valuation_prereqs):
        return GateDecision(
            status="PUBLISH_FACTS_ONLY",
            facts_publishable=True,
            valuation_publishable=False,
            valuation_confidence=None
        )

    if has_medium_noncritical_warning(rule_results, valuation_prereqs):
        return GateDecision(
            status="PUBLISH_WITH_WARNINGS",
            facts_publishable=True,
            valuation_publishable=True
        )

    return GateDecision(
        status="PUBLISH_FULL",
        facts_publishable=True,
        valuation_publishable=True
    )
```

## 5. Required block conditions

The system must block publication of any valuation verdict if any of the following are true:

- latest quarter fails identity checks
- TTM revenue fails reconciliation
- TTM margins fail reconciliation
- operating cash flow fails reconciliation
- GAAP free cash flow fails reconciliation
- balance-sheet core fields fail reconciliation
- share-count basis fails reconciliation
- cyclical history is insufficient for DCF normalization
- valuation model depends on missing or unvalidated normalized assumptions

## 6. Leak-prevention rules

When status is `WITHHOLD_ALL` or `PUBLISH_FACTS_ONLY`, the following must not appear anywhere in the user-facing report:

- fair value
- target price
- margin of safety
- valuation confidence score
- investable verdict such as undervalued, overvalued, fair value, buy, hold, or sell

## 7. Implementation note

The publish gate must be **deterministic** and must execute **before** any LLM narrative is rendered. Narrative generation must inspect gate outputs, not influence them.


---

# Implementation guidance for workflow + LLM usage

## 1. Recommended module boundaries

```text
src/
  sec/
    filingDiscovery.ts
    filingDownload.ts
    ixbrlStatementParser.ts
    statementTableNormalizer.ts
    companyfactsReconciler.ts
    annualHistoryLoader.ts
  market/
    priceSnapshot.ts
  core/
    provenance.ts
    periodResolver.ts
    canonicalFacts.ts
    quarterManifest.ts
  validation/
    rules.ts
    factGate.ts
    valuationGate.ts
    ruleCatalog.ts
  valuation/
    cycleClassifier.ts
    normalization.ts
    dcf.ts
    multiples.ts
    reverseDcf.ts
  loop/
    ralph.ts
    diagnosis.ts
    patchPlanner.ts
    regressionHarness.ts
  llm/
    evidencePack.ts
    narrative.ts
    redteam.ts
  reports/
    renderFactsOnly.ts
    renderFull.ts
```

## 2. Source precedence

### Mandatory precedence

1. latest filing statement tables or iXBRL instance
2. filing cover page, notes, balance sheet, cash-flow statement
3. official company earnings-release comparative tables
4. companyfacts reconciliation layer
5. market data feed for price only
6. news, blogs, transcripts, or context sources only for narrative; never for core facts

## 3. Statement-table-first implementation guidance

### Mandatory

- parse the latest 10-Q discrete quarter from statement tables
- do not infer latest quarter from aggregate companyfacts durations
- store the exact filing accession and period-end used for every field
- for annual-derived Q4 values, preserve the derivation chain

### Recommended

- parse and preserve XBRL context ids
- store raw table row and column labels alongside normalized field maps

### Future

- add OCR fallback only if no structured filing is available

## 4. LLM usage rules

### Allowed LLM tasks

- evidence extraction from filing text into structured evidence objects
- narrative synthesis from locked deterministic facts
- red-team critique of assumptions
- root-cause explanation from structured failure graphs

### Forbidden LLM tasks

- computing or repairing financial facts
- selecting periods
- choosing quarter identities
- computing market cap, EV, P/E, or FCF
- replacing missing data with estimates
- overriding validator failures
- publishing a verdict when gates fail

## 5. Evidence pack schema

```json
{
  "evidence_id": "E-000123",
  "ticker": "MU",
  "category": "customer_concentration",
  "source_type": "10-K",
  "accession": "0000723125-25-000028",
  "period_end": "2025-08-28",
  "section": "Certain Concentrations / Risk Factors",
  "excerpt": "In 2025, over half of our total revenue came from our top ten customers...",
  "freshness_date": "2025-10-03",
  "confidence": "high"
}
```

## 6. Logging and evidence retention

### Mandatory

- raw source retention
- parsed statement tables
- quarter manifest
- formula traces for all derived metrics
- validator results
- publish decision
- all LLM prompts and responses

### Recommended

- provenance graph viewer
- HTML diff view versus golden snapshot

## 7. Golden regression fixture design

Create a frozen Micron fixture with:

- latest 10-Q accession
- latest 10-K accession
- quarter data inputs
- annual history inputs
- frozen market price snapshot
- expected canonical facts
- expected gate state

Use the frozen price snapshot for CI so the baseline stays stable. Use live price only in a separate live-smoke job.

## 8. Mandatory vs recommended vs future

### Mandatory for next implementation pass

- statement-table-first TTM builder
- hard period identity checks
- critical-field gate collapse
- two-stage publish gate
- Micron golden regression fixture
- 5-year history loader for cyclical names
- deterministic rule engine with artifact bundle

### Recommended next

- more benchmark companies
- peer-set registry by industry
- valuation-prerequisite explainability panel

### Future

- analyst override workflow with full audit trail
- sector-specific normalization templates
- automated benchmark expansion


---

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

## Return after each iteration

1. failed rule ids
2. root-cause hypothesis
3. patch summary
4. regression result
5. current gate state
6. next action


---

# Acceptance criteria / definition of done

## 1. Mandatory acceptance tests

| ID | Requirement | Pass condition |
|---|---|---|
| `MU-SRC-001` | latest filing discovery | latest 10-Q and 10-K match Micron’s current filings |
| `MU-QTR-001` | latest quarter identity | latest quarter equals Q2 FY2026 values from filing |
| `MU-TTM-001` | TTM revenue | 58.119B ± tolerance |
| `MU-TTM-002` | TTM operating cash flow | 30.653B ± tolerance |
| `MU-TTM-003` | TTM GAAP free cash flow | 10.281B ± tolerance |
| `MU-BS-001` | latest balance sheet | cash/investments 16.627B; debt 10.142B; equity 72.459B |
| `MU-SH-001` | share-count basis | point-in-time shares = 1,127,734,051; diluted EPS basis separate |
| `MU-MKT-001` | market cap math | about 474.314B at frozen price 420.59 |
| `MU-MULT-001` | trailing P/E math | about 19.86x |
| `MU-GATE-001` | facts gate | pass |
| `MU-GATE-002` | valuation gate | withhold for golden baseline |
| `MU-GATE-003` | no verdict leak | no fair value, target price, margin of safety, or valuation confidence in golden output |
| `BROKEN-FIX-001` | critical failure behavior | intentionally broken fixture returns `WITHHOLD_ALL` |
| `RLOOP-001` | artifact completeness | every iteration emits full artifact bundle |
| `REG-001` | no regression | accepted patch must not worsen any prior passing benchmark |

## 2. Tolerances

### Mandatory default tolerances

- dollar statement values: `max(USD 1 million, 0.1%)`
- per-share values: `USD 0.01`
- percentages: `0.1 percentage point`
- market-data-driven ratios in frozen tests: exact to stored snapshot rounding
- share counts: exact integer for frozen baseline

## 3. Done means

The workflow is "done" for this phase only when:

1. Micron passes the golden regression suite.
2. The workflow uses statement tables or iXBRL first.
3. Any quarter-selection error is caught before narrative.
4. Any TTM mismatch blocks the verdict.
5. Any insufficient-history cyclical DCF is withheld.
6. Gate behavior matches policy:
   - broken facts -> `WITHHOLD_ALL`
   - good facts / insufficient valuation prerequisites -> `PUBLISH_FACTS_ONLY`
7. The LLM cannot change numbers or override the gate.
8. The system emits enough artifacts that a human can identify the exact failing field, source, and derivation chain in one iteration.

## 4. Exit criteria for the current release

### Mandatory

- deterministic facts are stable for Micron
- publish gate is wired to critical validation failures
- valuation verdict is withheld when prerequisites fail
- CI includes Micron frozen fixture
- artifact bundle is preserved for every run

### Recommended

- add at least one non-cyclical benchmark before broad rollout
- add a benchmark with intentionally malformed period ordering
- add a benchmark with stale market-data fixture to verify gate behavior

### Future

- sector-specific acceptance packs
- valuation backtesting
- analyst-override audit workflow


---

# Source references and provenance notes

This file lists the core reference sources used to build the golden Micron baseline and the workflow specification snapshot.

## SEC / EDGAR

1. SEC EDGAR API overview  
   https://www.sec.gov/search-filings/edgar-application-programming-interfaces

## Micron primary investor-relations sources used in the frozen baseline

2. Micron Q2 FY2026 10-Q / filing materials (quarter ended 2026-02-26)  
   https://investors.micron.com/static-files/236af4a3-d99f-4287-b088-09721d0f6ace

3. Micron Q2 FY2026 earnings release / quarter update  
   https://investors.micron.com/node/50256/pdf

4. Micron FY2025 Q4 / full-year results release  
   https://investors.micron.com/node/49371/pdf

5. Micron FY2025 10-K or filing-linked annual materials  
   https://investors.micron.com/static-files/7a1f8c6f-1ce9-4efe-bc6e-722b6b9c4550

6. Micron Q1 FY2026 results release  
   https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-first-quarter-fiscal-2026

7. Micron business unit reorganization announcement  
   https://investors.micron.com/news-releases/news-release-details/micron-announces-business-unit-reorganization-capitalize-ai

8. Micron exit from Crucial consumer business announcement  
   https://investors.micron.com/news-releases/news-release-details/micron-announces-exit-crucial-consumer-business

## Notes on usage

- Filing-derived statement tables or iXBRL are the authoritative primary source for quarterly and annual facts.
- Companyfacts is a reconciliation source, not the primary quarter selector.
- Market data should be snapshotted and frozen for golden regression tests.
- The coding workflow should store raw source artifacts, hashes, period-end metadata, and derivation logic for every critical figure.

## Baseline policy note

This source list is a snapshot support file for the frozen regression artifact. The production system must rediscover the latest authoritative sources at execution time and must not assume these URLs remain the latest forever.
