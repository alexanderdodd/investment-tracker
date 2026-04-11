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
