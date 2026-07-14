# 04. Data model and pipeline

## Canonical taxonomy

Use GICS as the canonical market hierarchy:

```text
Sector -> Industry Group -> Industry -> Sub-Industry
```

### Rules
- Sector is the primary navigation level.
- Industry is the primary comparison level.
- Sub-industry is used when peer precision matters.

## Core entities

### SectorSnapshot
```json
{
  "sectorId": "information-technology",
  "asOf": "2026-04-13T20:00:00Z",
  "etfProxy": "XLK",
  "valuationStatus": "EXPENSIVE",
  "trendShortTerm": "POSITIVE",
  "trendLongTerm": "POSITIVE",
  "industryCount": 8
}
```

### IndustrySnapshot
```json
{
  "industryId": "semiconductors",
  "sectorId": "information-technology",
  "asOf": "2026-04-13T20:00:00Z",
  "relativeSize": 0.28,
  "memberCount": 52,
  "valuationVsHistory": -0.2,
  "valuationVsIndustryMedian": null,
  "revisionsTrend": "IMPROVING",
  "qualityScore": 0.72,
  "cycleState": "ABOVE_MID",
  "candidateCounts": {
    "screenPass": 7,
    "publishedValueCandidate": 2,
    "watchlistOnly": 6,
    "trapRisk": 3
  }
}
```

### IndustryScreenResult
```json
{
  "ticker": "ADBE",
  "industryId": "application-software",
  "snapshotAt": "2026-04-13T20:00:00Z",
  "screenState": "SCREEN_PASS",
  "cheapnessSignals": {
    "forwardPeVsIndustryMedian": -0.18,
    "evEbitdaVsOwnHistoryPercentile": 0.22,
    "fcfYieldVsIndustryMedian": 0.03
  },
  "qualitySignals": {
    "leverageOk": true,
    "marginStabilityOk": true,
    "dilutionOk": true,
    "cashConversionOk": true
  },
  "trapFlags": [],
  "hasValuationArtifact": true,
  "hasPeerAnalysisArtifact": true,
  "candidatePublishable": false
}
```

### PublishedValueCandidate
```json
{
  "ticker": "ADBE",
  "industryId": "application-software",
  "status": "PUBLISHED_VALUE_CANDIDATE",
  "currentPrice": 0,
  "fairValueRange": { "low": 0, "mid": 0, "high": 0 },
  "valuationLabel": "CHEAP",
  "valuationConfidence": 0.76,
  "peerPackStatus": "VALIDATED",
  "candidateReasons": [],
  "thesisRisks": []
}
```

## Data source plan

### Deterministic sources
- GICS mappings / classifications
- market data API
- SEC EDGAR filings
- filing-derived fundamentals
- existing stock valuation artifacts
- peer registry / peer evaluation outputs

### LLM-permitted sources
- explanation synthesis
- industry narrative
- risk summarization
- filing excerpt classification
- deep-work candidate memo generation

### Forbidden for core screen math
- ad hoc web search
- blog or forum content
- LLM-imputed financial metrics
- unsupported fair value estimates

## Pipeline stages

### Stage 0 — taxonomy and constituent resolution
Inputs:
- sector / industry selection
- GICS mapping
- current constituent universe

Outputs:
- stock universe for the chosen industry

### Stage A — universe reduction
Deterministic filters:
- minimum liquidity
- minimum market cap
- recent filing freshness
- exclude shells / OTC / bankrupt names
- exclude extreme distress by default

### Stage B — sector and industry triage
Deterministic features:
- sector valuation vs history
- industry valuation vs history
- revisions trend
- quality medians
- concentration / cyclicality tags

### Stage C — cheapness screens
Deterministic, industry-relative metrics.

### Stage D — quality filter
Deterministic risk and quality checks.

### Stage E — deep work
This is where LLM help is allowed, but only for:
- reading filings
- summarizing thesis
- explaining why a screen pass may or may not be a real value setup
- producing a candidate memo

## Candidate publication rule

A stock may be shown in the industry page as a **published value candidate** only if:
1. it passes deterministic cheapness and quality screens,
2. it has a valid stock valuation artifact,
3. it has a valid peer analysis artifact,
4. its stock-level valuation confidence is above threshold,
5. no trap-risk blocker is active.
