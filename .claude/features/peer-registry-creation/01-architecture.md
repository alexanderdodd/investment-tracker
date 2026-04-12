# Architecture

## Current state

```
getPeerRegistry("MU")  → hardcoded MU registry with 3 curated peers
getPeerRegistry("ALL") → null (no registry exists)
getPeerRegistry("KO")  → null
```

## Target state

```
buildPeerRegistry("MU")  → discovers peers via SIC + market data, produces registry
buildPeerRegistry("ALL") → discovers insurance peers via SIC, produces registry
buildPeerRegistry("KO")  → discovers beverage peers via SIC, produces registry
```

## Pipeline integration

The peer registry creation runs as a new stage in the valuation pipeline, between canonical facts and financial analysis:

```
Stage 0: buildCanonicalFacts(ticker)
         ↓ extracts SIC code, sector, market cap, revenue
Stage 0b: buildPeerRegistry(ticker, facts)     ← NEW
         ↓ produces PeerRegistry with ranked peers + multiples
Stage 1: computeFinancialAnalysis(facts)
Stage 2: runValuationEngine(facts, model)
Stage 2b: synthesizeFairValue(..., relativeValuation)
         ↓ relativeValuation now uses the dynamic registry
```

## Data flow

```
                    ┌─────────────────────┐
                    │  SEC EDGAR          │
                    │  company_tickers.json│
                    │  (14,000+ tickers)  │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  SIC Code Lookup    │
                    │  Subject's SIC from │
                    │  EDGAR submissions  │
                    └─────────┬───────────┘
                              │
              ┌───────────────▼───────────────┐
              │  SIC Peer Discovery           │
              │  Find all companies with      │
              │  same 4-digit SIC code        │
              │  from company_tickers.json    │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  Algorithmic Filtering        │
              │  - Market cap range (0.1x-10x)│
              │  - Must have recent 10-K/10-Q │
              │  - Exclude subject ticker     │
              │  - Exclude disallowed peers   │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  Peer Multiples Sourcing      │
              │  Channel 1: Our pipeline DB   │
              │  Channel 2: Market data API   │
              │  Channel 3: EDGAR companyfacts│
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  Quality Scoring              │
              │  Rank peers by comparability  │
              │  Assign quality penalties     │
              │  Compute overall confidence   │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  PeerRegistry Output          │
              │  Persisted to DB + artifacts  │
              └───────────────────────────────┘
```

## Module boundaries

```
src/lib/valuation/
  peer-discovery.ts        ← NEW: SIC-based peer finding + filtering
  peer-multiples.ts        ← NEW: Fetch multiples from DB/API/EDGAR
  peer-quality.ts          ← NEW: Quality scoring and ranking
  peer-registry.ts         ← MODIFIED: Dynamic builder replaces static lookup
```

## Caching and persistence

- Peer registries are persisted to the `stock_valuation` DB row alongside other artifacts
- A peer registry is reused if it was built within the last 30 days for the same ticker
- The cache key includes: ticker + SIC code + market cap bucket (so a big market cap change triggers rebuild)
- Curated overrides (like MU's existing registry) take priority over auto-discovered peers

## Performance budget

- The peer discovery step should add ≤5 seconds to the pipeline
- Most time is spent on market data API calls for peer multiples
- SIC lookup from `company_tickers.json` is a single cached HTTP call
- EDGAR submissions calls for peer candidates are rate-limited (10/sec)
