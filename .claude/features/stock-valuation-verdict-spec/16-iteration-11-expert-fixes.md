# Iteration 11 expert fixes specification

Three cleanup fixes identified by expert review. These are small, targeted changes — not a redesign.

## Fix 1: Eliminate withheld-language contamination in published reports (TOP PRIORITY)

### Problem
When the value gate publishes (`PUBLISH_FACTS_PLUS_VALUE`), the LLM narrative still contains withheld-era language like "a traditional fair value assessment cannot be reliably determined at this time." This directly contradicts the report header which shows the fair value range.

The root cause: the narrative LLM prompt was written for the old `PUBLISH_FACTS_ONLY` state and includes instructions to say valuation is withheld. When the value gate now publishes, the narrative prompt must reflect that.

### Specification

1. **Update narrative prompt for published-value state.** When `valueGate.valuePublishable` is true, the LLM prompt should:
   - State that a fair value range has been computed
   - Include the range, label, and confidence in the prompt data
   - Instruct the LLM to reference and explain the fair value assessment
   - NOT include withheld-language instructions

2. **Add a post-render withheld-language assertion.** After the narrative is generated, scan for contradictory phrases:
   - "fair value cannot be reliably determined"
   - "fair value assessment cannot be"
   - "no fair value provided"
   - "valuation withheld"
   - "valuation status: withheld"
   - "cannot be determined at this time"
   
   If any appear when `valueGate.valuePublishable` is true, log a warning. The narrative must be consistent with the gate state.

3. **Update the narrative instruction block.** When value is published, use a new instruction block:
   ```
   VALUATION CONTEXT — FAIR VALUE PUBLISHED:
   The system has computed a fair value range. You should reference it in your analysis.
   Fair value: $X — $Y — $Z
   Label: EXPENSIVE (LOW confidence)
   
   Explain what this means for the stock. Discuss why confidence is low.
   Do NOT say "fair value cannot be determined" — it has been determined,
   with explicit uncertainty captured in the confidence rating.
   ```

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `NARR-CLEAN-001` | No withheld language in published-value reports | Assertion scans narrative for contradictory phrases |
| `NARR-CLEAN-002` | Narrative references fair value when published | Report body mentions the fair value range |
| `NARR-CLEAN-003` | Narrative prompt includes fair value data | LLM prompt contains range, label, confidence when value publishes |

## Fix 2: De-intensify label at very low confidence

### Problem
`DEEP_EXPENSIVE` reads more certain than 25% confidence supports. The "DEEP" prefix implies high conviction, which contradicts low confidence.

### Specification

In `fair-value-synthesis.ts`, add a post-labeling rule:

```typescript
// De-intensify label when confidence is very low
if (valuationConfidence < 0.35) {
  if (label === "DEEP_CHEAP") label = "CHEAP";
  if (label === "DEEP_EXPENSIVE") label = "EXPENSIVE";
}
```

This means DEEP labels are only used when confidence ≥ 0.35.

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `LABEL-001` | DEEP labels suppressed at low confidence | If confidence < 0.35, label is CHEAP or EXPENSIVE, not DEEP_* |
| `LABEL-002` | DEEP labels still work at higher confidence | If confidence ≥ 0.35 and price is extreme, DEEP label used |

## Fix 3: Reword reverse DCF confidence reason

### Problem
Confidence reasons say "Primary methods (DCF vs reverse DCF) disagree by X%" but reverse DCF is no longer a primary method — it's diagnostic-only with 0% weight. The wording is misleading.

### Specification

In `fair-value-synthesis.ts`, update the method disagreement confidence reason:

**Before:**
```
"Primary methods (DCF vs reverse DCF) disagree by 98%"
```

**After:**
```
"Contributing valuation methods disagree by X% — normalized economics produce different estimates than market-comparable approaches"
```

The reason should describe the disagreement among methods that actually contribute to the midpoint (DCF, relative, self-history), not reference reverse DCF which is excluded.

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `RDCF-REASON-001` | Confidence reasons do not reference "reverse DCF" | No confidence reason mentions "reverse DCF" by name |
| `RDCF-REASON-002` | Method disagreement reason describes contributing methods | Reason text references the actual contributing methods |

## Priority order for next RALPH loop

1. **Withheld-language contamination** (NARR-CLEAN-001..003) — top issue, breaks user trust
2. **Label de-intensification** (LABEL-001..002) — quick fix, improves presentation
3. **Reverse DCF reason rewording** (RDCF-REASON-001..002) — quick fix, improves accuracy
