# Peer registry specification

## 1. Purpose

VAL-004 requires that any multiples-based valuation uses a **deterministically sourced or curated** peer set. Without a valid peer registry, the valuation gate must withhold the verdict (`PUBLISH_FACTS_ONLY`).

This specification defines the peer registry data model, sourcing strategy, validation rules, and integration points for resolving VAL-004.

## 2. Design principles

1. **Deterministic** — given the same inputs, the peer set must be identical every time.
2. **Auditable** — the selection rationale must be persisted and traceable.
3. **Composable** — a curated seed list per industry is extended and filtered by algorithmic rules.
4. **Conservative** — prefer fewer high-quality peers over many weak ones. Minimum 3, target 5.
5. **Defensive** — if the peer set cannot be validated (too few, stale data, missing filings), the gate withholds.

## 3. Data model

### Peer registry entry

```typescript
interface PeerRegistryEntry {
  /** Subject ticker this peer set belongs to */
  subjectTicker: string;
  /** Industry framework type (semiconductor, financial, etc.) */
  frameworkType: string;
  /** Ordered list of peer tickers, most comparable first */
  peers: PeerCandidate[];
  /** Selection method used */
  selectionMethod: "curated" | "algorithmic" | "hybrid";
  /** Disallowed tickers and why */
  exclusions: { ticker: string; reason: string }[];
  /** Minimum peers required for VAL-004 to pass */
  minimumPeers: number;
  /** Timestamp of last validation */
  validatedAt: string;
  /** Hash of inputs used to generate this set (for determinism check) */
  inputHash: string;
}

interface PeerCandidate {
  ticker: string;
  companyName: string;
  /** Why this company is a valid peer */
  rationale: string;
  /** SIC or GICS code */
  industryCode: string;
  /** Market cap at selection time (USD) */
  marketCap: number | null;
  /** Revenue at selection time (USD, TTM) */
  revenue: number | null;
  /** Whether this peer has a valid canonical-facts run in our DB */
  hasCanonicalFacts: boolean;
  /** Whether multiples data is available */
  hasMultiples: boolean;
}
```

### Peer multiples snapshot

```typescript
interface PeerMultiplesSnapshot {
  ticker: string;
  asOf: string;
  trailingPE: number | null;
  priceToBook: number | null;
  evToRevenue: number | null;
  evToEbit: number | null;
  evToEbitda: number | null;
  evToFcf: number | null;
  /** Source: "pipeline" (our own canonical facts) or "market_data" (external) */
  source: "pipeline" | "market_data";
}

interface PeerComparison {
  subjectTicker: string;
  peers: PeerMultiplesSnapshot[];
  peerMedian: Record<string, number | null>;
  peerMean: Record<string, number | null>;
  subjectVsPeerMedian: Record<string, number | null>;
  generatedAt: string;
}
```

## 4. Sourcing strategy — hybrid approach

### Layer 1: Curated seed lists (high confidence)

Maintain a static registry of peer groups per industry framework. These are hand-picked based on business model similarity, not just sector classification.

```typescript
const CURATED_PEER_SEEDS: Record<string, string[]> = {
  // Memory semiconductor peers for MU
  "semiconductor:memory": ["WDC", "SKM", "SSNLF"],
  // Broader semiconductor peers (logic/foundry excluded)
  "semiconductor:general": ["TXN", "MCHP", "ON", "NXPI", "ADI", "MRVL", "SWKS", "QRVO"],
  // Financials — large bank peers
  "financial:large_bank": ["JPM", "BAC", "WFC", "C", "GS", "MS"],
  // Consumer staples — beverages
  "consumer_staples:beverage": ["KO", "PEP", "MNST", "KDP"],
  // etc.
};
```

Curated lists are versioned and checked into the repository. Changes require explicit review.

### Layer 2: Algorithmic filtering (deterministic)

Starting from the curated seed list, apply deterministic filters:

