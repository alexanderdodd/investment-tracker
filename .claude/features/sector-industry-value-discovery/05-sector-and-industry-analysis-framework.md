# Sector and industry analysis framework

## Why industry matters more than sector for value discovery

Sector answers:
- where to look

Industry answers:
- who to compare
- what normal margins and multiples look like
- whether cheapness is real or misleading

The app should therefore use:
- **sector** for top-down screening
- **industry** for actual comparison
- **stock valuation** for final judgment

## Sector analysis requirements

Sector analysis should continue to include:
- relative performance
- valuation state
- macro drivers
- concentration
- confidence

Add:
- industry count
- top industries by size
- top industries by attractiveness
- sector breadth signal:
  - many industries attractive
  - few industries attractive
  - attractiveness concentrated in one pocket

## Industry analysis requirements

Each industry page should answer:

1. What is this industry?
2. How big is it inside the sector?
3. How has it performed?
4. How expensive is it?
5. What are normal economics here?
6. Is this a good hunting ground for value?
7. Which names deserve deeper work?

## Industry scorecard dimensions

### 1. Valuation
- current median multiple vs industry history
- current median multiple vs sector median
- spread between highest-quality and lowest-quality names
- percent of names screening cheap

### 2. Quality
- median operating margin
- median ROIC / ROE where relevant
- balance-sheet health
- FCF conversion
- earnings quality

### 3. Revision / momentum context
- earnings revisions trend
- price momentum vs fundamentals
- breadth of participation
- whether cheapness is broad or concentrated

### 4. Cyclicality
- classify the industry as:
  - defensive
  - mixed
  - cyclical
  - hyper-cyclical
- apply different tolerances for value labeling depending on cyclicality

### 5. Concentration
- top 3 market-cap or benchmark-weight names
- share of industry economics driven by leaders
- whether the industry view is actually just one or two stocks

### 6. Candidate quality
- how many stocks are:
  - validated value candidates
  - possible value
  - trap risk
- median peer-quality score across the candidate set

## Industry attractiveness state

Each industry gets a deterministic label:

- `ATTRACTIVE_HUNTING_GROUND`
- `MIXED`
- `OVERHEATED`
- `LOW_VISIBILITY`
- `WITHHELD`

### Example logic
```ts
if (valuationCheap && qualityOkay && revisionTrendNotCollapsing && candidateCoverageGood) {
  return "ATTRACTIVE_HUNTING_GROUND"
}
if (valuationExpensive && momentumHot && concentrationHigh) {
  return "OVERHEATED"
}
if (coverageWeak || peerQualityWeak) {
  return "LOW_VISIBILITY"
}
return "MIXED"
```

## Example benchmark industries

### Technology
- Semiconductors
- Software
- IT Services
- Communications Equipment
- Hardware / Storage / Peripherals

### Consumer Staples
- Beverages
- Packaged Foods
- Household Products
- Personal Care

### Financials
- Property & Casualty Insurance
- Regional Banks
- Asset Managers
- Capital Markets

### Industrials
- Machinery
- Aerospace & Defense
- Electrical Equipment
- Building Products

The app does not need full market coverage on day 1.
It does need:
- a deterministic industry table
- framework-specific scoring
- validated candidate logic

## Sector-to-industry workflow

1. Rank sectors by valuation state and macro context
2. Within each sector, rank industries by attractiveness
3. Only within attractive or mixed industries, generate stock candidates
4. Require candidate stocks to pass stock-level validation before surfacing as “validated”
