# Acceptance criteria / definition of done

## 1. Mandatory acceptance tests

| ID | Requirement | Pass condition |
|---|---|---|
| `MU-SRC-001` | latest filing discovery | latest 10-Q and 10-K match Micron's current filings |
| `MU-QTR-001` | latest quarter identity | latest quarter equals Q2 FY2026 values from filing |
| `MU-TTM-001` | TTM revenue | 58.119B ± tolerance |
| `MU-TTM-002` | TTM operating cash flow | 30.653B ± tolerance |
| `MU-TTM-003` | TTM GAAP free cash flow | 10.281B ± tolerance |
| `MU-BS-001` | latest balance sheet | cash/investments 16.627B; debt 10.142B; equity 72.459B |
| `MU-SH-001` | share-count basis | point-in-time shares = 1,127,734,051; diluted EPS basis separate |
| `MU-MKT-001` | market cap math | about 474.314B at frozen price 420.59 |
| `MU-MULT-001` | trailing P/E math | about 19.86x |
| `MU-GATE-001` | facts gate | pass |
| `MU-GATE-002` | valuation gate | withhold for golden baseline |
| `MU-GATE-003` | no verdict leak | no fair value, target price, margin of safety, or valuation confidence in golden output |
| `BROKEN-FIX-001` | critical failure behavior | intentionally broken fixture returns `WITHHOLD_ALL` |
| `RLOOP-001` | artifact persistence | every pipeline run persists canonical facts, financial model, valuation outputs, QA report (with gate decision), research document, and structured insights to the Postgres database |
| `RLOOP-002` | iteration report written | every iteration writes generated-report.md, iteration-changes.md, and evaluation-scorecard.md to ralph-loop-reports/iteration-{N}/ |
| `REG-001` | no regression | accepted patch must not worsen any prior passing benchmark |

## 2. Tolerances

### Mandatory default tolerances

- dollar statement values: `max(USD 1 million, 0.1%)`
- per-share values: `USD 0.01`
- percentages: `0.1 percentage point`
- market-data-driven ratios in frozen tests: exact to stored snapshot rounding
- share counts: exact integer for frozen baseline

## 3. Done means

The workflow is "done" for this phase only when:

1. Micron passes the golden regression suite.
2. The workflow uses statement tables or iXBRL first.
3. Any quarter-selection error is caught before narrative.
4. Any TTM mismatch blocks the verdict.
5. Any insufficient-history cyclical DCF is withheld.
6. Gate behavior matches policy:
   - broken facts -> `WITHHOLD_ALL`
   - good facts / insufficient valuation prerequisites -> `PUBLISH_FACTS_ONLY`
7. The LLM cannot change numbers or override the gate.
8. The system emits enough artifacts that a human can identify the exact failing field, source, and derivation chain in one iteration.

## 4. Exit criteria for the current release

### Mandatory

- deterministic facts are stable for Micron
- publish gate is wired to critical validation failures
- valuation verdict is withheld when prerequisites fail
- CI includes Micron frozen fixture
- artifact bundle is preserved for every run

### Recommended

- add at least one non-cyclical benchmark before broad rollout
- add a benchmark with intentionally malformed period ordering
- add a benchmark with stale market-data fixture to verify gate behavior

### Future

- sector-specific acceptance packs
- valuation backtesting
- analyst-override audit workflow
