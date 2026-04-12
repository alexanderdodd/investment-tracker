# Peer discovery strategy

## Layer 1: SIC code matching

The primary peer discovery mechanism uses SEC EDGAR's Standard Industrial Classification (SIC) codes.

### How it works

1. **Get subject's SIC code** from EDGAR submissions (already available in `buildCanonicalFacts`)
2. **Load `company_tickers.json`** from SEC — maps 14,000+ tickers to CIKs (already cached in `sec-edgar/client.ts`)
3. **For each candidate ticker**, fetch its SIC code from EDGAR submissions
4. **Match at two levels**:
   - **4-digit SIC match** (exact industry) — highest quality peers
   - **3-digit SIC match** (industry group) — broader but weaker peers
   - **2-digit SIC match** (major group) — only if 4-digit and 3-digit yield too few

### SIC code structure

```
SIC 3674 = Semiconductors & Related Devices
     ^^── Industry (4-digit): exact match
     ^─── Industry group (3-digit): "Electronic Components & Accessories"
     ──── Major group (2-digit): "Electronic & Other Electrical Equipment"
```

### Optimization: batch SIC lookup

Rather than fetching EDGAR submissions for every candidate (14,000+ tickers), we use a smarter approach:

1. SEC publishes `company_tickers_exchange.json` which includes SIC codes
2. If not available, use the EDGAR full-text search API with SIC filter: `https://efts.sec.gov/LATEST/search-index?q=*&forms=10-K&dateRange=custom&sic=3674`
3. Fallback: fetch submissions for the top ~50 candidates by market cap in the same exchange

## Layer 2: Curated overrides

For industries where SIC codes are too broad or misleading, maintain a curated override file:

```typescript
const CURATED_OVERRIDES: Record<string, { add: string[]; remove: string[]; notes: string }> = {
  // Memory semiconductors — SIC 3674 includes ALL semiconductors
  // Add specific memory peers, remove unrelated chip companies
  "MU": {
    add: ["WDC"],  // Storage-adjacent, not same SIC
    remove: ["NVDA", "AMD", "INTC"],  // Different business model despite same SIC
    notes: "Memory is a distinct sub-segment of SIC 3674"
  },
};
```

Curated overrides:
- **Add** peers that SIC misses (different SIC but comparable business)
- **Remove** peers that SIC includes incorrectly (same SIC but different business model)
- Are versioned and auditable
- Only exist for industries where SIC is known to be problematic

## Layer 3: Size and activity filtering

After SIC matching, apply deterministic filters:

### Market cap filter
- Peer market cap must be within **0.1x – 10x** of the subject's market cap
- This prevents comparing a $500B company to a $500M company
- Market cap is fetched from market data API (same source as subject's price)

### Activity filter
- Peer must have filed a **10-Q or 10-K within the last 9 months**
- Checked via EDGAR submissions' recent filing dates
- Removes delisted, dormant, or non-reporting companies

### Minimum filing history
- Peer must have at least **3 years of annual filing history**
- Required for meaningful multiple comparison

### Exclusion filter
- Remove the subject ticker itself
- Remove tickers in the `disallowedPeers` list from the industry framework
- Remove tickers in the curated override `remove` list

## Output: Candidate list

The discovery phase produces an ordered list of candidate peers:

```typescript
interface PeerCandidate {
  ticker: string;
  companyName: string;
  cik: string;
  sic: string;
  sicDescription: string;
  matchLevel: "sic_4digit" | "sic_3digit" | "sic_2digit" | "curated_add";
  marketCap: number | null;
  lastFilingDate: string | null;
  annualFilingCount: number;
}
```

Candidates are ordered by:
1. Match level (4-digit > 3-digit > curated_add > 2-digit)
2. Market cap proximity to subject
3. Filing recency

## Target peer counts

| Scenario | Target | Minimum | Action if below minimum |
|----------|--------|---------|------------------------|
| 4-digit SIC has enough peers | 5-8 | 3 | Use as-is |
| 4-digit SIC has too few | 5-8 | 3 | Expand to 3-digit SIC |
| 3-digit SIC still too few | 5-8 | 3 | Expand to 2-digit SIC |
| 2-digit SIC still too few | any | 1 | Proceed with reduced confidence |
| No SIC matches at all | 0 | 0 | Skip relative valuation entirely |

## Rate limiting

SEC EDGAR enforces 10 requests/second. The peer discovery must:
- Use the cached `company_tickers.json` (single request, cached)
- Batch SIC lookups where possible
- Limit EDGAR submissions fetches to top candidates only
- Stay within the 10/sec throttle already implemented in `sec-edgar/client.ts`
