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
  validation/
    rules.ts
    factGate.ts
    valuationGate.ts
    ruleCatalog.ts
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
  llm/
    evidencePack.ts
    narrative.ts
    redteam.ts
  reports/
    renderFactsOnly.ts
    renderFull.ts
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

### Recommended

- parse and preserve XBRL context ids
- store raw table row and column labels alongside normalized field maps

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

## 5. Evidence pack schema

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

## 6. Logging and evidence retention

All pipeline artifacts are persisted to the **Postgres database** (`stock_valuations` table) as JSONB columns. This is the authoritative artifact store — a separate file-based artifact bundle is not required.

### Mandatory (stored in DB per run)

- `canonicalFacts` — all extracted facts with provenance (source type, accession, method)
- `financialModel` — cycle state, normalization, ratios, margin trends
- `valuationOutputs` — DCF, multiples, scenarios, verdict, confidence
- `qualityReport` — QA issues + two-stage gate decision (status, failures)
- `researchDocument` — full generated report text (narrative + red-team + QA summary)
- `structuredInsights` — dashboard-ready summaries
- `sourceAccessions` — filing accession numbers for traceability

### Recommended

- provenance graph viewer (reads from DB JSONB)
- HTML diff view versus golden snapshot

## 7. Golden regression fixture design

Create a frozen Micron fixture with:

- latest 10-Q accession
- latest 10-K accession
- quarter data inputs
- annual history inputs
- frozen market price snapshot
- expected canonical facts
- expected gate state

Use the frozen price snapshot for CI so the baseline stays stable. Use live price only in a separate live-smoke job.

## 8. Mandatory vs recommended vs future

### Mandatory for next implementation pass

- statement-table-first TTM builder
- hard period identity checks
- critical-field gate collapse
- two-stage publish gate
- Micron golden regression fixture
- 5-year history loader for cyclical names
- deterministic rule engine with DB-persisted artifacts

### Recommended next

- more benchmark companies
- peer-set registry by industry
- valuation-prerequisite explainability panel

### Future

- analyst override workflow with full audit trail
- sector-specific normalization templates
- automated benchmark expansion
