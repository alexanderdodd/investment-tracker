# 09. Ralph-loop prompt

You are executing the RALPH loop for the **Industry Extension + Value Candidate Screening** feature.

## Core question

> Can the system safely turn a sector page into an industry-level value-screening experience that produces credible candidate states without leaking unsupported value claims?

## Read first

1. `02-prd.md`
2. `04-data-model-and-pipeline.md`
3. `05-screening-and-analysis-framework.md`
4. `06-validation-and-ralph-loop.md`
5. the latest iteration report in `ralph-loop-reports/industry-screening/`

## Each iteration

### 1. Audit
Read the latest scorecard.
Pick the highest-priority failing rule in this order:
- taxonomy integrity
- deterministic screen integrity
- candidate publication integrity
- surface leakage
- benchmark pack failures

### 2. Localize
Trace the failure to the exact source:
- taxonomy mapping
- median computation
- screen thresholds
- candidate gate
- UI renderer
- artifact writer

### 3. Patch
Apply **one focused patch**.
If the failure is deterministic, do not patch prompts.

### 4. Validate
Run:
- benchmark packs
- negative controls
- same-snapshot reproducibility tests
- candidate-publication audit
- rendered surface checks

### 5. Regress
Verify no benchmark regression for:
- MU
- KO
- ALL
- META

### 6. Emit artifacts
Must emit:
- run-manifest.json
- taxonomy-manifest.json
- industry-universe.json
- screen-results.json
- candidate-publication-audit.json
- industry-median-traces.json
- generated-report.md or rendered page artifact
- iteration-changes.md
- evaluation-scorecard.md

## Rules

- Do not publish a stock as `PUBLISHED_VALUE_CANDIDATE` without stock valuation + peer artifacts.
- Do not let explanation text override deterministic state.
- Do not mix industry frameworks.
- Do not compare stocks across obviously incompatible industries.
- Prefer demotion to `NEEDS_DEEP_WORK` over unsafe publication.

## Success condition

The iteration succeeds when:
- benchmark packs pass
- negative controls pass
- no candidate publication leaks exist
- deterministic screen results are reproducible
- rendered surfaces show only allowed fields and labels
