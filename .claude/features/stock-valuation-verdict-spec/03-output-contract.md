# Output contract

## Allowed output states

| Status | Facts | Fair value | Valuation label | Action analysis |
|---|---|---|---|---|
| `WITHHOLD_ALL` | No | No | No | No |
| `PUBLISH_FACTS_ONLY` | Yes | No | No | No |
| `PUBLISH_FACTS_PLUS_VALUE` | Yes | Yes | Yes | No |
| `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION` | Yes | Yes | Yes | Yes |

## Required fields when `PUBLISH_FACTS_PLUS_VALUE`

```json
{
  "valuationStatus": "published",
  "fairValueRange": {
    "low": 0,
    "mid": 0,
    "high": 0,
    "currency": "USD"
  },
  "valuationLabel": "CHEAP | FAIR | EXPENSIVE",
  "valuationConfidence": 0.0,
  "currentPrice": 0,
  "priceVsMid": 0.0,
  "methodSummary": {
    "normalizedDcf": {},
    "reverseDcf": {},
    "relativeValuation": {},
    "selfHistory": {}
  },
  "keyAssumptions": [],
  "valuationReasons": []
}
```

## Required fields when `PUBLISH_FACTS_PLUS_VALUE_PLUS_ACTION`

```json
{
  "actionStatus": "published",
  "actionLabel": "BUY_ZONE | ACCUMULATE | HOLD | TRIM | SELL_ZONE",
  "actionConfidence": 0.0,
  "buyBelow": 0,
  "trimAbove": 0,
  "sellAbove": 0,
  "thesisBreakTriggers": [],
  "whyNow": [],
  "whyNotNow": []
}
```

## Mandatory rule

If fair value is withheld:
- do not emit a cheap/fair/expensive label
- do not emit buy/sell style action labels
- do not emit valuation confidence
- do not emit price targets or margin of safety

## Action-style language rule

Allowed:
- "Buy zone below X if thesis remains intact"
- "Trim zone above Y if cycle indicators deteriorate"
- "Hold while price remains inside fair range"

Forbidden:
- "Buy now"
- "Sell now"
- "This is a must-buy"
