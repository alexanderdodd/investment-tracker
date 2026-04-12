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
