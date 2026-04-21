# Constituent Freshness — Auto-Discovery Architecture

## Problem

Industry pages show only manually-seeded stocks. The seed file is a static snapshot that doesn't reflect IPOs, delistings, GICS reclassifications, or index changes. Users see only 2-3 stocks in some industries when there should be 10-30.

## Decision: ETF-holdings-first discovery

**Chosen approach:** Use sector ETF holdings from Yahoo Finance as the primary discovery source. Each sector already has an ETF proxy in the taxonomy (XLK, XLF, XLE, etc.). Fetch their holdings, classify each ticker by industry, and auto-seed.

**Why this over alternatives:**
- **vs. paid constituent feeds** — zero new API keys, works today
- **vs. web scraping S&P indices** — fragile, TOS-questionable
- **vs. manual curation only** — doesn't scale, goes stale
- **Limitation acknowledged:** Yahoo `topHoldings` returns 10-15 per ETF. We supplement with manual seeds for deeper coverage until a paid feed is added.

## Architecture

### Discovery flow (runs as part of `generate-industry-analytics`)

```
1. For each sector:
   a. Fetch ETF top holdings → list of tickers
   b. For each new ticker (not already in DB):
      i.  Fetch Yahoo assetProfile → { sector, industry }
      ii. Map Yahoo industry name → GICS industry code
      iii. Upsert into stock_classification (source = "etf_discovery")
   c. Compute industry analytics with the expanded universe
```

### Source field semantics

| Source | Meaning | Freshness |
|--------|---------|-----------|
| `curated_override` | Manually added, human-verified GICS mapping | Static until re-seeded |
| `etf_discovery` | Auto-discovered from ETF holdings + Yahoo classification | Refreshed on every analytics run |

### Yahoo industry → GICS mapping

Yahoo Finance uses ~60 industry names that don't exactly match GICS. A mapping table in `src/lib/yahoo-to-gics.ts` translates them. Unmapped industries are logged and skipped (not silently misclassified).

### Staleness handling

- Stocks discovered via ETF that are no longer in holdings: kept in DB (not deleted — they still exist as companies)
- Stocks where Yahoo returns no data (delisted): metrics fetch fails, screen shows them as data-incomplete
- Stocks reclassified to a different industry: next discovery run updates their `industryId`

## Files

| File | Purpose |
|------|---------|
| `src/lib/yahoo-to-gics.ts` | Yahoo industry name → GICS industry code mapping |
| `src/lib/discover-constituents.ts` | ETF holdings fetcher + auto-classification |
| `src/lib/generate-industry-analytics.ts` | Modified to call discovery before computing medians |
| `scripts/seed-gics.ts` | Manual seed (curated_override) — still the baseline |

## Future improvements

1. **Industry ETFs** — also fetch holdings from industry-level ETFs (e.g., XBI for biotech, XHB for homebuilders) for deeper per-industry coverage
2. **S&P 500/1500 constituent lists** — if a paid data source is added
3. **Daily cron** — run discovery on a schedule instead of only during analytics generation
4. **Delistings** — detect and flag stocks that no longer trade
