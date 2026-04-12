# Acceptance criteria / definition of done

## 1. Mandatory acceptance tests

| ID | Requirement | Pass condition |
|---|---|---|
| `MU-SRC-001` | latest filing discovery | latest 10-Q and 10-K match Micron's current filings |
| `MU-QTR-001` | latest quarter identity | latest quarter equals Q2 FY2026 values from filing |
| `MU-TTM-001` | TTM revenue | 58.119B ± tolerance |
| `MU-TTM-002` | TTM gross profit | 33.963B ± tolerance |
| `MU-TTM-003` | TTM operating cash flow | 30.653B ± tolerance |
| `MU-TTM-004` | TTM GAAP free cash flow | 10.281B ± tolerance |
| `MU-BS-001` | latest balance sheet | cash/investments 16.627B; debt 10.142B; equity 72.459B |
| `MU-SH-001` | share-count basis | point-in-time shares = 1,127,734,051 exactly; diluted EPS basis separate |
| `MU-MKT-001` | market cap math | about 474.314B at frozen price 420.59 |
| `MU-MULT-001` | trailing P/E math | about 19.86x |
| `MU-HIST-001` | 5Y gross margin average | exactly 27.18% from FY2021–FY2025 annual history only |
| `MU-HIST-002` | 5Y operating margin average | exactly 9.70% from FY2021–FY2025 annual history only |
| `MU-GATE-001` | facts gate | pass |
| `MU-GATE-002` | valuation gate | withhold for golden baseline |
| `MU-GATE-003` | no verdict leak | no fair value, target price, margin of safety, scenario values, or valuation confidence in golden output |
| `MU-SURFACE-001` | facts-only render allowlist | facts-only report contains only allowlisted fields |
| `MU-SURFACE-002` | no untraced derived metrics | every surfaced non-primitive number has a formula trace |
| `MU-SURFACE-003` | failed-history dependency suppression | if `HIST-004` fails, historical-average metrics and related sentences are absent |
| `MU-SURFACE-004` | no annual/quarter label confusion | numeric claims in the report are period-labeled consistently |
| `MU-TRACE-001` | formula traces for core derived metrics | market cap, EV, P/E, P/B, EV/Revenue, EV/EBIT, EV/FCF all have traces |
| `MU-TRACE-002` | guarded metrics traced or suppressed | interest coverage, ROE, ROIC, normalized FCF, cycle confidence are either traced and validated or absent |
| `BROKEN-FIX-001` | critical failure behavior | intentionally broken fixture returns `WITHHOLD_ALL` |
| `BROKEN-FIX-002` | negative-control leak prevention | broken fixture emits diagnostic-only report with no facts-only or valuation leak |
| `RLOOP-001` | DB artifact persistence | every pipeline run persists canonical facts, financial model, valuation outputs, QA report, research document, structured insights, run manifest, quarter manifest, formula traces, suppression audit, artifact inventory, and negative control results to Postgres |
| `RLOOP-002` | iteration report written | every iteration writes all required files to `ralph-loop-reports/iteration-{N}/` |
| `RLOOP-003` | run manifest present | `run-manifest.json` exists and matches DB entry |
| `RLOOP-004` | quarter manifest present | `quarter-manifest.json` exists and matches DB entry |
| `RLOOP-005` | formula traces present | `formula-traces.json` exists and matches DB entry |
| `RLOOP-006` | suppression audit present | `suppression-audit.json` exists and matches DB entry |
| `RLOOP-007` | artifact inventory present | `artifact-inventory.json` exists and lists all iteration artifacts |
| `RLOOP-008` | negative control results present | `negative-control-results.json` exists and shows expected broken-fixture outcome |
| `NARR-001` | narrative prompt filtered by suppression audit | denied fields are not present in the LLM prompt data |
| `NARR-002` | denied-field instruction in narrative prompt | when valuation is withheld, the LLM prompt explicitly lists denied fields by name |
| `NARR-003` | no denied-field value in rendered report | post-render suppression assertion (SURFACE-007) passes |
| `NARR-004` | suppression assertion failure handling | if denied fields leak, pipeline downgrades to WITHHOLD_ALL or re-generates narrative |
| `RULE-001` | rule-ID semantic stability | no rule is simultaneously PASS in the scorecard and cited as a gate failure reason |
| `RULE-002` | GATE_TRIGGER status for detection rules | VAL-005-type rules use GATE_TRIGGER when they detect a condition that triggers a gate action |
| `TRACE-006` | no null inputs in formula traces | every input that contributes to a trace result is non-null and sourced |
| `TRACE-007` | trace inventory covers all surfaced derived metrics | if a derived metric (including EV/EBITDA) appears in the report, it has a formula trace |
| `ART-CONSISTENCY-001` | claim counts consistent across artifacts | surface-scan counts are identical in inventory, scorecard, and changelog |
| `ART-CONSISTENCY-002` | rule statuses consistent across artifacts | no contradiction between scorecard statuses and gate-reason citations |
| `PEER-001` | curated semiconductor seed list | at least 3 semiconductor-adjacent peers defined in registry |
| `PEER-002` | deterministic peer selection | same inputs produce same peer set (verified by input hash) |
| `PEER-003` | size and activity filters | peers outside 0.1x–10x market cap range excluded |
| `PEER-004` | disallowed peers excluded | no ticker from `disallowedPeers` in final peer set |
| `PEER-005` | peer multiples fetched | at least 3 peers have P/E or EV/EBITDA values |
| `PEER-006` | peer comparison computed | median and mean multiples computed and persisted |
| `PEER-007` | VAL-004 passes for MU | MU peer set has ≥3 validated peers with multiples |
| `PEER-008` | peer fields in surface allowlist | peer-derived metrics appear only when VAL-004 passes |
| `PEER-009` | peer formula traces | peer median multiples have formula traces with peer inputs |
| `PEER-010` | peer artifacts persisted | `peer-comparison.json` in iteration bundle + peer data in DB |
| `PEER-011` | insufficient peers → withhold | empty or filtered-out peer list causes VAL-004 fail and gate withhold |
| `PEER-012` | no regression from peers | adding peer support does not break any existing acceptance criteria |
| `REG-001` | no regression | accepted patch must not worsen any prior passing benchmark |
| `REG-002` | no surface regression | accepted patch must not introduce new report-surface leaks |

