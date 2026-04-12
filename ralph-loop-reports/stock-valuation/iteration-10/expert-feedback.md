# Expert Feedback — Iteration 10

**Date:** 2026-04-12
**Reviewer verdict:** Close but not yet trustworthy as a publishable valuation report

## What is good

1. **Facts layer remains strong** — quarter chain correct, core numbers stable, formula traces validated
2. **Structured valuation synthesis** — method disagreement is now visible, not buried in prose
3. **Confidence explanation is useful** — "EXPENSIVE, LOW confidence, here's why" is genuinely better than pretending the midpoint is robust
4. **Directional label is plausible** — all four methods land below $420.59; the EXPENSIVE label direction is stable even if the midpoint is weak

## What is wrong

### Critical: Report-rendering inconsistency
The run manifest says `PUBLISH_FACTS_PLUS_VALUE` with fair value data, but `generated-report.md` still showed `VALUATION STATUS: WITHHELD`. The artifacts disagreed on what happened. **This was fixed post-iteration-10** — the pipeline now injects fair value data into the report header and structured insights correctly.

### Valuation quality issues

1. **Reverse DCF should not be in the fair value midpoint synthesis.** It answers "what is the market implying?" which is useful as a diagnostic but is circular when used to compute intrinsic value. It pulls the midpoint toward market price, which defeats the purpose. **Recommendation:** Keep it in the report as a "Market-implied expectations" section, but exclude from weighted midpoint.

2. **Relative valuation confidence is overstated at 0.88.** The peer registry itself documents serious limitations (few pure-play peers, conglomerate adjustments, Korean disclosure differences, curated snapshots not live data). Confidence should be reduced materially.

3. **Peer-quality weakness not in confidence reasons.** The confidence reasons list cycle divergence, range width, method disagreement, and history depth — but don't mention peer-quality limitations.

## Expert's three recommended next steps

1. **Make rendered report and gate state come from one source of truth.** Add a hard assertion: if valueGateStatus = PUBLISH_FACTS_PLUS_VALUE, then generated-report.md MUST contain fair value range, label, confidence rating, and reasons. If not, fail the iteration.

2. **Remove reverse DCF from fair value midpoint synthesis.** Keep it as a diagnostic overlay ("Market-implied expectations") but do not weight it into the intrinsic value range.

3. **Strengthen peer quality calibration.** Lower relative-valuation confidence or add more deterministic adjustments. Current 0.88 confidence is too high for a peer set with documented limitations.

## What NOT to work on next

- Narrative polish
- Red-team commentary
- Buy/sell guidance (Milestone B)
- Visualization work

## Expert's judgment

> "You have reached: a directionally useful expensive/fair/cheap signal with explicit low confidence.
> You have not yet reached: a coherent, publishable valuation report where the surfaced report, gates, and valuation artifacts all agree and the midpoint fair value is trustworthy."
