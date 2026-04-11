# RALPH Loop Iteration 1 — Execution Report

**Date:** April 11, 2026
**Ticker:** MU (Micron Technology, Inc.)
**Golden fixture:** `src/lib/valuation/__tests__/fixtures/golden-mu.json`
**Starting pass rate:** 4/16
**Final pass rate:** 16/16
**Gate decision:** `FACTS_PUBLISHABLE`

---

## 1. Starting State (v2 Pipeline)

The v2 pipeline used SEC EDGAR's `companyfacts` XBRL API as the primary data source, with a `getValueForPeriod` function that matched entries by fiscal year (`fy`) and fiscal period (`fp`). This produced severely wrong results for Micron due to:

- Micron's non-calendar fiscal year (ends late August, not December)
- SEC EDGAR storing both cumulative (YTD) and discrete (single-quarter) entries under the same `fy`/`fp` labels
- Cash flow statements only having discrete frames for Q1, with Q2/Q3 as cumulative entries
- Duplicate `fy` values where the same physical fiscal year appeared under different `fy` numbers

**Initial test results (4/16 passing):**

| Rule | Field | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| PERIOD-001 | latest_quarter.revenue | $23,860M | $16,762M | FAIL |
| TTM-001 | ttm.revenue | $58,119M | $25,735M | FAIL |
| TTM-003 | ttm.operating_income | $28,094M | $2,441M | FAIL |
| TTM-004 | ttm.net_income | $24,111M | $1,958M | FAIL |
| TTM-005 | ttm.diluted_eps | $21.18 | $0.93 | FAIL |
| TTM-006 | ttm.ocf | $30,653M | $7,968M | FAIL |
| TTM-007 | ttm.capex | $20,372M | $13,167M | FAIL |
| TTM-008 | ttm.fcf | $10,281M | -$5,199M | FAIL |
| BS-001a | balance_sheet.cash | $13,908M | $13,908M | PASS |
| BS-001b | balance_sheet.total_cash | $16,627M | $15,024M | FAIL |
| BS-002a | balance_sheet.total_debt | $10,142M | $3,624M | FAIL |
| BS-002b | balance_sheet.total_equity | $72,459M | $72,459M | PASS |
| SHARES-001 | shares.point_in_time | 1,127,734,051 | 1,128,000,000 | PASS |
| MULT-001 | trailing_pe | 19.86x | 452.25x | FAIL |
| MULT-002 | price_to_book | 6.55x | 6.55x | PASS |
| HIST-001 | annual_history.count | ≥5 | 2 | FAIL |

---

## 2. Root-Cause Diagnosis

### Primary defect: stale quarter selection

The `getValueForPeriod` function returned the first XBRL entry matching `fy=2026, fp=Q2`, which was the **6-month cumulative** value ($16,762M for revenue = Q1+Q2 of FY2025) rather than the **discrete Q2** ($23,860M).

**Evidence from raw XBRL data:**
```
fy:2026, fp:Q2, start:2025-08-29, end:2026-02-26, val:37,503,000,000  ← 6-month cumulative
fy:2026, fp:Q2, start:2025-11-28, end:2026-02-26, val:23,860,000,000  ← discrete Q2 (has frame CY2026Q1)
```

The function took the first match (cumulative) instead of the discrete entry.

### Secondary defect: cash flow cumulative-only pattern

Cash flow statement entries in SEC XBRL have a fundamentally different structure from income statement entries:

- **Income statement:** Both discrete (framed, ~90 day) and cumulative entries exist for Q2/Q3
- **Cash flow statement:** Only Q1 has a discrete frame. Q2 is reported as 6-month cumulative, Q3 as 9-month cumulative, FY as 12-month

This meant the Q4 derivation (`FY - Q1 - Q2 - Q3`) failed for cash flow items because Q2 and Q3 discrete values didn't exist.

### Tertiary defects

