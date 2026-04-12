# Expert Feedback — Iteration 11

**Date:** 2026-04-12
**Reviewer verdict:** Better than iteration 10. Directionally useful, not yet fully trustworthy in wording and presentation.

## Clear improvements vs iteration 10

1. **Report and gate state now aligned** — biggest improvement. Run manifest and generated report agree on PUBLISH_FACTS_PLUS_VALUE with fair value block.
2. **Reverse DCF correctly removed from midpoint** — less circular, midpoint dropped from $144.98 to $99.20, high from $375.38 to $260.63.
3. **Peer-quality confidence more realistic** — Samsung penalty increased, curated-only cap applied, relative confidence dropped from 0.88 to 0.65.
4. **Confidence more honest** — 25% with better reasons including peer-quality weakness. More believable than iteration 10's 40%.
5. **Deterministic key risks added** — 5 risks for MU at peak, each citing specific metrics, all from code.

## What has NOT improved enough

### Issue 1: Semantic contradiction in report (TOP PRIORITY)

The report header says:
> Publish Gate: FACTS_PLUS_VALUE — fair value published

But the LLM narrative later says:
> "Due to the extreme cyclical position, a traditional fair value assessment cannot be reliably determined at this time."

These cannot both be true. The old withheld-version wording is bleeding into the new published-value template. **This is now the biggest remaining issue.**

### Issue 2: Label overstates certainty at low confidence

`DEEP_EXPENSIVE` reads more certain than 25% confidence supports. At very low confidence, should collapse to `EXPENSIVE` with explicit low-confidence wording. Suggested rule: if confidence < 0.35, do not use DEEP_CHEAP / DEEP_EXPENSIVE.

### Issue 3: Confidence reason wording for reverse DCF

Confidence reasons still say "Primary methods (DCF vs reverse DCF) disagree by 98%" — but reverse DCF is now diagnostic-only, not a primary method. Should say "Market-implied expectations differ sharply from normalized-value methods" instead.

## Minor issue

Report narrative says Micron has "fiscal years ending in September" — but filing metadata anchors on late August. Narrative layer not fully locked to canonical metadata.

## Expert's three recommended next fixes

1. **Fix valuation-template contradiction** — add assertion: if PUBLISH_FACTS_PLUS_VALUE, narrative must NOT contain "fair value cannot be reliably determined", "valuation withheld", etc.
2. **De-intensify label at low confidence** — if confidence < 0.35, collapse DEEP_CHEAP/DEEP_EXPENSIVE to CHEAP/EXPENSIVE
3. **Reword reverse DCF confidence reason** — "Market-implied expectations differ sharply from normalized-value methods" instead of "DCF vs reverse DCF disagree"

## Expert's practical threshold call

> Iteration 11 is clearly better than iteration 10. I would now describe it as: good enough to produce a directionally useful expensive/fair/cheap signal, not yet good enough to claim a highly trustworthy precise fair value. The next iteration should be a small cleanup iteration, not a redesign.
