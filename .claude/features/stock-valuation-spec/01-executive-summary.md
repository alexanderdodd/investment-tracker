# Executive summary

This vNext specification makes **deterministic reconciliation plus render-surface integrity** the non-negotiable contract for the stock valuation workflow.

The workflow must:

1. build quarterly and trailing-twelve-month facts from **statement tables or iXBRL in the latest 10-Q and 10-K first**
2. reconcile those facts to secondary sources second
3. validate all critical facts deterministically
4. validate report-surface eligibility for any derived or model-driven field
5. **block any valuation verdict** if critical fields or valuation prerequisites fail

For Micron, the latest authoritative financial base for the frozen regression snapshot remains:

- **Q2 FY2026 10-Q filed March 19, 2026 for the quarter ended February 26, 2026**
- **FY2025 10-K filed October 3, 2025 for the year ended August 28, 2025**
- prior official quarterly releases needed for the trailing-twelve-month roll-forward
- a frozen market-price snapshot of **$420.59**

Using that filing-first approach, the reconciled baseline remains:

- latest-quarter revenue: **$23.860B**
- TTM revenue: **$58.119B**
- TTM GAAP net income: **$24.111B**
- TTM GAAP operating cash flow: **$30.653B**
- TTM GAAP free cash flow: **$10.281B**
- cash and investments: **$16.627B**
- total debt: **$10.142B**
- point-in-time shares outstanding: **1,127,734,051**

## What changed in this vNext spec

This update incorporates the main lessons from the latest Ralph loop review:

- the **fact layer** is much improved, but the **facts-only narrative still leaked invalid analytics**
- historical averages were still wrong because the pipeline likely mixed annual history with recent quarterly data
- some derived metrics appeared without visible formula traces
- the report surfaced model-driven outputs in a `PUBLISH_FACTS_ONLY` state
- the iteration artifacts were still incomplete for deep forensic debugging

## vNext priorities

The next Ralph loop iterations must explicitly solve:

1. **HIST-004** — annual-history-only five-year averages for cyclical names
2. **formula traceability** for every surfaced non-primitive value
3. **dependency-aware suppression** in facts-only and withheld states
4. **negative control validation** with intentionally broken fixtures
5. **dual artifact persistence** with DB + file-based iteration reports
6. **strict frozen-fixture tolerances** for point-in-time share counts and historical averages

## Core operating rule

A valuation report may only publish a fair-value verdict if all of the following are true:

1. deterministic fact extraction passed
2. critical-field reconciliation passed
3. valuation prerequisites passed
4. publish gate passed
5. report-surface validation passed
6. narrative was generated only from locked validated artifacts

If those conditions are not met, the correct outputs are either:

- **diagnostic artifact only**, or
- **facts-only artifact with valuation withheld**

That is the target safe behavior for the current phase.
