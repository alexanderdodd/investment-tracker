# Stock Valuation Workflow Spec Bundle

This bundle contains the production-grade specification for a filing-first stock valuation workflow, a Ralph loop for iterative self-improvement, a golden Micron (MU) baseline report, and an implementation prompt for a coding agent.

## Files

- `01-executive-summary.md`
- `02-golden-micron-valuation-report.md`
- `03-root-cause-diagnosis.md`
- `04-ralph-loop-specification.md`
- `05-deterministic-validation-framework.md`
- `06-publish-gate-semantics.md`
- `07-implementation-guidance-for-workflow-and-llm-usage.md`
- `08-prompt-for-coding-assistant.md`
- `09-acceptance-criteria-definition-of-done.md`
- `10-source-references.md`
- `stock-valuation-ralph-loop-spec-complete.md`

## Intended use

1. Treat `stock-valuation-ralph-loop-spec-complete.md` as the canonical human-readable master document.
2. Treat `02-golden-micron-valuation-report.md` as the frozen baseline artifact for Micron regression testing.
3. Treat `04-ralph-loop-specification.md`, `05-deterministic-validation-framework.md`, and `06-publish-gate-semantics.md` as the implementation contract.
4. Give `08-prompt-for-coding-assistant.md` directly to the coding agent.
5. Wire Micron into CI as a permanent golden fixture before enabling any publishable valuation verdicts.

## Safety posture

- Filing-first
- Deterministic facts before narrative
- No verdict on broken facts
- Explicit provenance
- Reconciliation-first publish gate
- Prefer withholding over false precision

## Snapshot note

The golden Micron artifact in this bundle is a **frozen baseline snapshot** intended for workflow validation. It is not a live recommendation. The live pipeline must regenerate facts from the latest authoritative sources at execution time.
