# Peer multiples sourcing

## Problem

Once peer candidates are identified, we need their financial multiples (P/E, EV/EBITDA, EV/Revenue, P/B) to compute relative valuation. There are three channels to source this data, in priority order.

## Channel 1: Pipeline DB (highest quality)

If we have previously run `generateStockValuation` for a peer ticker, use its stored canonical facts and computed multiples.

- **Source:** `stock_valuation` table in Postgres
- **Quality:** Highest — data has been through our full validation pipeline
- **Freshness:** Check `generated_at` — only use if within 90 days
- **Available fields:** All multiples (P/E, P/B, EV/EBITDA, EV/Revenue, EV/FCF) plus balance sheet, share counts, etc.
- **Flag in registry:** `source: "pipeline"`

### Query

```sql
SELECT canonical_facts, valuation_outputs, generated_at
FROM stock_valuation
WHERE ticker = $1
ORDER BY generated_at DESC
LIMIT 1
```

## Channel 2: Market data API (good quality)

For peers without pipeline data, fetch basic multiples from the market data provider (Yahoo Finance via existing `fetchMarketData`).

- **Source:** Yahoo Finance API (same as subject's market data)
- **Quality:** Good — real-time market data but without our validation
- **Freshness:** Real-time
- **Available fields:** P/E, P/B, market cap, price. EV/EBITDA and EV/Revenue require additional computation
- **Flag in registry:** `source: "market_data"`

### What we can compute from market data

| Multiple | Available? | How |
|----------|-----------|-----|
| Trailing P/E | Yes | Directly from API |
| P/B | Yes | Directly from API |
| Market cap | Yes | Directly from API |
| EV/EBITDA | Partial | Need total debt + cash from EDGAR |
| EV/Revenue | Partial | Need revenue from EDGAR |

## Channel 3: EDGAR company facts (fallback)

For peers where market data API fails, derive basic multiples from SEC filings.

- **Source:** EDGAR companyfacts XBRL endpoint
- **Quality:** Medium — authoritative filing data but requires computation
- **Freshness:** As of latest filing date (may be 1-3 months old)
- **Available fields:** Revenue, operating income, total equity, shares outstanding, debt, cash
- **Flag in registry:** `source: "edgar_xbrl"`

### What we can compute from EDGAR

Using the same XBRL extraction logic as our main pipeline (`buildCanonicalFacts`), but simplified for peers:

```typescript
interface PeerFinancials {
  ticker: string;
  source: "pipeline" | "market_data" | "edgar_xbrl";
  asOf: string;
  
  // From any source
  marketCap: number | null;
  trailingPe: number | null;
  priceToBook: number | null;
  
  // Require EDGAR or pipeline
  evToEbitda: number | null;
  evToRevenue: number | null;
  ttmRevenue: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  totalEquity: number | null;
}
```

## Sourcing waterfall

For each peer candidate:

```
1. Check pipeline DB → if fresh row exists, use it
2. Else fetch market data API → get P/E, P/B, market cap
3. If EV multiples needed → fetch EDGAR companyfacts for debt/cash/revenue
4. Compute EV = market cap + debt - cash
5. Compute EV/EBITDA, EV/Revenue from EDGAR data
6. Flag source channel on each data point
```

## Quality penalties by source

| Source | Confidence multiplier | Reason |
|--------|----------------------|--------|
| Pipeline | 1.0 | Full validation |
| Market data + EDGAR | 0.85 | No cross-validation |
| Market data only | 0.70 | Missing EV multiples |
| EDGAR only | 0.65 | No real-time price, stale multiples |

## Rate limiting and batching

- Pipeline DB: No rate limit (local DB query)
- Market data API: Batch requests, max 5 concurrent
- EDGAR: 10 requests/sec (existing throttle)
- Total peer multiples sourcing: target ≤10 seconds for 8 peers

## Missing data handling

If a peer has fewer than 2 usable multiples:
- Mark it as `hasMultiples: false` in the registry
- Reduce its weight in relative valuation
- If all peers lack multiples, skip relative valuation entirely
