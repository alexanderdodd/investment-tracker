# 05. Screening and analysis framework

## Overview

The industry-page screening system implements the funnel:

- Stage A — universe reduction
- Stage B — sector and industry triage
- Stage C — cheapness screens
- Stage D — quality filter
- Stage E — deep work

The first four stages are deterministic.
Stage E may include LLM analysis, but only after the deterministic screen is complete.

---

## Stage A — universe reduction

### Default deterministic filters
| Filter | Default rule | Purpose |
|---|---|---|
| Exchange | US primary listing only (phase 1) | consistent data coverage |
| Market cap | >= $2B | avoid micro-cap noise |
| Price | >= $5 | avoid penny-stock distortions |
| Liquidity | median daily dollar volume >= $10M over 30 trading days | investability |
| Filing freshness | latest 10-K <= 400 days; latest 10-Q <= 140 days if required | current reporting |
| Exclude shells / OTC | true | data quality / relevance |
| Extreme distress | exclude by default if bankruptcy risk, going-concern warning, or net-cash runway < 12 months and no specialist mode | trap prevention |

### Specialist mode
If enabled, the user can allow:
- small caps
- distressed names
- negative FCF but cash-rich names

These names must be tagged `SPECIALIST_MODE_ONLY`.

---

## Stage B — sector and industry triage

### Sector triage metrics
- sector valuation vs 5Y history
- sector performance vs fundamentals
- earnings revision trend
- macro sensitivity tag
- concentration risk tag

### Industry triage metrics
- industry median forward P/E
- industry median EV/EBITDA
- industry median P/B where relevant
- industry median FCF yield
- industry median ROIC / ROE
- revisions trend
- margin stability
- concentration / cyclicality tag

### Industry hunting-ground score

```text
IndustryHuntingGroundScore =
  0.30 * valuation_vs_history +
  0.20 * revisions_signal +
  0.20 * quality_median_signal +
  0.15 * fundamentals_vs_price_signal +
  0.10 * concentration_penalty +
  0.05 * macro_tailwind_signal
```

Normalized to 0-100.

### Industry states
- `ATTRACTIVE_HUNTING_GROUND`
- `MIXED`
- `CAUTION`
- `UNSUITABLE_FOR_VALUE_SCREEN`

---

## Stage C — cheapness screens

Cheapness is always evaluated relative to the **industry**, not the broad sector.

### Default cheapness signals
A stock passes Stage C if at least **2 of 5** signals are true, and no disqualifier is present.

| Signal | Default rule |
|---|---|
| Forward P/E vs industry median | <= 0.85x industry median |
| EV/EBITDA vs industry median | <= 0.85x industry median |
| EV/EBITDA vs own history | <= 35th percentile of 5Y history |
| P/B with acceptable ROE | P/B <= 0.8x industry median AND ROE >= threshold |
| FCF yield | >= industry median + 2 percentage points |

### Stable-fundamentals modifier
Cheapness only counts as positive if fundamentals are not deteriorating too severely:
- revenue growth > -10% YoY
- gross margin decline < 500 bps YoY
- operating margin decline < 700 bps YoY
- no catastrophic estimate revisions

If these conditions fail, the stock may move into `WATCHLIST_ONLY` or `TRAP_RISK`.

### Industry-framework variants

#### Cyclical semiconductors
Use:
- EV/EBIT
- EV/EBITDA
- EV/Revenue
- P/B
- normalized earnings context

#### Consumer staples / beverages
Use:
- forward P/E
- EV/EBITDA
- FCF yield
- operating margin stability

#### Insurance
Use:
- P/B
- justified P/B vs ROE
- forward P/E
- capital adequacy / leverage context

#### Interactive media / platform businesses
Use:
- forward P/E
- EV/EBIT
- FCF yield
- margin durability

---

## Stage D — quality filter

### Hard-exclusion quality flags
If any hard blocker is true, stock cannot become a `PUBLISHED_VALUE_CANDIDATE`:

- bankruptcy / restructuring risk
- going concern warning
- extreme dilution trend
- severe accounting restatement
- persistent negative cash conversion with no clear explanation
- governance red-flag status if supported by deterministic source

### Default quality signals
| Signal | Default rule |
|---|---|
| Liquidity | current ratio / available liquidity above threshold |
| Leverage | debt/EBITDA and debt/equity within framework bounds |
| Margins | no collapse beyond threshold |
| Dilution | share count growth below threshold |
| Cash conversion | OCF / net income above minimum |
| Returns | ROIC or ROE above minimum for framework |
| Capital allocation | no persistent destructive capital allocation signal |

### Quality score
```text
QualityScore =
  0.20 * leverage_score +
  0.20 * liquidity_score +
  0.20 * margin_stability_score +
  0.15 * dilution_score +
  0.15 * cash_conversion_score +
  0.10 * return_on_capital_score
```

### Trap-risk classification
If cheapness is present but quality is weak, classify as:
- `EXCLUDED_VALUE_TRAP_RISK`

### Watchlist classification
If cheapness is present but confidence is low or one key metric is missing, classify as:
- `WATCHLIST_ONLY`

---

## Stage E — deep work

Only a limited shortlist should reach this stage.

### Inputs
- deterministic screen outputs
- stock valuation artifact
- peer analysis artifact
- filing bundle
- industry context

### LLM tasks allowed
- summarize the business model
- explain why the market may be discounting the stock
- identify temporary vs structural concerns
- summarize risk factors from filings
- draft a candidate memo

### LLM tasks forbidden
- invent valuation metrics
- overwrite deterministic screen states
- promote a stock to `PUBLISHED_VALUE_CANDIDATE` on prose alone

### Candidate publication threshold
A stock becomes `PUBLISHED_VALUE_CANDIDATE` only if:
- Stage C passes
- Stage D passes
- stock valuation label is `CHEAP` or `FAIR with positive expected return`
- valuation confidence >= 0.65
- peer pack status is `VALIDATED`
- no hard trap flags
- deep work does not identify a thesis-breaking concern

---

## Result buckets shown on industry page

### `PUBLISHED_VALUE_CANDIDATE`
Strongest output. Safe to show as a potential value idea.

### `SCREEN_PASS`
Cheap and decent quality, but still missing stock-level validation or deep work.

### `NEEDS_DEEP_WORK`
Interesting name, but more analysis needed before surfacing as a candidate.

### `WATCHLIST_ONLY`
Worth monitoring; not ready to treat as a value idea.

### `EXCLUDED_VALUE_TRAP_RISK`
Statistically cheap, but filtered out due to structural or balance-sheet concerns.
