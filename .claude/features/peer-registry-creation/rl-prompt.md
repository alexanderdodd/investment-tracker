# RALPH Loop — Peer Registry Creation

You are implementing automated peer registry creation for the stock valuation pipeline.

## Core question

> Can the system automatically build a useful peer set for any US-listed ticker?

## Spec and Context

1. Read the full spec at `.claude/features/peer-registry-creation/`.
2. Start with `01-architecture.md` and `02-peer-discovery-strategy.md`.
3. The existing static peer registry is at `src/lib/valuation/peer-registry.ts`.
4. SEC EDGAR client is at `src/lib/sec-edgar/client.ts` — has SIC codes via `getSubmissions()`.
5. Market data client is at `src/lib/market-data/client.ts`.
6. The fair value synthesis is at `src/lib/valuation/fair-value-synthesis.ts`.
7. The pipeline is at `src/lib/generate-stock-valuation.ts`.

## Commands

- **Run golden fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts`
- **Run broken fixture test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts`
- **Run valuation verdict test:** `npx tsx src/lib/valuation/__tests__/ralph-mu-valuation-test.ts`
- **Run full pipeline on MU:** `npx tsx scripts/value-stock.ts --ticker MU`
- **Run full pipeline on another ticker:** `npx tsx scripts/value-stock.ts --ticker KO`
- **Type-check:** `npx tsc --noEmit`

## Implementation order

### Phase 1: SIC-based peer discovery
1. Create `src/lib/valuation/peer-discovery.ts`
2. Load `company_tickers.json` from SEC (already cached)
3. Extend to include SIC codes — use `company_tickers_exchange.json` or batch submissions lookup
4. Filter by SIC match level, market cap, filing recency
5. Apply curated overrides

### Phase 2: Peer multiples sourcing
1. Create `src/lib/valuation/peer-multiples.ts`
2. Check pipeline DB first (existing valuations)
3. Fall back to market data API
4. Fall back to EDGAR companyfacts for EV computation
5. Flag source on each data point

### Phase 3: Quality scoring
1. Create `src/lib/valuation/peer-quality.ts`
2. Score each peer (SIC match, market cap proximity, data quality, filing recency)
3. Compute registry-level confidence
4. Feed into relative valuation confidence

### Phase 4: Pipeline integration
1. Modify `peer-registry.ts` — `buildPeerRegistry()` replaces `getPeerRegistry()`
2. Wire into `generate-stock-valuation.ts` as Stage 0b
3. Update fair value synthesis to use dynamic registry
4. Persist registry to DB and iteration artifacts

## Each Iteration

### 1. Audit — Pick the highest-priority failing rule
Priority: PREG (regression) > PDSC (discovery) > PMUL (multiples) > PQAL (quality) > AC (acceptance)

### 2. Localize — Trace the issue in code

### 3. Patch — One focused fix

### 4. Validate
1. `npx tsc --noEmit`
2. `npx tsx src/lib/valuation/__tests__/ralph-mu-test.ts` (19/19)
3. `npx tsx src/lib/valuation/__tests__/ralph-mu-broken-test.ts` (10/10)
4. `npx tsx src/lib/valuation/__tests__/ralph-mu-valuation-test.ts` (11/11)
5. `npx tsx scripts/value-stock.ts --ticker MU` — verify MU still works
6. `npx tsx scripts/value-stock.ts --ticker KO` — verify non-MU ticker gets peers

### 5. Report — Write iteration artifacts

### 6. Commit and push

## Completion criteria

Output `<promise>RALPH COMPLETE</promise>` when:
- MU produces a peer registry (curated override works)
- At least one non-MU ticker produces a peer registry via SIC discovery
- Quality scoring is computed for all peers
- Registry confidence feeds into fair value synthesis
- All existing tests still pass (19/19 + 10/10 + 11/11)
- No regression on MU fair value output

Do **not** output the promise if there are fixable failures remaining.

## Known constraints

- Korean peers (SK hynix, Samsung) won't have SEC CIKs — curated override handles these
- SEC rate limit: 10 requests/sec
- Not all tickers will find good peers (obscure SIC codes)
- International companies with ADRs may or may not have EDGAR filings