## 2. Tolerances

### Mandatory default tolerances

- dollar statement values: `max(USD 1 million, 0.1%)`
- per-share values: `USD 0.01`
- percentages: `0.1 percentage point`
- annual-history averages in frozen tests: `0.01 percentage point`
- market-data-driven ratios in frozen tests: exact to stored snapshot rounding
- **point-in-time share counts in frozen tests: exact integer match**

## 3. Done means

The workflow is "done" for this phase only when:

1. Micron passes the golden regression suite.
2. The workflow uses statement tables or iXBRL first.
3. Any quarter-selection error is caught before narrative.
4. Any TTM mismatch blocks the verdict.
5. Any insufficient-history cyclical DCF is withheld.
6. Any failed-history dependency is suppressed from the facts-only report.
7. The gate behavior matches policy:
   - broken facts -> `WITHHOLD_ALL`
   - good facts / insufficient valuation prerequisites -> `PUBLISH_FACTS_ONLY`
8. The LLM cannot change numbers or override the gate.
9. Every surfaced non-primitive number has a formula trace.
10. The system emits enough artifacts that a human can identify the exact failing field, source, derivation chain, suppression decision, and iteration diff in one pass.
11. The broken negative-control fixture passes.

## 4. Exit criteria for the current release

### Mandatory

- deterministic facts are stable for Micron
- annual-history averages are correct for Micron
- publish gate is wired to critical validation failures
- valuation verdict is withheld when prerequisites fail
- facts-only report excludes forbidden or unvalidated fields
- CI includes Micron frozen fixture
- CI includes broken negative-control fixture
- artifact bundle is preserved for every run in DB and file form

### Recommended

- add at least one non-cyclical benchmark before broad rollout
- add a benchmark with intentionally malformed period ordering
- add a benchmark with stale market-data fixture to verify gate behavior
- add a benchmark with a missing formula-trace case to verify suppression

### Future

- sector-specific acceptance packs
- valuation backtesting
- analyst-override audit workflow
