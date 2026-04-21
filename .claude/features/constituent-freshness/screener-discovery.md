# Yahoo Screener Discovery

## How it works

The Yahoo Finance screener API (`/v1/finance/screener`) accepts POST queries filtered by industry, market cap, region, and exchange. Unlike ETF holdings (which give top 10-15), the screener returns **all matching stocks** — typically 20-100 per industry.

## API details

```
POST https://query2.finance.yahoo.com/v1/finance/screener?crumb={crumb}

Body: {
  size: 50,
  sortField: "intradaymarketcap",
  sortType: "DESC",
  quoteType: "EQUITY",
  query: {
    operator: "AND",
    operands: [
      { operator: "eq", operands: ["region", "us"] },
      { operator: "eq", operands: ["industry", "Semiconductors"] },
      { operator: "gt", operands: ["intradaymarketcap", 2000000000] }
    ]
  }
}
```

## Key decisions

1. **Filter by Yahoo industry name, not sector** — gives us pre-classified stocks without needing per-stock assetProfile lookups
2. **Market cap >= $2B** — avoids micro-cap noise (spec Stage A threshold)
3. **Exclude OTC exchanges** — filter to NMS, NYQ, NGM, NAS, ASE only. This removes foreign OTC duplicates (e.g., TSMWF alongside TSM)
4. **Don't overwrite curated_override** — manually verified classifications take priority
5. **Max 50 per industry** — prevents any single industry from dominating

## Reverse mapping: GICS → Yahoo industries

The screener filters by Yahoo's industry names, so we need a GICS-to-Yahoo reverse mapping (in `discover-screener.ts`). Each GICS industry maps to 1-5 Yahoo industry names. Example:

- GICS 453010 (Semiconductors) → ["Semiconductors", "Semiconductor Equipment & Materials"]
- GICS 101010 (Oil, Gas & Fuels) → ["Oil & Gas Integrated", "Oil & Gas E&P", "Oil & Gas Midstream", "Oil & Gas Refining & Marketing"]

## Results

First full run: 908 new stocks across 48 industries from 120 Yahoo industry queries. Total universe expanded from 325 to ~1,233.

## Integration

Runs as part of `generate-industry-analytics` (before the ETF discovery phase). Can also be run standalone via `npm run discover-stocks`.