- **Balance sheet tags:** `LongTermDebtCurrent` and `LongTermDebtNoncurrent` contained only 2012-2013 data for Micron. The correct tags were `DebtCurrent` ($585M) and `LongTermDebtAndCapitalLeaseObligations` ($9,557M).
- **Short-term investments:** `AvailableForSaleSecuritiesCurrent` had a stale 2018 entry ($1,116M). The correct tag was `AvailableForSaleSecuritiesDebtSecuritiesCurrent` ($681M).
- **Long-term investments:** Not extracted at all. Added `AvailableForSaleSecuritiesDebtSecuritiesNoncurrent` ($2,038M).
- **Annual history:** The `buildAnnualHistory` function only found 2 years because it deduplicated by `fy` number, but Micron's `fy:2025` appeared twice (for FY2024 ending 2024-08-29 and FY2025 ending 2025-08-28). Fixed by deduplicating by end-date year.

---

## 3. Patches Applied

### Patch 1: Discrete vs cumulative quarter resolution

**File:** `src/lib/sec-edgar/xbrl-mapper.ts` — `getValueForPeriod()`

**Change:** For quarterly income statement items, the function now:
1. Prefers entries with a `frame` field (these are always discrete)
2. Falls back to shortest-duration entry (discrete ~90 days vs cumulative ~180 days)
3. For entries where shortest is still >120 days (cash flow cumulative pattern), derives discrete by subtraction: `Q2_discrete = Q2_cumulative - Q1_discrete`

**Why:** SEC EDGAR stores both cumulative and discrete entries under the same `fy`/`fp` identifier. The previous code took the first match, which was often the cumulative value.

### Patch 2: Cash flow TTM via cumulative method

**File:** `src/lib/sec-edgar/ttm.ts` — `computeTTMCumulative()`

**Change:** Added a fallback TTM computation method for items where discrete quarterly frames don't exist (cash flow statements):

```
TTM = latest_cumulative + (prior_FY - equivalent_prior_cumulative)
```

For Micron Q2 FY2026 OCF:
```
TTM OCF = H1_FY2026 ($20,314M) + (FY2025 ($17,525M) - H1_FY2025 ($7,186M))
        = $20,314M + $10,339M = $30,653M ✓
```

Also added a **contiguity check**: if the discrete-quarter path finds 4 entries that span >400 days or <250 days, or contain duplicates (e.g., four Q1s from different years), it falls through to the cumulative method.

**Why:** Cash flow statements in SEC XBRL only report Q1 as discrete. Q2/Q3 are cumulative YTD. The discrete-quarter-summing approach incorrectly selected four Q1 entries from different fiscal years.

### Patch 3: Q4 derivation by period containment

**File:** `src/lib/sec-edgar/ttm.ts` — `deriveQ4Entries()`

**Change:** When deriving Q4 = FY - Q1 - Q2 - Q3, the function now matches Q1/Q2/Q3 by checking that their `end` date falls **within the annual period** (between the annual `start` and `end` dates), rather than matching by `fy` number.

For Micron FY2025 (period 2024-08-30 to 2025-08-28):
- Q1: end 2024-11-28 → within period ✓ (val $8,709M for revenue, $3,244M for OCF)
- Q2: end 2025-02-27 → within period ✓
- Q3: end 2025-05-29 → within period ✓
- Q4 = FY - Q1 - Q2 - Q3 ✓

**Why:** Micron's non-calendar fiscal year creates duplicate `fy:2025` entries in SEC EDGAR. The old code matched `fy:2025, fp:Q1` to a $4,726M entry (from the OLD fiscal year ending 2023-08-31) instead of the $8,709M entry (from the fiscal year ending 2025-08-28).

### Patch 4: Balance sheet tag priority

**File:** `src/lib/sec-edgar/xbrl-mapper.ts`

**Changes:**
- Current debt: `DebtCurrent` (priority 1) before `LongTermDebtCurrent` (which had only 2012 data for MU)
- Long-term debt: `LongTermDebtAndCapitalLeaseObligations` (priority 1) before `LongTermDebtNoncurrent` (no recent data for MU) and `LongTermDebt`
- Short-term investments: `AvailableForSaleSecuritiesDebtSecuritiesCurrent` (priority 1, has 2026-02-26 data) before `AvailableForSaleSecuritiesCurrent` (stale 2018 data for MU)

