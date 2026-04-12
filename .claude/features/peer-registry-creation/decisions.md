# Decisions and Open Questions — Peer Registry Creation

This document tracks architectural decisions made and open questions for expert review.

---

## DECISION-001: Self-compute peer multiples from EDGAR (not Yahoo API)

**Status:** Decided — implementing  
**Date:** 2026-04-12

### Problem
Yahoo Finance's `quoteSummary` API now requires authentication (crumb), causing all peer multiples (P/E, P/B, EV/EBITDA) to return null. Discovered peers have names and prices but no valuation data.

### Options considered
1. **Financial Modeling Prep API** — freemium, has P/E/P/B. Adds external dependency.
2. **Alpha Vantage** — free tier, rate-limited. Limited coverage.
3. **Self-compute from EDGAR** — run a lightweight `buildCanonicalFacts` for each peer to extract TTM EPS, book value, revenue from SEC filings. Compute P/E = price / EPS, P/B = price / BVPS.
4. **Yahoo with auth** — would require session management, fragile.

### Decision
**Option 3: Self-compute from EDGAR.** This is the most deterministic approach, uses infrastructure we already have, and doesn't add external API dependencies. The 5-10 second cost per peer is acceptable.

### Implementation
- Run a lightweight version of `buildCanonicalFacts` for each discovered peer
- Extract: TTM EPS, book value per share, TTM revenue, total debt, cash
- Compute: P/E, P/B, EV/EBITDA, EV/Revenue from these + current price
- Current price still comes from Yahoo chart API (which works without auth)

### Risk
- SEC rate limiting: 10 requests/sec. 8 peers × ~3 requests each = ~2.4 seconds minimum
- Some peers may not have clean XBRL data
- Adds latency to the pipeline

---

## DECISION-002: Self-history metrics vary by sector

**Status:** Decided — implementing, pending expert review  
**Date:** 2026-04-12

### Problem
The self-history valuation module requires gross margin and operating margin data, which is unavailable for insurance companies (they use premiums, combined ratio, losses incurred). This means self-history produces null for ~30% of sectors.

### Decision
Use sector-appropriate metrics for self-history valuation:

| Sector | Primary metric | Secondary metric |
|--------|---------------|-----------------|
| General / Manufacturing | Gross margin | Operating margin |
| Insurance | ROE (net income / equity) | Book value growth |
| Banks / Financials | ROE | Net interest margin (if available) |
| REITs | FFO/AFFO yield | NAV growth |
| Oil & Gas | Operating margin | Revenue per unit |
| Utilities | Operating margin | Rate base growth |

For insurance specifically:
- Use `netIncome / totalEquity` (ROE) instead of gross/operating margin
- Both values are available in standard XBRL
- Apply a mid-cycle ROE × P/B multiple approach instead of EV/EBIT

### Expert review needed
- Are these the right metrics per sector?
- Should the mid-cycle multiples (e.g., 12-18x EV/EBIT for semiconductors) be different for insurance (e.g., 1.0-2.0x P/B)?
- Should we use combined ratio data if available in XBRL?

---

## OPEN-001: Insurance-specific valuation metrics

**Status:** Open — needs expert input  
**Date:** 2026-04-12

### Question
For insurance companies like Allstate, should we use industry-specific valuation approaches beyond standard P/E and EV/EBITDA?

### Options
1. **P/B with ROE adjustment (justified P/B)** — most common for insurers. Fair P/B = ROE / cost of equity.
2. **Combined ratio comparison** — underwriting profitability benchmark. Available in some XBRL filings.
3. **Price-to-tangible-book** — excludes goodwill/intangibles, more relevant for insurance.
4. **Earnings power value** — normalized underwriting profit + investment income.

### Current state
We use the same valuation framework for all sectors. Insurance companies get penalized because:
- No gross margin in XBRL → self-history fails
- Peer multiples are generic (P/E, P/B) not industry-specific
- DCF normalization uses operating margin which may not be the right metric for insurance

### Expert input requested
- Which approach(es) should we implement for insurance?
- Should the industry framework (`selectFramework`) return different valuation methods for insurance?
- What mid-cycle multiples are appropriate for P&C insurance?

---

## OPEN-002: Peer multiples data freshness and caching

**Status:** Open — needs decision  
**Date:** 2026-04-12

### Question
When we self-compute peer multiples from EDGAR, how should we handle caching?

### Options
1. **Cache in DB** — store peer canonical facts alongside subject valuation. Reuse if <30 days old.
2. **In-memory cache** — faster but lost on restart. Good for same-session re-runs.
3. **No cache** — always fresh but slow (5-10 sec per peer × 8 peers = 40-80 sec).

### Leaning toward
Option 1 (DB cache with 30-day TTL). Peer fundamentals don't change faster than quarterly filings.

---

