# Implementation guidance for workflow + LLM usage

## 1. Recommended module boundaries

```text
src/
  sec/
    filingDiscovery.ts
    filingDownload.ts
    ixbrlStatementParser.ts
    statementTableNormalizer.ts
    companyfactsReconciler.ts
    annualHistoryLoader.ts
  market/
    priceSnapshot.ts
  core/
    provenance.ts
    periodResolver.ts
    canonicalFacts.ts
    quarterManifest.ts
    allowedSurfaceRegistry.ts
    dependencyGraph.ts
  validation/
    rules.ts
    factGate.ts
    valuationGate.ts
    surfaceGate.ts
    ruleCatalog.ts
    formulaTraces.ts
    suppressionAudit.ts
    negativeControls.ts
  valuation/
    cycleClassifier.ts
    normalization.ts
    dcf.ts
    multiples.ts
    reverseDcf.ts
  loop/
    ralph.ts
    diagnosis.ts
    patchPlanner.ts
    regressionHarness.ts
    iterationArtifactWriter.ts
  llm/
    evidencePack.ts
    narrative.ts
    redteam.ts
  reports/
    renderFactsOnly.ts
    renderFull.ts
    renderPolicy.ts
    reportFieldRegistry.ts
```

## 2. Source precedence

### Mandatory precedence

1. latest filing statement tables or iXBRL instance
2. filing cover page, notes, balance sheet, cash-flow statement
3. official company earnings-release comparative tables
4. companyfacts reconciliation layer
5. market data feed for price only
6. news, blogs, transcripts, or context sources only for narrative; never for core facts

## 3. Statement-table-first implementation guidance

### Mandatory

- parse the latest 10-Q discrete quarter from statement tables
- do not infer latest quarter from aggregate companyfacts durations
- store the exact filing accession and period-end used for every field
- for annual-derived Q4 values, preserve the derivation chain
- build and persist a `quarterManifest` object for every run

### Recommended

- parse and preserve XBRL context ids
- store raw table row and column labels alongside normalized field maps
- preserve quarter lineage hashes so stale-quarter bugs can be diffed quickly

### Future

- add OCR fallback only if no structured filing is available

## 4. LLM usage rules

### Allowed LLM tasks

- evidence extraction from filing text into structured evidence objects
- narrative synthesis from locked deterministic facts
- red-team critique of assumptions
- root-cause explanation from structured failure graphs

### Forbidden LLM tasks

- computing or repairing financial facts
- selecting periods
- choosing quarter identities
- computing market cap, EV, P/E, or FCF
- replacing missing data with estimates
- overriding validator failures
- publishing a verdict when gates fail
- mentioning a number not present in the surface allowlist

## 5. Surface allowlist contract

Before rendering any report, the system must construct an `AllowedSurfaceRegistry` like:

```json
{
  "gateStatus": "PUBLISH_FACTS_ONLY",
  "allowed": [
    "latest_quarter.revenue",
    "ttm.revenue",
    "derived.market_cap",
    "derived.trailing_pe",
    "evidence.customer_concentration"
  ],
  "denied": [
    "valuation.fair_value",
    "valuation.margin_of_safety",
    "model.normalized_fcf",
    "model.cycle_confidence"
  ],
  "dependencyFailures": {
    "HIST-004": [
      "annual_history.five_year_avg_gross_margin",
      "annual_history.five_year_avg_operating_margin",
      "narrative.historical_margin_comparison"
    ]
  }
}
```

The narrative LLM may only reference values in `allowed`.

## 6. Formula trace contract

Every surfaced non-primitive metric must have a trace like:

```json
{
  "field": "derived.enterprise_value",
  "formula": "market_cap + total_debt - total_cash_and_investments",
  "inputs": [
    {"field": "derived.market_cap", "value": 474314, "validated": true},
    {"field": "balance_sheet.total_debt", "value": 10142, "validated": true},
    {"field": "balance_sheet.total_cash_and_investments", "value": 16627, "validated": true}
  ],
  "period_scope": "point_in_time + latest_balance_sheet",
  "share_basis": null
}
```

Do not surface:
- normalized FCF
- ROE
- ROIC
- interest coverage
- cycle confidence

unless their formula traces exist and their dependencies all passed.

## 7. Evidence pack schema

```json
{
  "evidence_id": "E-000123",
  "ticker": "MU",
  "category": "customer_concentration",
  "source_type": "10-K",
  "accession": "0000723125-25-000028",
  "period_end": "2025-08-28",
  "section": "Certain Concentrations / Risk Factors",
  "excerpt": "In 2025, over half of our total revenue came from our top ten customers...",
  "freshness_date": "2025-10-03",
  "confidence": "high"
}
```

## 8. Logging and evidence retention

### Dual persistence model

All pipeline artifacts must be persisted in two places:

1. **Postgres database** — authoritative runtime artifact store
2. **file-based iteration bundle** — required for human review and Ralph loop audit

### Mandatory DB persistence (per run)

- `canonicalFacts`
- `financialModel`
- `valuationOutputs`
- `qualityReport`
- `researchDocument`
- `structuredInsights`
- `sourceAccessions`
- `runManifest`
- `quarterManifest`
- `formulaTraces`
- `suppressionAudit`
- `artifactInventory`
- `negativeControlResults`

### Mandatory file-based persistence (per iteration)

Write to `ralph-loop-reports/iteration-{N}/`:

- `generated-report.md`
- `iteration-changes.md`
- `evaluation-scorecard.md`
- `run-manifest.json`
- `quarter-manifest.json`
- `formula-traces.json`
- `suppression-audit.json`
- `artifact-inventory.json`
- `negative-control-results.json`

### Recommended

- provenance graph viewer (reads from DB JSONB)
- HTML diff view versus golden snapshot
- report-surface diff versus previous iteration

## 9. Golden regression fixture design

Create a frozen Micron fixture with:

- latest 10-Q accession
- latest 10-K accession
- quarter data inputs
- annual history inputs (FY2021–FY2025)
- frozen market price snapshot
- expected canonical facts
- expected gate state
- expected annual-history averages
- expected render allowlist for facts-only state

Create a second fixture:

- **Micron broken negative control**
- intentionally corrupt latest quarter identity or share-count basis
- expected gate state: `WITHHOLD_ALL`
- expected output: diagnostic only

Use the frozen price snapshot for CI so the baseline stays stable. Use live price only in a separate live-smoke job.

## 10. Mandatory vs recommended vs future

### Mandatory for next implementation pass

- statement-table-first TTM builder
- hard period identity checks
- critical-field gate collapse
- two-stage publish gate
- surface allowlist and suppression audit
- formula traces for surfaced non-primitive fields
- Micron golden regression fixture
- Micron broken negative-control fixture
- 5-year history loader for cyclical names
- deterministic rule engine with DB-persisted artifacts
- file-based iteration report bundle

### Recommended next

- more benchmark companies
- peer-set registry by industry
- valuation-prerequisite explainability panel
- explicit render lint for period labels (quarter vs annual vs TTM)

### Future

- analyst override workflow with full audit trail
- sector-specific normalization templates
- automated benchmark expansion
- semantic diffing of narrative claims against allowlist