**Why:** Companies migrate between XBRL tags over time. The old priority order found a matching tag but with stale data from years ago, because `getLatestInstantValue` returns the most recent entry for whichever tag is checked first — even if that "most recent" is from 2012.

### Patch 5: Long-term marketable investments + instant value extraction

**Files:** `src/lib/sec-edgar/xbrl-mapper.ts`, `src/lib/valuation/canonical-facts.ts`

**Changes:**
- Added `AvailableForSaleSecuritiesDebtSecuritiesNoncurrent` extraction for long-term marketable investments ($2,038M for MU)
- Total cash = cash + ST investments + LT investments ($13,908 + $681 + $2,038 = $16,627M)
- Fixed `getLatestInstantValue` to handle SEC EDGAR's two representations of point-in-time values: entries with an `instant` field, and entries with `end` but no `start`

**Why:** Micron's balance sheet data uses `end` without `start` (not the `instant` field) for point-in-time values. The old code only checked for `instant`, missing all balance sheet data.

---

## 4. Final Validation Results (16/16 PASS)

| Rule | Field | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| PERIOD-001 | latest_quarter.revenue | $23,860M | $23,860M | **PASS** |
| TTM-001 | ttm.revenue | $58,119M | $58,119M | **PASS** |
| TTM-003 | ttm.operating_income | $28,094M | $28,094M | **PASS** |
| TTM-004 | ttm.net_income | $24,111M | $24,111M | **PASS** |
| TTM-005 | ttm.diluted_eps | $21.18 | $21.18 | **PASS** |
| TTM-006 | ttm.ocf | $30,653M | $30,653M | **PASS** |
| TTM-007 | ttm.capex | $20,372M | $20,372M | **PASS** |
| TTM-008 | ttm.fcf | $10,281M | $10,281M | **PASS** |
| BS-001a | balance_sheet.cash | $13,908M | $13,908M | **PASS** |
| BS-001b | balance_sheet.total_cash | $16,627M | $16,627M | **PASS** |
| BS-002a | balance_sheet.total_debt | $10,142M | $10,142M | **PASS** |
| BS-002b | balance_sheet.total_equity | $72,459M | $72,459M | **PASS** |
| SHARES-001 | shares.point_in_time | 1,127,734,051 | 1,128,000,000 | **PASS** (within tolerance) |
| MULT-001 | trailing_pe | 19.86x | 19.86x | **PASS** |
| MULT-002 | price_to_book | 6.55x | 6.55x | **PASS** |
| HIST-001 | annual_history.count | ≥5 | 5 | **PASS** |

**Gate decision:** `FACTS_PUBLISHABLE`

All critical fact validators passed. Zero HIGH failures, zero MEDIUM failures.

---

## 5. Derived Metrics (computed deterministically from validated facts)

| Metric | Value | Formula |
|--------|-------|---------|
| Market cap | ~$474.3B | $420.59 × 1,128M shares |
| Enterprise value | ~$467.8B | $474.3B + $10.1B - $16.6B |
| Trailing P/E | 19.86x | $420.59 / $21.18 |
| Price/Book | 6.55x | $420.59 / $64.24 |
| EV/Revenue | 8.05x | $467.8B / $58.1B |
| TTM gross margin | 58.4% | $34.0B / $58.1B |
| TTM operating margin | 48.3% | $28.1B / $58.1B |
| TTM FCF margin | 17.7% | $10.3B / $58.1B |
| OCF/Net income | 1.27x | $30.7B / $24.1B |
| 5Y avg gross margin | 27.2% | FY2021-FY2025 average |
| 5Y avg operating margin | 9.7% | FY2021-FY2025 average |

---

## 6. Expected Publish Gate State per Spec

The spec (`docs/spec-bundle/02-golden-micron-valuation-report.md`) specifies the expected gate state for the Micron golden fixture as:

> **`FACTS_PUBLISHABLE / VALUATION_VERDICT_WITHHELD`**

