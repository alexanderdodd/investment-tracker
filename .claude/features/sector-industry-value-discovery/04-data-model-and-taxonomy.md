# Data model and taxonomy

## Core taxonomy entities

### GicsSector
```ts
type GicsSector = {
  id: string
  code: string
  name: string
  etfTicker?: string
  description?: string
}
```

### GicsIndustryGroup
```ts
type GicsIndustryGroup = {
  id: string
  code: string
  name: string
  sectorId: string
}
```

### GicsIndustry
```ts
type GicsIndustry = {
  id: string
  code: string
  name: string
  sectorId: string
  industryGroupId: string
  description?: string
  valueFrameworkId: string
  cyclicalityClass: "defensive" | "mixed" | "cyclical" | "hyper_cyclical"
}
```

### GicsSubIndustry
```ts
type GicsSubIndustry = {
  id: string
  code: string
  name: string
  industryId: string
}
```

### StockClassification
```ts
type StockClassification = {
  ticker: string
  companyName: string
  sectorId: string
  industryGroupId: string
  industryId: string
  subIndustryId?: string
  source: "gics_feed" | "curated_override"
  asOf: string
}
```

## Sector / industry analytics entities

### SectorAnalytics
```ts
type SectorAnalytics = {
  sectorId: string
  asOf: string
  performance: {
    d1: number
    m1: number
    y1: number
    y5: number
  }
  valuationState: "cheap" | "fair" | "expensive" | "withheld"
  concentrationTop3: number
  topIndustries: IndustryMiniSummary[]
  candidateCount: number
}
```

### IndustryAnalytics
```ts
type IndustryAnalytics = {
  industryId: string
  sectorId: string
  asOf: string
  universeSize: number
  aggregateWeightInSector?: number
  performanceVsSector: number
  performanceVsMarket: number
  medianMultiples: {
    forwardPe?: number | null
    evEbitda?: number | null
    evRevenue?: number | null
    priceToBook?: number | null
    fcfYield?: number | null
  }
  valuationVsHistory: {
    status: "cheap" | "fair" | "expensive" | "withheld"
    percentile: number | null
  }
  qualityMetrics: {
    medianOperatingMargin?: number | null
    medianRoe?: number | null
    medianRoic?: number | null
    debtHealthScore?: number | null
  }
  revisionTrend: "improving" | "flat" | "deteriorating" | "unknown"
  cyclicality: "defensive" | "mixed" | "cyclical" | "hyper_cyclical"
  candidateCounts: {
    validated: number
    possible: number
    trapRisk: number
  }
  confidence: number
}
```

### ValueCandidate
```ts
type ValueCandidate = {
  ticker: string
  companyName: string
  sectorId: string
  industryId: string
  subIndustryId?: string
  asOf: string
  candidateClass: "validated_value" | "possible_value" | "value_trap_risk" | "not_attractive"
  valuationLabel: "cheap" | "fair" | "expensive" | "withheld"
  valuationConfidence: number | null
  peerQuality: "strong" | "medium" | "weak" | "unknown"
  score: number
  reasonsFor: string[]
  reasonsAgainst: string[]
  requiresManualReview: boolean
}
```

## Source hierarchy

### Mandatory
1. GICS classification feed / licensed dataset or a consistent in-house mapping source
2. Validated stock valuation artifacts
3. Peer registry / peer evaluation artifacts
4. Market data and canonical facts
5. LLM explanations

### Forbidden
- using sector ETF holdings alone as the canonical industry mapping for all stocks
- inferring industry from company name
- allowing LLM-generated industry labels without deterministic classification

## Practical rollout guidance

### Phase 1
Use a curated or licensed GICS mapping for:
- sector
- industry group
- industry
- sub-industry

### Phase 2
Aggregate industries using your stock universe, not just ETF holdings.

### Phase 3
Allow ETF holdings to be used for “representative sector composition” only, not for taxonomy truth.

## Industry value frameworks

Every industry must map to a valuation framework.

Examples:
- `cyclical_semiconductor_memory_v1`
- `software_platforms_v1`
- `interactive_media_v1`
- `property_casualty_insurance_v1`
- `consumer_beverages_v1`
- `industrial_machinery_v1`

This is how the candidate engine decides:
- which multiples matter
- how to select peers
- which risks matter
- how much cyclicality penalty to apply