## DECISION-003: Business-model-aware peer selection (beyond SIC codes)

**Status:** Decided in principle — needs implementation  
**Date:** 2026-04-12

### Problem
SIC codes classify what a company *makes*, not how it *makes money*. This produces poor peers for platform/ecosystem companies:
- Apple (SIC 3571 "Electronic Computers") gets matched with Dell, HP, Lenovo — commodity hardware companies with 20-25% gross margins
- Apple's actual comparables are Microsoft, Google, Samsung — platform companies with 40-50%+ gross margins and services revenue
- The resulting peer multiples ($54/share for Apple) are wildly wrong because hardware companies trade at 10-15x P/E while Apple trades at 30x+

### Methodology for better peer selection
The reasoning that identified this problem used several signals that SIC codes miss:

1. **Gross margin similarity** — the single strongest signal. Companies with similar gross margins tend to have similar business models. Apple (45% GM) should be compared to Microsoft (70% GM) and Google (57% GM), not Dell (22% GM).

2. **Revenue model** — subscription/services vs one-time hardware vs advertising. Companies with recurring revenue trade at higher multiples.

3. **Market cap tier** — mega-caps ($500B+) trade differently from mid-caps. Peer comparisons across tiers are misleading.

4. **Growth profile** — a 5% grower and a 25% grower in the same SIC code are not comparable.

### Decision
Implement a **multi-signal peer scoring** system that augments SIC codes:

```
peerScore = 0.25 × sicMatch
          + 0.30 × grossMarginSimilarity
          + 0.20 × marketCapProximity
          + 0.15 × revenueGrowthSimilarity
          + 0.10 × sectorOverlap
```

This means:
- SIC still matters (25%) but is no longer dominant
- Gross margin similarity is the strongest signal (30%)
- A company with the "wrong" SIC but similar margins and growth ranks higher than one with the "right" SIC but very different financials

### Implementation approach
After discovering SIC candidates, score each peer using the subject's canonical facts:
- Subject gross margin: compare to peer's gross margin (from EDGAR)
- Subject market cap: compare to peer's market cap
- Subject revenue growth: compare to peer's revenue growth
- Filter out peers with gross margin difference > 20 percentage points

### Expert review needed
- Is gross margin the right primary signal, or should operating margin be used?
- Should we have a hard floor on margin similarity (e.g., exclude peers with >20pp margin difference)?
- For companies like Apple that straddle hardware and services, should the system detect "dual-model" companies and weight accordingly?
- Should the curated override system be used more aggressively for mega-caps where SIC is known to be misleading?

---

## DECISION-004: Midpoint-anchored range with outlier dampening (target ≤30% width)

**Status:** Decided — implemented  
**Date:** 2026-04-12

### Problem
The fair value synthesis used an outer-envelope approach: `low = min(all method lows) × 0.95`, `high = max(all method highs) × 1.05`. When methods disagreed significantly (e.g., DCF $528 vs Peer $4447 for Allstate), the range was $263–$4669 — a 230% width that is useless for investment decisions.

The spec (09-validation-framework) already said to withhold value when width > 40%, but the code only applied a -0.15 confidence penalty.

### Options considered
1. **Just enforce the withhold rule** — easy but means most stocks get no value (most have some method disagreement)
2. **Trim outlier methods entirely** — removes data, reduces to effectively single-method
3. **Midpoint-anchored range with outlier dampening** — keep all methods but reduce outlier influence exponentially, derive range from dispersion around midpoint

### Decision
**Option 3: Three-layer fix.**

**Layer 1 — Outlier dampening:** Before computing the weighted midpoint, methods that deviate >50% from a preliminary consensus get exponentially dampened weights. A method at 8× the consensus has its weight reduced to <1%. This prevents a single divergent method from dominating.

**Layer 2 — Midpoint-anchored range:** Instead of min/max across all bounds, compute the weighted standard deviation (σ) of method values around the midpoint. The half-width is `max(σ, dcfSensitivitySpread)`. DCF sensitivity spread is capped at 30% of midpoint to prevent unrealistic grid corners from widening the range.

**Layer 3 — Hard cap at 30%:** If the range still exceeds 30% of midpoint after dampening and σ computation, clamp to ±15% of midpoint. Set `rangeClamped = true` for transparency.

### Impact
- MU (before): $35.97–$260.63 (226% width) → MU (after): $79.42–$107.45 (30% width)
- Allstate (before): $263–$4669 (230% width) → now capped at ≤30%
- Agreeing methods (e.g., DCF $100, Peer $105, Self $98) → ~28% width, no clamping needed
- Single method (DCF only) → uses sensitivity grid spread, ~28% width

### Traceability
New fields in `FairValueSynthesis`:
- `rangeClamped: boolean` — whether the 30% cap was applied
- `rawRangeWidth: number` — pre-clamping width for audit
- `preDampeningMethods[]` — original values and weights before dampening

