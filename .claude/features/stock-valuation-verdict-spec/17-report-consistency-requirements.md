# Report consistency requirements

## Problem

The valuation report must be internally consistent. When a user sees a verdict badge, fair value text, range bar, and confidence tooltip, all of these must tell the same story. Contradictions destroy trust.

Specific inconsistencies that have occurred:
1. Badge says "Fair Value" but text says "133% above fair value" — price was within the wide range but far above midpoint
2. Badge says "Fair Value" but visual range bar shows price way outside the green zone — different valuation run produced different range
3. Old valuation engine verdict ("Highly Uncertain" → "Fair Value") overrides the fair value synthesis label
4. Stale DB data from a previous run shown alongside fresh live price

## Invariants — must ALWAYS hold

### INV-001: Verdict matches price vs range

```
If price < fairValueLow  → verdict MUST be "Undervalued" (CHEAP)
If fairValueLow ≤ price ≤ fairValueHigh → verdict MUST be "Fair Value" (FAIR)
If price > fairValueHigh → verdict MUST be "Overvalued" (EXPENSIVE)
```

No exceptions. If the label doesn't match the price's position in the range, the report is broken.

### INV-002: Single source of truth for verdict

The verdict must come from exactly ONE place: `fairValueSynthesis.label`. The old valuation engine's `verdict` field must never be used for the user-facing label. The mapping is:
- `CHEAP` / `DEEP_CHEAP` → "Undervalued"
- `FAIR` → "Fair Value"
- `EXPENSIVE` / `DEEP_EXPENSIVE` → "Overvalued"

### INV-003: Text description matches verdict badge

If the badge says "Overvalued", the text must say "X% above fair value range ($low – $high)".
If the badge says "Fair Value", the text must say "Within fair value range ($low – $high)".
If the badge says "Undervalued", the text must say "X% below fair value range ($low – $high)".

### INV-004: Visual range bar matches text and badge

The position of the current price marker on the range bar must visually correspond to:
- Outside the green zone (right) → "Overvalued"
- Inside the green zone → "Fair Value"
- Outside the green zone (left) → "Undervalued"

### INV-005: Fair value range is consistent across all displays

The same `low`, `mid`, `high` values must appear in:
- The header text
- The range bar visual
- The bull/base/bear case cards
- The full research document header

### INV-006: Confidence scorecard matches confidence badge

The confidence rating (High/Medium/Low) must be derivable from the checklist:
- If all items pass → High
- If some fail → Medium or Low depending on score
- The score and the checklist must agree

## Validation mechanism

### Pipeline-side assertion

After assembling structured insights, run a consistency check:

```typescript
function assertReportConsistency(insights: StockValuationInsights): string[] {
  const violations: string[] = [];
  
  const price = Number(insights.currentPrice);
  const low = Number(insights.fairValueLow);
  const high = Number(insights.fairValueHigh);
  
  if (price && low && high) {
    const expectedVerdict = price < low ? "Undervalued" 
      : price > high ? "Overvalued" 
      : "Fair Value";
    
    if (insights.verdict !== expectedVerdict && insights.verdict !== "Withheld") {
      violations.push(
        `INV-001: Verdict "${insights.verdict}" but price $${price} vs range $${low}-$${high} suggests "${expectedVerdict}"`
      );
    }
  }
  
  return violations;
}
```

This assertion must run after every pipeline execution. If violations are found, they must be logged as warnings and included in the iteration scorecard.

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `CONSIST-001` | Verdict matches price vs range | INV-001 assertion passes |
| `CONSIST-002` | Single verdict source | Only fairValueSynthesis.label drives the badge |
| `CONSIST-003` | Text matches badge | Above/within/below text agrees with Overvalued/Fair/Undervalued |
| `CONSIST-004` | Visual matches text | Range bar price position agrees with text |
| `CONSIST-005` | Range values consistent | Same low/mid/high across all displays |
| `CONSIST-006` | Confidence consistent | Rating matches checklist pass/fail pattern |
