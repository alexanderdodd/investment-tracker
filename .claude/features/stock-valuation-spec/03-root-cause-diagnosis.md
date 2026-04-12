# Root-cause diagnosis of current workflow failures

The current workflow failures are consistent with a **stale-quarter bug + incomplete-history bug + broken gate wiring**.

The latest Ralph loop review adds a second layer of diagnosis:

- the fact layer is largely repaired
- the **report-surface layer is not yet safe enough**
- invalid or insufficiently traced analytics can still leak into a facts-only report

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
| 5-year averages in facts-only report were wrong | Golden baseline requires 27.18% GM and 9.70% OM from FY2021–FY2025 annual history only | History-averaging code likely included recent quarters or non-annual data | High |
| Facts-only report surfaced normalized FCF / weakly traced ratios | Facts-only state should show only allowlisted facts and directly traced derivations | Missing formula-trace validation and missing dependency-aware suppression | High |
| Frozen share count passed with loose tolerance | Frozen Micron share count should be exact integer match | Tolerance policy too loose for golden fixture | Medium |
| No intentionally broken fixture proves `WITHHOLD_ALL` | Broken-fixture negative control is mandatory | Negative-control harness not implemented | High |
| Iteration artifacts were only partially persisted for review | Full iteration-level forensic review requires run manifest, quarter manifest, formula traces, suppression audit, artifact inventory | Artifact contract incomplete | Medium |

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

## 4. Tertiary diagnosis from the latest Ralph loop review

The latest implementation context reveals a third class of issues:

### 4.1 Report-surface integrity gap

The pipeline can now correctly withhold the valuation verdict, but it still allows some invalid analytics to appear in the facts-only report.

This means the system needs:
- a **surface allowlist**
- a **suppression audit**
- a **formula-trace requirement**
- dependency-aware hiding of any field whose upstream validator failed

### 4.2 Historical-average contamination

The current implementation likely computes five-year averages using:
- recent quarterly data
- TTM data
- or a mixed methodology

For cyclical names, five-year averages must be computed from:
- authoritative annual periods only
- continuous fiscal years only
- frozen or rediscovered annual source bundles only

### 4.3 Traceability blind spots

Metrics such as:
- interest coverage
- ROE / ROIC
- normalized free cash flow
- cycle confidence

must not appear unless:
- they have a machine-readable formula trace
- every dependency is validated
- their publication class is allowed for the current gate state

### 4.4 Negative-control gap

The system still lacks a mandatory broken-fixture test that proves:
- a critical deterministic failure results in `WITHHOLD_ALL`
- the user-facing report is diagnostic only
- no valuation or facts-only report is leaked

### 4.5 Observability gap

The DB artifact store is useful, but iteration debugging still needs:
- run manifest
- quarter manifest
- formula traces
- suppression audit
- artifact inventory
- negative-control results
- file-based iteration reports

## 5. Design implications

The diagnosis implies the following implementation priorities, in order:

1. **Fix HIST-004** so five-year averages are annual-only and exact
2. **Add formula-trace validation** for all surfaced derived metrics
3. **Add dependency-aware suppression** in facts-only reports
4. **Tighten frozen-fixture tolerances**, especially share count
5. **Add a broken-fixture negative control**
6. **Add artifact completeness requirements** for debugging and audit
7. **Keep prompt-only fixes prohibited** for deterministic failures

## 6. What not to do

Do not try to patch these issues with narrative prompts.

If any deterministic validator fails in:

- quarter identity
- TTM construction
- balance-sheet mapping
- share-count basis
- market-cap / EV math
- annual-history averages
- formula trace coverage
- report-surface suppression

then the next fix must be in:

- source discovery
- filing parser
- statement-table parser
- period resolver
- mapper
- annual-history loader
- validation logic
- renderer policy
- publish-gate wiring

Prompt-only fixes are invalid for these failure classes.
