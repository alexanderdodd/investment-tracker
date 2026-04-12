# Iteration 10 expert fixes specification

This document captures the three fixes identified by expert review of iteration 10, plus the key risks fix identified from the dashboard.

## Fix 1: Report-rendering source of truth (HIGHEST PRIORITY)

### Problem
The rendered report (`generated-report.md`) and the gate state can disagree. In iteration 10, the run manifest said `PUBLISH_FACTS_PLUS_VALUE` but the generated report still said `VALUATION STATUS: WITHHELD`.

**Note:** The pipeline code was partially fixed post-iteration-10 (fair value now injected into report header and structured insights), but there is no hard assertion to catch future regressions.

### Specification

Add a **report-gate consistency assertion** that runs after the report is assembled:

```typescript
function assertReportGateConsistency(
  researchDocument: string,
  valueGateStatus: string,
  fairValueSynthesis: FairValueSynthesis
): { pass: boolean; violations: string[] }
```

Rules:
- If `valueGateStatus === "PUBLISH_FACTS_PLUS_VALUE"`, the report MUST contain:
  - `FAIR VALUE ASSESSMENT` section header
  - The fair value range numbers
  - The valuation label (CHEAP/FAIR/EXPENSIVE)
  - The confidence rating (HIGH/MEDIUM/LOW)
  - At least one confidence reason
- If any are missing, the assertion **fails** and the iteration is marked as failed

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `RENDER-001` | Report-gate consistency assertion exists | Assertion runs after report assembly |
| `RENDER-002` | Assertion catches missing fair value in published state | If value gate publishes but report lacks fair value section, assertion fails |
| `RENDER-003` | Assertion passes for current MU report | Current pipeline produces consistent report |

## Fix 2: Remove reverse DCF from fair value midpoint (SECOND PRIORITY)

### Problem
Reverse DCF answers "what does the market imply?" — it is circular when used to compute intrinsic value because it derives from the current market price. Including it in the weighted midpoint pulls fair value toward market price, reducing the signal.

Current contribution: reverse DCF at $357.50 with 20% weight inflates the midpoint.

### Specification

1. **Remove reverse DCF from `DEFAULT_WEIGHTS`** — set its weight to 0 in the synthesis
2. **Renormalize remaining weights** to 100%:
   - Normalized FCFF DCF: 55% (was 45%)
   - Relative valuation: 30% (was 25%)
   - Self-history: 15% (was 10%)
3. **Keep reverse DCF in the report** as a separate "Market-implied expectations" diagnostic section
4. **Keep reverse DCF in formula traces** — it's still a validated computation
5. **Include reverse DCF interpretation in the narrative prompt** as context (not as a fair value input)

### Expected impact
- Fair value midpoint should move lower (closer to DCF/relative/self-history consensus)
- Range should narrow (removing the outlier pull from market-implied value)
- Method disagreement should decrease (comparing only non-circular methods)
- Confidence may increase slightly (less dispersion)

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `RDCF-001` | Reverse DCF excluded from weighted midpoint | Effective weight = 0 in synthesis |
| `RDCF-002` | Remaining methods renormalized | DCF + relative + self-history weights sum to 100% |
| `RDCF-003` | Reverse DCF still in report | Appears as diagnostic/market-implied section |
| `RDCF-004` | Range narrows vs iteration 10 | Range width decreases |
| `RDCF-005` | Midpoint moves vs iteration 10 | Midpoint shifts toward non-circular methods |

## Fix 3: Recalibrate relative valuation confidence (THIRD PRIORITY)

### Problem
Relative valuation confidence is 0.88, which is too high given documented peer limitations:
- Few clean pure-play memory peers globally
- Samsung requires conglomerate adjustment (memory ~60% of OP)
- SK hynix has Korean GAAP/IFRS disclosure differences
- WDC is storage-adjacent, not pure memory
- All peer multiples are curated snapshots, not live pipeline-derived

### Specification

1. **Add "peer data is curated snapshots" penalty** (-0.15) to the relative valuation confidence model
2. **Add peer-quality weakness to the confidence reasons** when peer quality is medium or weak
3. **Increase Samsung conglomerate penalty** from 0.35 to 0.45 (only ~60% of OP is memory)
4. **Cap relative valuation confidence at 0.65** when all multiples are curated (not pipeline-derived)

Expected impact:
- Relative valuation confidence drops from ~0.88 to ~0.55-0.65
- Relative method effective weight decreases
- DCF and self-history gain proportionally more influence
- Overall confidence reasons include peer-quality caveat

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `PEER-CAL-001` | Relative confidence < 0.70 for curated-only peers | Confidence capped or penalized |
| `PEER-CAL-002` | Peer-quality appears in confidence reasons | At least one reason mentions peer limitations |
| `PEER-CAL-003` | Samsung penalty ≥ 0.45 | Conglomerate penalty increased |

## Fix 4: Deterministic key risks (from dashboard review)

### Problem
The `keyRisks` field in structured insights is empty because it only pulls from QA validation issues, which are empty when all QA checks pass.

### Specification
See `14-key-risks-specification.md` for the full spec. Summary:
- Derive risks deterministically from cycle state, valuation context, balance sheet, industry
- At least 2 risks for any cyclical company at peak
- Each risk must cite specific data points
- Maximum 7 risks, ordered by severity

### Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `RISK-001` | At least 2 risks for MU at peak | Key risks populated |
| `RISK-002` | Risks cite data | Each risk references specific metrics |
| `RISK-003` | No LLM-generated risks | All risks from deterministic code |

## Fix 5: Spec consistency — always-publish rule

### Problem
The earlier facts-first spec (`stock-valuation-spec/06-publish-gate-semantics.md`) still says valuation should be withheld when prerequisites fail. The newer verdict spec says always publish with confidence rating. These need to be reconciled so the RALPH loop doesn't oscillate between two product contracts.

### Specification
Update the rl-prompt and coding assistant prompt to make clear:
- The facts-first spec governs **facts publication** (unchanged)
- The verdict spec governs **valuation publication** (the new layer)
- The value gate's hard blocks are: <2 valid methods or non-positive midpoint
- Everything else (range width, disagreement, confidence) is informational, communicated via confidence rating

## Priority order for next RALPH loop

1. **Report-gate consistency assertion** (RENDER-001..003) — blocks everything
2. **Remove reverse DCF from midpoint** (RDCF-001..005) — biggest valuation quality improvement
3. **Recalibrate peer confidence** (PEER-CAL-001..003) — improves trustworthiness
4. **Deterministic key risks** (RISK-001..003) — fills empty dashboard section
5. **Spec consistency** — reconcile always-publish rule across docs
