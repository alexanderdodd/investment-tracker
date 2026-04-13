# Validation and Ralph-loop specification

## Core question

> Can the system safely publish industry-level value insights and validated stock candidates?

## Extension of current safety model

The current stock valuation workflow validates:
- facts
- valuation publishability
- report surface safety

This feature adds three new validation layers:
1. **taxonomy integrity**
2. **industry analysis integrity**
3. **candidate publication integrity**

## New Ralph loop scope

### Loop objectives
- ensure GICS mapping is stable and deterministic
- ensure industries are scored with the right framework
- ensure candidate stocks are backed by valid stock valuation artifacts
- ensure peer packs are good enough for the stock and the industry
- ensure the UI never shows unsupported candidate labels

## New validation groups

### Group I1 — Taxonomy integrity
| Rule ID | Check | Severity |
|---|---|---|
| `TAX-001` | every surfaced stock has sector + industry | High |
| `TAX-002` | every surfaced industry belongs to the shown sector | High |
| `TAX-003` | industry counts are deterministic | Medium |
| `TAX-004` | industry labels come from approved taxonomy source | High |
| `TAX-005` | no LLM-generated taxonomy fields | High |

### Group I2 — Industry analytics integrity
| Rule ID | Check | Severity |
|---|---|---|
| `IND-001` | every industry scorecard has deterministic source inputs | High |
| `IND-002` | industry valuation state has formula trace | High |
| `IND-003` | industry confidence bounded and explained | Medium |
| `IND-004` | candidate counts equal underlying validated stock counts | High |
| `IND-005` | industry state withheld if coverage too weak | High |

### Group I3 — Candidate generation integrity
| Rule ID | Check | Severity |
|---|---|---|
| `CAND-001` | every validated candidate has a stock valuation artifact | High |
| `CAND-002` | every validated candidate has valuation label != withheld | High |
| `CAND-003` | every validated candidate has peer quality >= medium | High |
| `CAND-004` | trap-risk high blocks validated status | High |
| `CAND-005` | stale stock valuations block candidate publication | High |
| `CAND-006` | possible-value candidates are labeled distinctly | Medium |

### Group I4 — Peer pack integrity
| Rule ID | Check | Severity |
|---|---|---|
| `PEER-IND-001` | every candidate stock has a peer pack appropriate to its industry framework | High |
| `PEER-IND-002` | peer roles (primary/secondary/excluded) match benchmark pack when available | High |
| `PEER-IND-003` | peer quality is deterministic | High |
| `PEER-IND-004` | at least one usable peer valuation snapshot exists for publishable candidate status | High |
| `PEER-IND-005` | weak peers reduce candidate confidence or force possible-value status | High |

### Group I5 — UI surface integrity
| Rule ID | Check | Severity |
|---|---|---|
| `SURF-IND-001` | no candidate shown as validated if valuation artifact withheld | High |
| `SURF-IND-002` | no “cheap” badge shown without valuation label | High |
| `SURF-IND-003` | industry state and candidate counts match backend payload | High |
| `SURF-IND-004` | sector card summaries match industry table aggregates | Medium |
| `SURF-IND-005` | candidate reasons rendered from allowlisted fields only | High |

## Ralph loop state additions

Add these benchmark suites:

### Benchmark suite A — sector / industry structure
Examples:
- Technology sector with correct industries
- Financials sector with correct industries
- Consumer Staples sector with correct industries

### Benchmark suite B — stock candidate packs
Examples:
- MU memory peers and candidate state
- KO beverage peers and candidate state
- ALL insurance peers and candidate state
- META interactive media peers and candidate state

### Benchmark suite C — negative controls
Examples:
- stock appears in wrong industry
- candidate shown without stock valuation artifact
- candidate shown with withheld valuation
- weak peer quality but “validated value” status
- industry shown as attractive with zero underlying support

## Candidate publish gate

A candidate stock can only be published as `validated_value` if:
- stock facts gate passed
- stock valuation gate passed
- stock valuation label == cheap
- stock valuation confidence >= 0.60
- peer quality >= medium
- trap risk < high
- valuation freshness within SLA

Else:
- downgrade to `possible_value`, `trap_risk`, or suppress entirely

## Industry publish gate

An industry can publish as `ATTRACTIVE_HUNTING_GROUND` only if:
- valuation state not withheld
- coverage above minimum stock count
- enough stocks inside the industry have usable valuation artifacts
- candidate set is not empty or industry valuation is compelling enough on its own
- confidence >= threshold

Else:
- downgrade to `MIXED` or `LOW_VISIBILITY`

## Stop conditions for Ralph loop

The feature is safe enough to ship when:
1. taxonomy integrity passes
2. industry integrity passes
3. candidate integrity passes
4. benchmark peer packs pass
5. UI surface tests pass
6. negative controls pass
7. no regression in existing stock valuation workflow
