# Stock Valuation Workflow Spec Bundle — vNext

This bundle is the updated production-grade specification for the filing-first stock valuation workflow and the RALPH loop.

It incorporates the latest improvement ideas and validation requirements discovered from the most recent Micron (MU) Ralph loop assessment:

- deterministic facts are now the only allowed source of core financial truth
- the publish gate must withhold valuation verdicts when valuation prerequisites fail
- **report-surface integrity** is now a first-class requirement
- **formula traces** are required for any surfaced non-primitive metric
- **dependency-aware suppression** is required whenever an upstream validator fails
- **negative controls** (intentionally broken fixtures) are mandatory
- **dual artifact persistence** is required:
  - Postgres remains the authoritative runtime artifact store
  - file-based iteration reports remain mandatory for review and audit

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
- `rl-prompt.md`
- `stock-valuation-ralph-loop-spec-vnext-complete.md`

## Intended use

1. Treat `stock-valuation-ralph-loop-spec-vnext-complete.md` as the canonical human-readable master document.
2. Treat `02-golden-micron-valuation-report.md` as the frozen baseline artifact for Micron regression testing.
3. Treat `04-ralph-loop-specification.md`, `05-deterministic-validation-framework.md`, and `06-publish-gate-semantics.md` as the hard implementation contract.
4. Give `08-prompt-for-coding-assistant.md` directly to the coding agent.
5. Give `rl-prompt.md` directly to the Ralph loop execution agent.
6. Wire Micron into CI as a permanent golden fixture before enabling any publishable valuation verdicts.

## New safety posture in vNext

- Filing-first
- Statement-table-first TTM builder
- Deterministic facts before narrative
- No verdict on broken facts
- Explicit provenance and formula traceability
- Reconciliation-first publish gate
- Report-surface suppression when dependencies fail
- Mandatory negative-control fixtures
- Prefer withholding over false precision

## Snapshot note

The golden Micron artifact in this bundle is a **frozen baseline snapshot** intended for workflow validation. It is not a live recommendation. The live pipeline must rediscover the latest authoritative sources at execution time.
