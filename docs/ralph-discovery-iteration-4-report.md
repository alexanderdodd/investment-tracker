# RALPH Loop — Sector-Industry Discovery — Iteration 4

**Date:** April 21, 2026
**Task:** Close publish-gate safety gap, expand artifact coverage
**Starting state:** 3 validated (ALL, COF, PNC) — COF/PNC had WITHHOLD_ALL artifacts
**Final state:** 1 validated (ALL), 5 possible, 19 trap risks — gate integrity restored
**Validation:** 30/30 rules pass

---

## 1. Safety Fix: Publish-Gate Check

### Problem

The candidate pipeline checked `hasArtifact` (artifact exists) but not `artifactPublished` (artifact passed quality gate). This allowed stocks with `WITHHOLD_ALL` artifacts — where the facts gate failed due to missing data — to be promoted to `validated_value`.

COF and PNC had WITHHOLD_ALL gates:
- **COF**: BS-001 (cash is null) — can't compute enterprise value reliably
- **PNC**: TTM-001/004/008 (TTM revenue/income/FCF null) — banking XBRL structure gaps

### Fix

**File:** `src/lib/generate-value-candidates.ts`

Added `artifactPublished` parameter to `classifyCandidate()`:
- `validated_value` now requires `artifactPublished === true` (status = "published")
- `possible_value` still allows withheld artifacts — preserves the signal while acknowledging data quality limits
- Tracked via `stock_valuation.status` field

### Impact

| Ticker | Before (iter 3) | After (iter 4) | Reason |
|--------|-----------------|-----------------|--------|
| ALL | validated_value | validated_value | Published artifact, strong peers |
| COF | validated_value | **possible_value** | WITHHOLD_ALL → can't validate |
| PNC | validated_value | **possible_value** | WITHHOLD_ALL → can't validate |

---

## 2. New Valuation Artifacts

| Ticker | Industry | Verdict | Confidence | Peers | Fair Value | Gate | Status |
|--------|----------|---------|-----------|-------|-----------|------|--------|
| DAL | Passenger Airlines | Undervalued | High | 0 | $74 – $87 – $100 | PUBLISH_FACTS_PLUS_VALUE | published |
| META | Interactive Media | Fair Value | High | 7 | NaN (error) | PUBLISH_FACTS_PLUS_VALUE | withheld* |

*META's fair value computation returned NaN/Infinity — narrative rendering failed, artifact stored as withheld.

---

## 3. Final Candidate Summary

### Validated Value (1)

| Ticker | Score | Industry | Why Validated |
|--------|-------|----------|--------------|
| ALL | 63 | Insurance | Published artifact + DEEP_CHEAP + 8 strong peers + LOW trap risk |

### Possible Value (5)

| Ticker | Score | Industry | Why Not Validated |
|--------|-------|----------|------------------|
| COF | 53 | Consumer Finance | Artifact withheld (WITHHOLD_ALL) |
| PNC | 53 | Regional Banks | Artifact withheld (WITHHOLD_ALL) |
| META | 53 | Interactive Media | Artifact withheld + Fair Value (not cheap) |
| DAL | 48 | Passenger Airlines | 0 peers (unknown quality) |
| AMZN | 40 | Broadline Retail | No artifact peers |

### Value Trap Risks (19)

| Sector | Tickers | Common Signal |
|--------|---------|---------------|
| Technology | INTC, ORCL | Weak fundamentals |
| Materials | APD, MLM, SLVM, WCC | Negative FCF + no artifact |
| Industrials | LUV, GATX | Hyper-cyclical + weak metrics |
| Consumer Disc. | DHI, WHR, HRB, SBUX | Mixed signals |
| Comm. Services | LYV | Negative FCF |
| Utilities | VST, AES | Mixed-cyclicality IPPs |
| Real Estate | BXP, WELL, CBRE, ZIM | Structural sector stress |

---

## 4. Validation Results

```
30 passed, 0 failed out of 30
```

Gate integrity verified:
- CAND-001: 1 validated, 0 missing artifact ✓
- 5 possible candidates all correctly distinct from validated ✓
- NEG-004: INTC at value_trap_risk ✓
- PEER-IND-005: 0 validated with weak/unknown peers ✓

---

## 5. Pipeline Integrity Summary (across all 4 iterations)

### Bugs Fixed

| # | Bug | File | Severity |
|---|-----|------|----------|
| 1 | Peer quality thresholds on wrong scale (0-10 vs 0-1) | generate-value-candidates.ts | Critical — blocked ALL promotions |
| 2 | FCF penalty not cyclicality-aware | generate-value-candidates.ts | Medium — false-flagged utilities |
| 3 | Publish gate not checked for validated status | generate-value-candidates.ts | High — unsafe promotions possible |
| 4 | PEER-IND-003 validation bound wrong (0-10 vs 0-1) | validate-industry-feature.ts | Low — cosmetic |
| 5 | PEER-IND-005 benchmark stale (ALL had no peers, now has 8) | validate-industry-feature.ts | Low — test update |

### Coverage Evolution

| Metric | Iter 1 | Iter 2 | Iter 3 | Iter 4 |
|--------|--------|--------|--------|--------|
| Stocks | 67→194 | 194 | 194 | 194 |
| Industries covered | 26→76 | 76 | 76 | 76 |
| Analytics rows | 40 | 116 | 116 | 116 |
| Validated | 0 | 0 | 3 | **1** |
| Possible | 2 | 3 | 0 | **5** |
| Trap risks | ~5 | 25 | 17 | **19** |
| Artifacts generated | 0 | 0 | 3 | **5** |
| Validation | 30/30 | 30/30 | 30/30 | **30/30** |

---

## 6. Known Gaps for Next Iteration

1. **COF/PNC need data fixes, not pipeline changes** — Banking XBRL data lacks certain standard fields (cash, TTM aggregates). If EDGAR filings provide these in future quarters, re-running value-stock would produce published artifacts → validated_value.

2. **DAL has 0 peers** — The dynamic peer discovery didn't find comparables. Running with explicit peer hints or expanding the airline industry stock set could help.

3. **META NaN fair value** — The valuation computation broke on META. This is likely a data issue (market cap, shares outstanding) rather than a pipeline bug. Needs investigation.

4. **8 ATTRACTIVE industries still have no artifacts** — Containers & Packaging, Automobile Components, Household Durables, Technology Hardware, Media, Regional Banks (USB/TFC), Consumer Finance (AXP/DFS).

5. **60 industries remain LOW_VISIBILITY** — Fundamental constraint: need 5+ stocks with metrics per industry for meaningful confidence.