**Reason for withholding valuation verdict:** Current margins (74.4% gross, 67.6% operating for latest quarter; 58.4% / 48.3% TTM) are dramatically above the 5-year averages (27.2% gross, 9.7% operating). A single-point DCF is too assumption-sensitive when margins are 2-5x above historical averages for a deeply cyclical semiconductor company. The correct safe behavior is to publish reconciled facts and derived multiples, but omit fair value, target price, margin of safety, and valuation confidence.

**Current state:** The facts gate passes. The valuation gate withholding is defined in the spec but not yet fully implemented in the deterministic QA validators — the current `qa-validators.ts` checks for history sufficiency (HIST-001) but doesn't yet have a specific rule that combines cycle position + margin deviation to trigger valuation withholding. This is a known gap for the next RALPH iteration.

---

## 7. Data Sources and Provenance

All financial data was extracted from SEC EDGAR's `companyfacts` XBRL API (`data.sec.gov/api/xbrl/companyfacts/CIK0000723125.json`).

| Data | Source | XBRL Tag |
|------|--------|----------|
| Revenue | SEC XBRL | `RevenueFromContractWithCustomerExcludingAssessedTax` |
| Gross profit | SEC XBRL | `GrossProfit` |
| Operating income | SEC XBRL | `OperatingIncomeLoss` |
| Net income | SEC XBRL | `NetIncomeLoss` |
| Diluted EPS | SEC XBRL | `EarningsPerShareDiluted` |
| OCF | SEC XBRL | `NetCashProvidedByUsedInOperatingActivities` |
| CapEx | SEC XBRL | `PaymentsToAcquirePropertyPlantAndEquipment` |
| Cash | SEC XBRL | `CashAndCashEquivalentsAtCarryingValue` |
| ST investments | SEC XBRL | `AvailableForSaleSecuritiesDebtSecuritiesCurrent` |
| LT investments | SEC XBRL | `AvailableForSaleSecuritiesDebtSecuritiesNoncurrent` |
| Current debt | SEC XBRL | `DebtCurrent` |
| Long-term debt | SEC XBRL | `LongTermDebtAndCapitalLeaseObligations` |
| Total equity | SEC XBRL | `StockholdersEquity` |
| Shares outstanding | SEC XBRL | `CommonStockSharesOutstanding` |
| Stock price | Yahoo Finance | Real-time quote |

**Latest filings used:**
- 10-Q filed 2026-03-19, period ended 2026-02-26 (accession: 0000723125-26-000006)
- 10-K filed 2025-10-03, period ended 2025-08-28 (accession: 0000723125-25-000028)

**TTM quarters:** Q3 FY2025 + Q4 FY2025 (derived: FY2025 - Q1 - Q2 - Q3) + Q1 FY2026 + Q2 FY2026

**TTM method for income statement items:** Discrete quarter summing (4 framed entries)
**TTM method for cash flow items:** Cumulative approach: H1 FY2026 ($20,314M OCF) + FY2025 remainder ($17,525M - $7,186M = $10,339M) = $30,653M

---

## 8. Known Gaps for Next Iteration

1. **Valuation gate withholding rule:** The spec requires `VALUATION_VERDICT_WITHHELD` for the golden MU baseline, but the current QA validators don't have a rule that combines cycle position detection + margin deviation to block the valuation verdict. The facts gate passes, but the valuation gate needs explicit implementation.

2. **Point-in-time shares precision:** The test uses 1,128,000,000 (rounded from XBRL `CommonStockSharesOutstanding`) while the golden spec expects 1,127,734,051 (from the filing cover page). The XBRL value is rounded to thousands. For exact match, the cover page share count would need to be parsed from the filing HTML.

3. **Filing-table-first parsing:** The spec calls for statement-table-first extraction (parsing actual filing HTML/iXBRL). The current implementation uses the `companyfacts` aggregate API with the cumulative/discrete resolution logic. This works correctly for MU but is a deviation from the spec's preferred architecture.

4. **Artifact bundle:** The spec requires a full artifact bundle per iteration (raw sources, parsed tables, quarter manifest, validation results, etc.). The current test only emits console output. Structured artifact emission is needed for full RALPH compliance.

5. **Regression suite:** Only MU is tested. The spec recommends adding a stable consumer company, a bank, and a utility as additional golden fixtures.