### Tests
6 new tests (RANGE-001 through RANGE-006) in `fair-value-consistency-test.ts`:
- RANGE-001: 8× disagreement → width ≤30%
- RANGE-002: outlier peer gets lower weight than DCF
- RANGE-003: pre-dampening audit trail recorded
- RANGE-004: rangeClamped flag set on extreme disagreement
- RANGE-005: agreeing methods → tight range, no clamping
- RANGE-006: single method → reasonable range from sensitivity grid

---

## DECISION-005: Industry-aware multiple filtering in peer valuation

**Status:** Decided — implementing  
**Date:** 2026-04-12

### Problem
EV-based multiples (EV/EBITDA, EV/Revenue) are structurally wrong for insurance companies, banks, and REITs. The system applies them anyway because the industry framework selection is not enforced in the peer registry code.

For Allstate (insurance), peer comparison produces $4,447/share (vs DCF $528, self-history $396) because:
- Insurance "liabilities" are policyholder reserves, not financial debt
- `impliedEquity = impliedEV - totalDebt + cash` subtracts only financial debt
- Thin underwriting margin × peer EV/EBITDA × (not subtracting reserves) = massively inflated equity

### Decision
Pass `IndustryFramework.allowedPeerMultiples` through to peer valuation functions. Each framework type specifies which multiples are valid:

- **Financial** (banks, insurance): P/E, P/B only — EV is meaningless when liabilities are policyholder obligations
- **REIT**: P/B, EV/EBITDA — revenue multiples not primary for REITs
- **Growth tech**: EV/Revenue, P/B — many have negative EBITDA
- **Semiconductor/general**: all multiples allowed

The framework already exists and is selected correctly. The gap is that `computeRelativeValuationFromDynamic` and `computeRelativeValuation` don't receive or use it.

### Expected impact
Allstate peer comparison: $4,447 → ~$200-400 (P/E and P/B only). Method disagreement drops from 226% to <50%.

### Full spec
See `19-method-agreement.md` Part A.

---

## DECISION-006: Dual raw/effective method disagreement with tiered thresholds

**Status:** Decided — implementing  
**Date:** 2026-04-12

### Problem
Method agreement is a single pre-dampening number. After we added outlier dampening (DECISION-004), the scorecard shows 226% disagreement even though the dampened midpoint is driven by two agreeing methods. The metric no longer represents the synthesis quality.

### Decision
Report **both** raw and effective disagreement:

- **Raw disagreement** = `(max - min) / avg` of pre-dampening values. Data quality signal — flags when a method has structural problems.
- **Effective disagreement** = weighted mean absolute deviation from midpoint, post-dampening. Synthesis quality signal — shows how reliable the midpoint is.

Display **effective** on the scorecard with tiers:
- ≤20%: strong (no penalty)
- 20-50%: moderate (-0.05)
- 50-100%: weak (-0.10)
- >100%: structural (-0.15)

When raw >> effective, show: "Outlier dampened — raw X%, effective Y%"

### Full spec
See `19-method-agreement.md` Part B.

---

## DECISION-007: Curated peer multiples — staleness-based penalty, not existence-based

**Status:** Decided — implemented  
**Date:** 2026-04-12

### Problem
Curated Bloomberg/Reuters consensus multiples were penalized with -0.15 confidence + 0.65 cap simply for being curated rather than pipeline-computed. This dragged MU's peer quality to "medium" and applied a -0.15 penalty in the overall confidence scorecard, even though the data is professional-grade and fresh.

### Decision
Replace the blanket curated penalty with a staleness check:
- **Fresh (<90 days)**: no penalty — professional consensus is reliable
- **Aging (90-180 days)**: -0.08 — data may be one quarter behind
- **Stale (>180 days)**: -0.15 — two+ quarters old, significant risk of outdated multiples

Remove the 0.65 confidence cap entirely. Curated data quality should be judged by age, not by whether it came from a curated registry.

### Impact
MU peer confidence: 0.65 → 0.87 (fresh Bloomberg data, no staleness penalty, only conglomerate quality penalties remain). Overall MU confidence: 50% (LOW) → 65% (MEDIUM).

---

## OPEN-003: Peer set size vs quality tradeoff

**Status:** Open — needs expert input  
**Date:** 2026-04-12

### Question
Currently we target 5-8 peers. For some sectors (e.g., memory semiconductors), there are very few true peers. For others (e.g., insurance), there are dozens.

### Options
1. **Fixed target: 5-8 peers** — current approach
2. **Quality-gated: top N peers above quality threshold 0.5** — fewer but better
3. **Sector-specific targets** — 3 for niche industries, 8 for broad ones

### Expert input requested
- Is it better to have 3 high-quality peers or 8 medium-quality peers?
- Should we weight the top 3 more heavily regardless of total count?
