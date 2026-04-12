# Implementation guidance

## Keep the current facts pipeline intact

Do not rewrite or loosen:
- statement-table-first TTM builder
- quarter identity validation
- balance-sheet / share-count logic
- publish gate semantics for facts
- suppression behavior for withheld states

## Add new modules

Suggested additions:

```text
src/
  valuation/
    peerRegistry.ts
    relativeFramework.ts
    normalizedDcf.ts
    reverseDcf.ts
    fairValueSynthesizer.ts
    actionZones.ts
    valuationCalibration.ts
  validation/
    valuationRules.ts
    actionRules.ts
  reports/
    renderValueLayer.ts
    renderActionLayer.ts
```

## LLM usage rules for this phase

### Allowed
- explain already-validated valuation outputs
- summarize assumptions
- red-team structural vs cyclical reasoning
- surface qualitative risks linked to evidence pack entries

### Forbidden
- selecting peers ad hoc
- inventing fair value numbers
- inventing buy/sell thresholds
- overriding valuation or action gates
- computing or modifying core model outputs

## Persistence requirements

Persist new artifacts alongside current ones:
- peer registry snapshot used
- valuation method pack
- fair value synthesis artifact
- action zone artifact
- valuation confidence artifact
- action confidence artifact
- calibration results
- rendered valuation-surface scan
