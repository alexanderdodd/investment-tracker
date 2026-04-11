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
