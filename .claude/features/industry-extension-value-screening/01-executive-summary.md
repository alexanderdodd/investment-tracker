# 01. Executive summary

## Goal

Extend the current sector pages so the user can:
1. see the industries inside a sector,
2. understand which industries are attractive hunting grounds for value,
3. run a deterministic value screen from an industry page,
4. review a shortlist of candidate stocks,
5. distinguish between:
   - cheap statistical screens,
   - high-quality potential value candidates,
   - names that still need deep work,
   - likely value traps.

## Core design idea

Use **GICS sector** for top-down navigation and **GICS industry / sub-industry** for actual comparability and screening.

- Sector answers: **Where should I look?**
- Industry answers: **Who is actually comparable?**
- Stock valuation answers: **Is this company cheap, fair, or expensive?**

## Why this matters

The existing sector pages are useful for top-down context, but they stop before the user can turn that context into an actionable shortlist.
This feature closes that gap by adding an industry layer and a structured screening funnel.

## Product boundaries

This feature does **not** claim that a screened stock is investable by default.
It creates a disciplined funnel:

- Stage A: universe reduction
- Stage B: sector and industry triage
- Stage C: cheapness screens
- Stage D: quality filter
- Stage E: deep work and valuation

Only Stage E can produce a publishable stock-level "value candidate" conclusion.

## Publish safety

There are now three separate publication decisions:

1. `factsGate` — can we publish the stock facts?
2. `valueGate` — can we publish fair value / cheap-fair-expensive?
3. `candidateGate` — can we publish this stock as a value candidate inside the industry experience?

If the candidate gate fails, the stock may still appear in the industry screen, but only as:

- `SCREEN_PASS`
- `NEEDS_DEEP_WORK`
- `WATCHLIST_ONLY`
- `EXCLUDED_VALUE_TRAP_RISK`

## Benchmark examples used in validation

This spec includes benchmark expectations for:
- `MU` — cyclical semiconductor / memory
- `KO` — beverages / staples
- `ALL` — insurance / financials
- `META` — interactive media & services

These examples are used to validate:
- taxonomy mapping,
- industry placement,
- peer-pack appropriateness,
- relative-metric choice,
- candidate-publication logic.
