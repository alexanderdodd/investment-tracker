# Sector + Industry Value Discovery Spec Bundle

This bundle defines how to extend the app from sector-only analysis to:

- sector -> industry -> stock navigation using GICS
- industry-level analytics within each sector
- industry heatmaps and value-hunting workflows
- deterministic candidate generation for potential value stocks
- candidate validation using peer evaluation + stock valuation runs
- Ralph-loop quality gates for industry and candidate outputs
- UI designs for the new pages

## Recommended reading order

1. `01-executive-summary.md`
2. `02-product-goals-and-scope.md`
3. `03-information-architecture.md`
4. `04-data-model-and-taxonomy.md`
5. `05-sector-and-industry-analysis-framework.md`
6. `06-value-stock-candidate-methodology.md`
7. `07-ui-ux-specification.md`
8. `08-validation-and-ralph-loop.md`
9. `09-implementation-plan.md`
10. `10-prompt-for-coding-assistant.md`

## Design assets

- `design-01-sector-overview-with-industries.png`
- `design-02-sector-detail-industry-tab.png`
- `design-03-industry-detail-value-candidates.png`
- `design-04-stock-valuation-peer-panel.png`

## Product principle

Sector is the discovery layer.
Industry is the comparison layer.
Stock valuation is the decision layer.

The app should never label a stock a value candidate based on sector context alone.
A stock can only be surfaced as a value candidate if it passes:
1. sector / industry attractiveness checks
2. peer-quality checks
3. stock-level valuation publishability checks
4. explanation-surface checks

## Safety posture

- GICS-first taxonomy
- deterministic data and scoring first
- LLM explanations second
- no “potential value stock” label without a validated stock valuation artifact
- prefer “interesting but not validated” over false precision