1. **Activity filter**: Peer must have a 10-Q filed within the last 6 months.
2. **Size filter**: Peer market cap must be within 0.1x–10x of the subject's market cap.
3. **Revenue filter**: Peer TTM revenue must be within 0.1x–10x of the subject's TTM revenue (if available).
4. **Data availability filter**: Peer must have retrievable multiples (either from our pipeline or market data).
5. **Exclusion filter**: Apply the `disallowedPeers` list from the industry framework.

Filters are applied in order. Each filter logs which peers it removed and why.

### Layer 3: Validation

After filtering:
- If fewer than 3 peers remain, VAL-004 fails (peer set insufficient).
- If fewer than 3 peers have usable multiples data, VAL-004 fails (multiples data insufficient).
- If all checks pass, compute the peer comparison and persist it.

## 5. Peer multiples sourcing

Peer multiples can be sourced from two channels, in priority order:

### Channel 1: Pipeline-derived (preferred)

If we have previously run `generateStockValuation` for a peer ticker, use its stored canonical facts and derived metrics. This is the highest-quality source because the data has been through our full validation pipeline.

### Channel 2: Market data API (fallback)

For peers we haven't run through our pipeline, fetch basic multiples from the market data provider (currently Yahoo Finance via the existing `fetchMarketData` function). This provides P/E, P/B, and EV/EBITDA but without our validation guarantees.

Mark the source in the `PeerMultiplesSnapshot` so the comparison knows which peers have pipeline-grade data vs market-data-grade data.

## 6. Validation rules

### VAL-004 pass conditions

VAL-004 passes when ALL of the following are true:

1. A peer registry entry exists for the subject ticker's framework type.
2. The peer set contains at least 3 validated peers after filtering.
3. At least 3 peers have at least one usable multiple (P/E, EV/EBITDA, or EV/Revenue).
4. The peer set does not contain any ticker from `disallowedPeers`.
5. The selection method and filter results are persisted in the run artifacts.

### VAL-004 fail conditions

VAL-004 fails (and valuation gate withholds) when ANY of the following are true:

1. No curated seed list exists for the subject's framework type.
2. Fewer than 3 peers survive the algorithmic filters.
3. Fewer than 3 peers have usable multiples data.
4. The peer registry entry is stale (validated more than 90 days ago for curated seeds).

## 7. Integration points

### Module boundaries

```text
src/lib/valuation/
  peer-registry.ts         # Curated seed lists + registry lookup
  peer-resolver.ts         # Algorithmic filtering + validation
  peer-multiples.ts        # Multiples fetching (pipeline DB + market data fallback)
  peer-comparison.ts       # Median/mean computation + subject vs peer analysis
```

### Pipeline integration

Insert peer resolution into the valuation pipeline between financial analysis and the valuation engine:

```
buildCanonicalFacts → computeFinancialAnalysis → resolvePeers → runValuationEngine → runQaValidation
```

The peer comparison result feeds into:
1. **Valuation engine** — peer median multiples as a sanity check or secondary valuation anchor.
2. **QA validator** — VAL-004 check uses the peer registry entry to pass or fail.
3. **Narrative** — LLM can reference peer comparison if the data is validated and in the surface allowlist.
4. **Artifacts** — peer comparison persisted to DB and iteration bundle.

### QA validator update

Replace the hardcoded VAL-004 failure with a real check:

```typescript
// VAL-004: Peer registry validation
const peerResult = resolvePeers(facts.ticker, framework, facts);
if (peerResult.status === "insufficient") {
  failures.push(`VAL-004: ${peerResult.reason}`);
} else {
  // Peer set validated — store for use in valuation engine
  peerComparison = computePeerComparison(facts, peerResult);
}
```

### Surface allowlist extension

Add peer-derived fields to the field registry:

```typescript
// Class B — Peer comparison (derived, traced)
{ field: "peers.median_pe", class: "B", description: "Peer median P/E", dependsOn: ["VAL-004"] },
{ field: "peers.median_ev_ebitda", class: "B", description: "Peer median EV/EBITDA", dependsOn: ["VAL-004"] },
{ field: "peers.subject_vs_median", class: "B", description: "Subject vs peer median", dependsOn: ["VAL-004"] },
```

These fields are automatically suppressed if VAL-004 fails (dependency-aware suppression).

