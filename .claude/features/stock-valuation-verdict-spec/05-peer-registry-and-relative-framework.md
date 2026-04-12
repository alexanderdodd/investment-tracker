# Peer registry and relative framework

## Why this is required

The current system withholds MU valuation partly because the peer set is not deterministically sourced or curated.

That must be fixed before valuation publication can be trusted.

## Required artifact

Create a deterministic `peer_registry` or `relative_framework_registry`.

### Example schema

```json
{
  "ticker": "MU",
  "framework": "cyclical_semiconductor_memory_v1",
  "effectiveDate": "2026-04-12",
  "primaryPeers": [
    {
      "ticker": "000660.KS",
      "name": "SK hynix",
      "role": "memory_primary",
      "publicDataUsable": true,
      "notes": "Direct memory peer"
    },
    {
      "ticker": "005930.KS",
      "name": "Samsung Electronics",
      "role": "memory_primary_but_conglomerate",
      "publicDataUsable": true,
      "notes": "Use with weighting penalty due to conglomerate structure"
    }
  ],
  "secondaryPeers": [
    {
      "ticker": "WDC",
      "name": "Western Digital",
      "role": "storage_adjacent",
      "publicDataUsable": true
    }
  ],
  "selfHistoryAllowed": true,
  "relativeMetrics": ["EV/EBIT", "EV/EBITDA", "EV/Revenue", "P/B"],
  "weights": {
    "primaryPeers": 0.7,
    "secondaryPeers": 0.3
  },
  "caveats": [
    "Few clean public pure-play memory peers",
    "Conglomerate adjustments required for Samsung"
  ]
}
```

## Mandatory rules

1. The peer or relative framework must be deterministic.
2. Every peer entry must have provenance and role.
3. If peer quality is weak, the method weight must be reduced automatically.
4. If a clean peer set is not possible, the system may still publish valuation only if:
   - the alternative relative framework is documented
   - self-history is used as a secondary anchor
   - confidence is reduced accordingly
