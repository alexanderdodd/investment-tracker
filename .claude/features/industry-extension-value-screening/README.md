# Industry Extension + Value Candidate Screening Spec Bundle

This bundle defines how to extend the current sector-first app into a sector + industry research and value-candidate workflow.

## What this feature adds

- Industry information and analysis inside each sector
- Deterministic industry-level screening for value candidates
- Deep-work handoff from screening to stock valuation / peer analysis
- Validation, publish gates, and Ralph-loop rules for safe candidate publication
- Dark-theme design mockups aligned to the current app

## Intended use

1. Treat `industry-extension-value-screening-spec-complete.md` as the master spec.
2. Treat `02-prd.md` as the product requirements source of truth.
3. Treat `06-validation-and-ralph-loop.md` as the implementation and quality contract.
4. Treat `09-ralph-loop-prompt.md` and `10-coding-assistant-prompt.md` as operational prompts for the agent.
5. Use the design PNGs as visual targets for the next UI iteration.

## Key product principle

A stock should **not** appear as a published "value candidate" merely because it screened cheap on sector/industry metrics.
It must either:
- pass deterministic screening and be clearly labeled as `SCREEN_PASS / NEEDS_DEEP_WORK`, or
- have a valid stock valuation artifact and peer-analysis artifact, and then be labeled as `PUBLISHED_VALUE_CANDIDATE`.

## Bundle contents

- `01-executive-summary.md`
- `02-prd.md`
- `03-information-architecture.md`
- `04-data-model-and-pipeline.md`
- `05-screening-and-analysis-framework.md`
- `06-validation-and-ralph-loop.md`
- `07-ui-ux-spec.md`
- `08-implementation-plan.md`
- `09-ralph-loop-prompt.md`
- `10-coding-assistant-prompt.md`
- `11-source-references.md`
- `industry-extension-value-screening-spec-complete.md`
- `design-01-sector-overview-with-industries.png`
- `design-02-sector-detail-industries-tab.png`
- `design-03-industry-detail-value-screen.png`
- `design-04-industry-candidate-detail.png`
