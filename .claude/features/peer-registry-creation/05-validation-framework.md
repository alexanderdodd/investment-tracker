# Validation framework and acceptance criteria

## Validation rules

### Group P — Peer discovery integrity

| Rule ID | Check | Severity | Notes |
|---------|-------|----------|-------|
| `PDSC-001` | Subject's SIC code is resolved from EDGAR | High | Must have a valid 4-digit SIC |
| `PDSC-002` | SIC-based candidate search returns results | Medium | If 4-digit SIC returns 0, fall back to 3-digit |
| `PDSC-003` | Market cap filter is applied deterministically | High | Same subject market cap → same filtered set |
| `PDSC-004` | Activity filter removes stale companies | Medium | No peer with filing > 9 months old |
| `PDSC-005` | Subject ticker is excluded from peer set | High | Self cannot be a peer |
| `PDSC-006` | Disallowed peers are excluded | High | Framework exclusion list enforced |
| `PDSC-007` | Curated overrides are applied when present | Medium | MU curated adds/removes respected |

### Group Q — Peer multiples integrity

| Rule ID | Check | Severity | Notes |
|---------|-------|----------|-------|
| `PMUL-001` | At least 1 peer has usable multiples | High | Otherwise skip relative valuation |
| `PMUL-002` | Data source is flagged per peer | High | pipeline/market_data/edgar_xbrl |
| `PMUL-003` | Pipeline-derived multiples preferred over API | Medium | Sourcing waterfall followed |
| `PMUL-004` | Computed EV multiples use consistent inputs | High | EV = mcap + debt - cash, not mixed sources |
| `PMUL-005` | Stale multiples (> 90 days) are flagged | Medium | Freshness check on source data |

### Group R — Quality scoring integrity

| Rule ID | Check | Severity | Notes |
|---------|-------|----------|-------|
| `PQAL-001` | Quality score is deterministic | High | Same inputs → same scores |
| `PQAL-002` | Quality factors sum to expected weights | Medium | 0.35 + 0.25 + 0.25 + 0.15 = 1.0 |
| `PQAL-003` | Registry confidence is bounded [0, 0.85] | High | Never exceeds cap |
| `PQAL-004` | Peers are ranked by quality score | Medium | Primary peers have highest scores |
| `PQAL-005` | Weak registry reduces relative valuation weight | High | Low confidence → less influence on fair value |

### Group S — Regression and consistency

| Rule ID | Check | Severity | Notes |
|---------|-------|----------|-------|
| `PREG-001` | MU still gets its curated peer override | High | Existing MU registry not broken |
| `PREG-002` | Golden fixture still passes 19/19 | High | No facts regression |
| `PREG-003` | Broken fixture still passes 10/10 | High | No negative control regression |
| `PREG-004` | Pipeline completes within time budget | Medium | Peer discovery adds ≤ 5 seconds |
| `PREG-005` | Same ticker run twice produces same peers | High | Determinism check |

## Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `AC-PEER-001` | MU produces a peer registry | At least 3 peers with multiples |
| `AC-PEER-002` | Non-MU ticker produces a peer registry | Test with KO or ALL — at least 1 peer |
| `AC-PEER-003` | SIC-based discovery works | Peers have matching or adjacent SIC codes |
| `AC-PEER-004` | Quality scores are computed | Every peer has a score between 0 and 1 |
| `AC-PEER-005` | Registry confidence is computed | Overall confidence between 0 and 0.85 |
| `AC-PEER-006` | Relative valuation uses dynamic registry | Fair value synthesis receives peer data |
| `AC-PEER-007` | Curated overrides still work for MU | MU gets WDC added, NVDA/AMD removed |
| `AC-PEER-008` | Pipeline-derived multiples preferred | If peer exists in DB, use that data |
| `AC-PEER-009` | Registry is persisted | Saved in DB and iteration artifacts |
| `AC-PEER-010` | No regression on existing tests | 19/19 + 10/10 + 11/11 still pass |

## Negative control tests

| Test | Expected outcome |
|------|-----------------|
| Ticker with no SEC filings | Empty peer set, relative valuation skipped |
| Ticker with obscure SIC code (few peers) | 1-2 peers, low confidence, relative method down-weighted |
| MU with curated overrides | Override takes priority, WDC included despite different SIC |

## Calibration checks

For MU specifically:
- Auto-discovered peers should include SK hynix-like or Samsung-like companies IF they file with the SEC (they may not — Korean companies rarely have CIKs)
- Auto-discovered peers should include WDC (if curated override adds it)
- Auto-discovered peers should NOT include NVDA, AMD (excluded by framework)
- The resulting relative valuation should be directionally similar to the current curated result

## Definition of done

The feature is done when:
1. Any US-listed ticker can get a peer registry created during the pipeline
2. The registry quality is scored and the confidence feeds into fair value synthesis
3. MU's curated override still works and produces the same or better results
4. No existing tests regress
5. The peer registry is persisted and visible in iteration artifacts
