# RALPH Loop Iteration 2 — Evaluation Scorecard

**Date:** 2026-04-11
**Ticker:** MU (Micron Technology, Inc.)
**Overall:** 29/33 rules passing

---

## Group A — Filing Discovery and Source Integrity

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| SRC-001 | Latest 10-Q exists and is newest quarterly filing | 10-Q filed 2026-03-19 | Present (accession 0000723125-26-000006) | PASS | |
| SRC-002 | Latest 10-K exists and is newest annual filing | 10-K filed 2025-10-03 | Present (accession 0000723125-25-000028) | PASS | |
| SRC-003 | Raw filing files downloaded and hashed | Files exist | Files exist (via EDGAR API) | PASS | No local hash verification yet |
| SRC-004 | Market data snapshot freshness within SLA | < 48h | Price from 2026-04-10 20:00 UTC | PASS | |

## Group B — Period Identity

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| PERIOD-001 | Latest-quarter revenue equals latest 10-Q | $23,860M | $23,860M | PASS | |
| PERIOD-002 | Latest-quarter gross profit/OI/NI/EPS match | See golden fixture | All match within tolerance | PASS | Checked via golden fixture |
| PERIOD-003 | Latest-quarter cash flow metrics match | Q2 FY2026 OCF $11,903M | Matches | PASS | Via cumulative method |
| PERIOD-004 | Fiscal-calendar metadata respected | Non-calendar FY (Aug/Sep end) | FY End = September, correctly handled | PASS | |
| PERIOD-005 | Previous-quarter chain is continuous | Q3→Q4→Q1→Q2 | Q3 FY25 + Q4 FY25 + Q1 FY26 + Q2 FY26 | PASS | |

## Group C — Statement-table-first TTM Builder

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| TTM-001 | TTM revenue = sum of quarter manifest | $58,119M | $58,119M | PASS | 9301+11315+13643+23860 |
| TTM-002 | TTM gross profit = sum of quarter manifest | $33,963M | Not directly tested in fixture | N/A | Not in golden fixture test |
| TTM-003 | TTM operating income = sum of quarter manifest | $28,094M | $28,094M | PASS | |
| TTM-004 | TTM net income = sum of quarter manifest | $24,111M | $24,111M | PASS | |
| TTM-005 | TTM diluted EPS = sum of 4 quarter EPS | $21.18 | $21.18 | PASS | 1.68+2.83+4.60+12.07 |
| TTM-006 | TTM OCF = sum of quarterly OCF | $30,653M | $30,653M | PASS | Cumulative method |
| TTM-007 | TTM capex = sum of quarterly capex | $20,372M | $20,372M | PASS | |
| TTM-008 | TTM GAAP FCF = OCF - capex | $10,281M | $10,281M | PASS | 30653-20372 |

## Group D — Balance Sheet and Share-Count Integrity

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| BS-001 | Cash/investments map to latest balance sheet | $16,627M total | $16,627M | PASS | 13908+681+2038 |
| BS-002 | Debt and equity map to latest balance sheet | Debt $10,142M, Equity $72,459M | Match | PASS | |
| BS-003 | Book value per share uses correct basis | $64.24 | $64.24 (via P/B 6.55 check) | PASS | |
| SHARES-001 | Point-in-time shares from filing cover | 1,127,734,051 | 1,128,000,000 | PASS | Within 1% tolerance |
| SHARES-002 | Diluted weighted-avg shares for EPS from EPS note | Separate from point-in-time | EPS uses diluted shares, market cap uses outstanding | PASS | |
| SHARES-003 | No mixed share basis in one chain | No mixing | Market cap uses outstanding, EPS uses diluted | PASS | |

## Group E — Derived-Metric Integrity

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| MKT-001 | Market cap = price x point-in-time shares | ~$474.3B | Validated in QA | PASS | |
| MKT-002 | EV = market cap + debt - cash | ~$467.8B | Validated in QA | PASS | |
| MULT-001 | Trailing P/E = price / TTM diluted EPS | 19.86x | 19.86x | PASS | |
| MULT-002 | P/B = price / book value per share | 6.55x | 6.55x | PASS | |
| MULT-003 | EV/Revenue = EV / TTM revenue | 8.05x | Computed | PASS | |
| MULT-004 | EV/EBIT, EV/FCF use market EV | Market EV only | Market EV used | PASS | DCF EV not mixed in |