### Formula trace extension

Peer-derived metrics must have formula traces:

```json
{
  "field": "peers.median_pe",
  "formula": "median(peer_trailing_pe_values)",
  "inputs": [
    {"field": "WDC.trailing_pe", "value": 12.3, "validated": true},
    {"field": "TXN.trailing_pe", "value": 22.1, "validated": true},
    {"field": "MCHP.trailing_pe", "value": 18.7, "validated": true}
  ],
  "period_scope": "TTM",
  "share_basis": null
}
```

## 8. Artifact persistence

### New DB columns (stock_valuation table)

```sql
ALTER TABLE stock_valuation ADD COLUMN peer_registry JSONB;
ALTER TABLE stock_valuation ADD COLUMN peer_comparison JSONB;
```

### New iteration bundle file

Add to `ralph-loop-reports/iteration-{N}/`:
- `peer-comparison.json` — full peer registry entry + comparison results

### Updated artifact inventory

Add `peer-comparison.json` to the artifact inventory schema.

## 9. Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `PEER-001` | Curated seed list exists for semiconductor framework | At least 3 semiconductor-adjacent peers defined |
| `PEER-002` | Algorithmic filtering is deterministic | Same inputs → same peer set, verified by input hash |
| `PEER-003` | Size and activity filters work | Peers outside 0.1x–10x market cap range are excluded |
| `PEER-004` | Disallowed peers excluded | No ticker from `disallowedPeers` appears in final set |
| `PEER-005` | Multiples fetched for peers | At least 3 peers have P/E or EV/EBITDA values |
| `PEER-006` | Peer comparison computed | Median and mean multiples computed and persisted |
| `PEER-007` | VAL-004 passes for MU | MU peer set has ≥3 validated peers with multiples |
| `PEER-008` | Peer fields in surface allowlist | Peer-derived metrics appear only when VAL-004 passes |
| `PEER-009` | Peer formula traces | Peer median multiples have formula traces with inputs |
| `PEER-010` | Artifacts persisted | `peer-comparison.json` in iteration bundle + `peer_registry`/`peer_comparison` in DB |
| `PEER-011` | Insufficient peers → withhold | When curated list is empty or filters remove all, VAL-004 fails and gate withholds |
| `PEER-012` | No regression | Adding peer support does not break any existing acceptance criteria |

## 10. Rollout plan

### Phase 1: Semiconductor peers (MU baseline)

1. Create curated seed list for `semiconductor:memory` and `semiconductor:general`.
2. Implement `peer-registry.ts` with static seed lookup.
3. Implement `peer-resolver.ts` with algorithmic filters.
4. Implement `peer-multiples.ts` with market data fallback.
5. Implement `peer-comparison.ts` for median/mean computation.
6. Update QA validator to use real peer check instead of hardcoded fail.
7. Run MU through the pipeline — verify VAL-004 passes.
8. Verify valuation gate now considers peer validation in its decision.

### Phase 2: Cross-industry expansion

1. Add curated seed lists for remaining framework types (financial, consumer_staples, growth_tech, reit, commodity_cyclical, utility).
2. Add pipeline-derived peer multiples (run peer tickers through our own pipeline).
3. Add peer comparison to the narrative prompt so the LLM can reference it.
4. Add peer comparison section to the generated report (when VAL-004 passes).

### Phase 3: Automation and maintenance

1. Add staleness checks — curated lists must be reviewed quarterly.
2. Add automated peer discovery from SEC SIC/GICS codes as a suggestion engine.
3. Add peer comparison trending (how subject multiples compare to peers over time).

## 11. Known constraints

1. **International peers** (e.g., Samsung `SSNLF`, SK Hynix `SKM`) may not have SEC filings. These can only be sourced via market data, not our pipeline.
2. **Curated lists require human judgment** — the algorithmic layer filters but cannot replace domain expertise in selecting truly comparable companies.
3. **Market data API rate limits** — fetching multiples for many peers may require batching or caching.
4. **Stale peer data** — if a peer's last filing is old, its multiples may not reflect current conditions. The activity filter (10-Q within 6 months) mitigates this.
