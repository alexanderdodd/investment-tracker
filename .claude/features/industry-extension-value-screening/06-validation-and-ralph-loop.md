# 06. Validation and Ralph loop

## Core question

> Can the system safely turn a sector-level interest signal into an industry-level shortlist of credible value candidates?

This feature adds a second funnel on top of the stock valuation system:
- sector -> industry -> screen -> candidate -> stock valuation

That means the Ralph loop must validate both:
1. **screening correctness**
2. **candidate publication safety**

---

## Ralph loop scope for this feature

The loop must answer:

1. Are industry memberships and medians correct?
2. Are deterministic screen outputs reproducible?
3. Are candidate states assigned correctly?
4. Are only eligible stocks published as value candidates?
5. Does the UI surface only what the gates allow?

---

## New validation groups

### Group T — Taxonomy integrity
| Rule ID | Check | Severity |
|---|---|---|
| `TAX-001` | sector resolves to valid GICS sector | High |
| `TAX-002` | industry resolves to valid GICS industry | High |
| `TAX-003` | every stock on industry page belongs to that industry or approved sub-industry mapping | High |
| `TAX-004` | sector-to-industry counts are stable for the same snapshot | Medium |
| `TAX-005` | no stock shown in multiple incompatible industries | High |

### Group U — Deterministic screen integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SCR-001` | same snapshot produces same universe after Stage A | High |
| `SCR-002` | same snapshot produces same cheapness pass/fail results | High |
| `SCR-003` | same snapshot produces same quality pass/fail results | High |
| `SCR-004` | medians and percentiles are reproducible and traceable | High |
| `SCR-005` | framework-specific metric set matches industry framework | High |

### Group V — Candidate publication integrity
| Rule ID | Check | Severity |
|---|---|---|
| `CAND-001` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` without valid stock valuation artifact | High |
| `CAND-002` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` without peer analysis artifact | High |
| `CAND-003` | stock cannot be `PUBLISHED_VALUE_CANDIDATE` when trap-risk blocker is active | High |
| `CAND-004` | `SCREEN_PASS` and `NEEDS_DEEP_WORK` labels are assigned deterministically | High |
| `CAND-005` | if valuation confidence < threshold, candidate is demoted from published state | High |

### Group W — Surface and explanation integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SURF-IND-001` | UI only shows allowed candidate fields for each state | High |
| `SURF-IND-002` | no "cheap" claim appears for excluded trap-risk rows | High |
| `SURF-IND-003` | all surfaced numeric claims match facts or traces | High |
| `SURF-IND-004` | explanation text cannot override deterministic state | High |

### Group X — Benchmark packs
This feature requires benchmark packs, not just generic rules.

#### Benchmark pack: MU
Expected:
- sector = Information Technology
- industry = Semiconductors
- memory-specific framework used
- direct peers / peer pack reflect memory context
- MU should **not** appear as a published value candidate when current valuation label is expensive / confidence low

#### Benchmark pack: KO
Expected:
- sector = Consumer Staples
- industry = Beverages
- beverage framework used
- peers should include PEP and KDP in primary or secondary roles
- KO should not be compared primarily to unrelated staples categories

#### Benchmark pack: ALL
Expected:
- sector = Financials
- industry = Insurance
- insurance framework uses P/B and ROE-style logic, not EV/EBITDA as primary
- peers should include PGR / TRV / HIG / CB / CINF-type analogs

#### Benchmark pack: META
Expected:
- sector = Communication Services
- industry = Interactive Media & Services
- platform/media framework used
- candidate logic should not compare META primarily to casinos, insurers, or unrelated software names

---

## Negative controls

At least these must be present:

1. wrong GICS mapping
2. stale market-data snapshot
3. empty industry universe
4. industry median built from mixed frameworks
5. stock marked candidate without valuation artifact
6. trap-risk stock incorrectly surfaced as candidate
7. peer pack missing but candidate published
8. surface leak: UI text says "undervalued" for excluded stock

All must fail safely.

---

## Artifact requirements per iteration

Each iteration must emit:
- `run-manifest.json`
- `taxonomy-manifest.json`
- `industry-universe.json`
- `screen-results.json`
- `candidate-publication-audit.json`
- `industry-median-traces.json`
- `surface-scan.json`
- `evaluation-scorecard.md`
- `iteration-changes.md`
- `generated-report.md` or relevant rendered page artifacts

---

## Gates

### Screening gate
Determines if industry screen can publish.
Fails if:
- taxonomy fails
- market data stale
- medians not traceable
- framework not resolved

### Candidate gate
Determines if a stock can appear as a published value candidate.
Fails if:
- no stock valuation artifact
- no peer artifact
- confidence too low
- trap blocker active
- explanation contradicts deterministic result

---

## Success threshold for this milestone

The feature is "good enough to rely on" when:
- deterministic screen reproducibility is stable
- benchmark packs pass
- no candidate publication leaks occur
- value-trap exclusions are working
- surfaced candidate lists are short, explainable, and grounded

It does **not** need perfect stock-picking accuracy.
It does need **safe candidate publication**.