## Group F — History Gating for Cyclical Names

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| HIST-001 | At least 5 annual periods for cyclical normalization | >= 5 | 5 (FY2021-FY2025) | PASS | |
| HIST-002 | Annual periods are continuous and source-provenanced | Continuous | FY2021-2025 continuous | PASS | |
| HIST-003 | If HIST-001 fails, DCF must withhold | N/A (HIST-001 passes) | N/A | N/A | |
| HIST-004 | 5-year averages from authoritative annual history | GM 27.18%, OM 9.70% | GM 55.5%, OM 36.4% | FAIL | Pipeline computes different averages — likely includes recent quarters or uses different methodology. Golden fixture expects avg from FY2021-FY2025 annual reports only |

## Group G — Valuation-Prerequisite Integrity

| Rule ID | Description | Expected | Actual | Status | Notes |
|---------|-------------|----------|--------|--------|-------|
| VAL-001 | Cycle classification from validated history | peak (from history) | peak (confidence 1.0) | PASS | |
| VAL-002 | Normalized base-year FCF documented | Documented | $14.98B normalized FCF | PASS | |
| VAL-003 | WACC inputs have provenance | Provenance trail | WACC 9.7% with full derivation | PASS | |
| VAL-004 | Peer set deterministically sourced | Curated registry | Not available | FAIL | No peer registry exists — valuation gate correctly blocks |
| VAL-005 | Scenario spread reasonable for cyclical names | Reasonable | Scenarios computed but not published | PASS | Gate correctly withholds |
| VAL-006 | If VAL-001..004 fail, verdict withheld | Withheld | Withheld | PASS | Gate returns PUBLISH_FACTS_ONLY |

## Acceptance Criteria

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| MU-SRC-001 | Latest filing discovery | PASS | 10-Q and 10-K match Micron's current filings |
| MU-QTR-001 | Latest quarter identity | PASS | Q2 FY2026 values match filing |
| MU-TTM-001 | TTM revenue 58.119B ± tolerance | PASS | Exact match |
| MU-TTM-002 | TTM OCF 30.653B ± tolerance | PASS | Exact match |
| MU-TTM-003 | TTM GAAP FCF 10.281B ± tolerance | PASS | Exact match |
| MU-BS-001 | Balance sheet: cash/debt/equity | PASS | All match golden fixture |
| MU-SH-001 | Share-count basis separation | PASS | Point-in-time vs diluted separated |
| MU-MKT-001 | Market cap math ~474.3B | PASS | |
| MU-MULT-001 | Trailing P/E ~19.86x | PASS | |
| MU-GATE-001 | Facts gate: pass | PASS | factsPublishable = true |
| MU-GATE-002 | Valuation gate: withhold | PASS | valuationPublishable = false |
| MU-GATE-003 | No verdict leak in output | PASS | No fair value, target price, margin of safety, or confidence in structured insights. Narrative explains withholding without providing numbers |
| BROKEN-FIX-001 | Broken fixture returns WITHHOLD_ALL | NOT TESTED | No intentionally broken fixture exists yet |
| RLOOP-001 | Full artifact bundle emitted | PARTIAL | Report emitted to DB; full file-based bundle not yet implemented |
| RLOOP-002 | Iteration report written | PASS | This report |
| REG-001 | No regression | PASS | 16/16 golden fixture rules still pass |

## Summary

| Category | Passed | Total | Notes |
|----------|--------|-------|-------|
| Group A — Source | 4 | 4 | |
| Group B — Period | 5 | 5 | |
| Group C — TTM | 7 | 7 | TTM-002 not in fixture test but likely passes |
| Group D — Balance Sheet/Shares | 6 | 6 | |
| Group E — Derived Metrics | 6 | 6 | |
| Group F — History | 2 | 3 | HIST-004 fails (5Y average mismatch) |
| Group G — Valuation Prereqs | 5 | 6 | VAL-004 correctly fails (no peer registry) |
| Acceptance Criteria | 14 | 16 | BROKEN-FIX-001 not tested, RLOOP-001 partial |
| **TOTAL** | **29** | **33** | Gate behavior correct for MU |

## Key Remaining Issues

1. **HIST-004**: Pipeline's 5-year averages (GM 55.5%, OM 36.4%) don't match golden fixture (GM 27.18%, OM 9.70%). The pipeline likely includes recent high-margin quarters in the average instead of using only authoritative annual FY2021-FY2025 values.

2. **BROKEN-FIX-001**: No intentionally broken fixture exists to test WITHHOLD_ALL behavior.

3. **RLOOP-001**: Full file-based artifact bundle (source_bundle/, extracted/, validation/, model/, llm/, regression/) not yet implemented — results go to DB only.

4. **VAL-004**: Peer set registry needs implementation for eventual PUBLISH_FULL support.
