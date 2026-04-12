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

The latest-quarter and TTM facts show Micron in an exceptionally strong earnings regime, not merely "emerging from a trough."

- Q2 FY2026 gross margin: **74.4%**
- Q2 FY2026 operating margin: **67.6%**
- TTM gross margin: **58.4%**
- TTM operating margin: **48.3%**

These sit far above Micron's FY2021–FY2025 averages:

- 5-year average gross margin: **27.2%**
- 5-year average operating margin: **9.7%**

Management's Q3 FY2026 guide of **$33.5B revenue** and about **81% GAAP gross margin** points to even stronger near-term conditions.

### 4.2 Structural and risk context

Micron's current earnings power is being helped by AI-driven memory demand, but the filing-derived evidence still supports a cautious interpretation of durability:

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

## 6. Facts-only rendering contract (new mandatory baseline rule)

When the report is in a `FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD` state, the user-facing report may include only:

### Allowed classes

- **Class A — authoritative facts**
  - filing-derived quarter facts
  - filing-derived TTM facts
  - filing-derived annual history
  - filing-derived balance-sheet facts
- **Class B — directly traced deterministic derivations**
  - market cap
  - enterprise value
  - trailing P/E
  - P/B
  - EV/Revenue
  - EV/EBIT
  - EV/FCF
- **Class D — evidence-backed qualitative claims**
  - contract duration
  - customer concentration
  - segment mix
  - geographic exposure
  - competitor references
  - guidance
  - only when grounded in an evidence pack

### Forbidden in facts-only state unless separately validated and allowlisted

- fair value
- target price
- margin of safety
- valuation confidence
- scenario outputs
- normalized FCF
- cycle confidence score
- ROE / ROIC / interest coverage
- any five-year average if annual-history validation failed
- any numeric claim without a formula trace or source provenance

### Dependency rule

If any upstream validator that governs a field fails, the field and all sentences depending on it must be suppressed from the rendered report.

Examples:
- if `HIST-004` fails, suppress 5-year averages and any narrative comparing current margins to those averages
- if `VAL-002` fails, suppress normalized FCF and cycle-adjusted cash-flow commentary
- if `TRACE-004` fails, suppress ROE, ROIC, and interest coverage

---

## 7. Machine-readable baseline expectations

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
  "annual_history": {
    "five_year_avg_gross_margin": 27.18,
    "five_year_avg_operating_margin": 9.70
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
