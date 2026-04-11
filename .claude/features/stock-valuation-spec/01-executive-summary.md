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
