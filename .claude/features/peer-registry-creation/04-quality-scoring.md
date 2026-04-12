# Quality scoring

## Per-peer quality score

Each peer gets a quality score from 0.0 (useless) to 1.0 (perfect comp). The score is composed of multiple factors:

### Factor 1: SIC match level

| Match level | Score contribution |
|-------------|-------------------|
| 4-digit SIC (exact industry) | 1.0 |
| 3-digit SIC (industry group) | 0.7 |
| Curated add (manual override) | 0.6 |
| 2-digit SIC (major group) | 0.4 |

### Factor 2: Market cap proximity

How close is the peer's market cap to the subject's?

```
ratio = min(peer_mcap, subject_mcap) / max(peer_mcap, subject_mcap)
```

| Ratio | Score contribution |
|-------|-------------------|
| ≥ 0.5 (within 2x) | 1.0 |
| 0.2 – 0.5 (within 5x) | 0.7 |
| 0.1 – 0.2 (within 10x) | 0.4 |
| < 0.1 | 0.2 |

### Factor 3: Data quality

| Condition | Score contribution |
|-----------|-------------------|
| Pipeline-derived multiples | 1.0 |
| Market data + EDGAR multiples | 0.8 |
| Market data only (P/E, P/B) | 0.6 |
| EDGAR only (computed, stale) | 0.5 |
| No usable multiples | 0.0 |

### Factor 4: Filing recency

| Last filing | Score contribution |
|-------------|-------------------|
| Within 3 months | 1.0 |
| 3-6 months | 0.8 |
| 6-9 months | 0.5 |
| > 9 months | 0.2 |

### Composite score

```
peerQuality = 0.35 × sicMatch + 0.25 × mcapProximity + 0.25 × dataQuality + 0.15 × filingRecency
```

## Registry-level confidence

The overall peer registry confidence determines how much the relative valuation method should be trusted.

### Factors

1. **Number of usable peers** (with multiples data)
   - 5+ peers: confidence bonus +0.10
   - 3-4 peers: neutral
   - 1-2 peers: penalty -0.15
   - 0 peers: relative valuation skipped

2. **Average peer quality**
   - Average quality ≥ 0.7: "strong" peers
   - Average quality 0.5-0.7: "medium" peers
   - Average quality < 0.5: "weak" peers

3. **Data source homogeneity**
   - All pipeline-derived: bonus +0.05
   - All curated snapshots (current MU state): penalty -0.15
   - Mix of pipeline + market data: neutral

4. **SIC coverage**
   - Peers are all 4-digit SIC: bonus +0.05
   - Mix of 3-digit and 4-digit: neutral
   - Mostly 2-digit or curated: penalty -0.10

### Confidence computation

```
registryConfidence = base(0.70)
  + peerCountAdjustment
  + avgQualityAdjustment
  + dataSourceAdjustment
  + sicCoverageAdjustment
```

Capped at [0.0, 0.85]. Note: even the best auto-discovered peer set caps below 1.0 because algorithmic peer selection always has model risk.

## Peer ranking for display

Peers are ordered in the registry by:
1. Composite quality score (descending)
2. SIC match level (4-digit first)
3. Market cap proximity (closest first)

Top 3-5 peers are marked as "primary" and used in relative valuation.
Remaining peers (up to 8 total) are marked as "secondary" and available for context but given lower weight.

## Output

```typescript
interface PeerQualityAssessment {
  ticker: string;
  qualityScore: number;           // 0.0 - 1.0
  factors: {
    sicMatch: number;
    mcapProximity: number;
    dataQuality: number;
    filingRecency: number;
  };
  role: "primary" | "secondary";
  qualityPenalty: number;          // 1.0 - qualityScore (for weighting)
}

interface RegistryQuality {
  overallConfidence: number;       // 0.0 - 0.85
  peerCount: number;
  usablePeerCount: number;
  averagePeerQuality: number;
  qualityTier: "strong" | "medium" | "weak";
  reasons: string[];               // Human-readable explanations
}
```
