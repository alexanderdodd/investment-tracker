# 02. PRD

## Product name

**Industry Extension + Value Candidate Screening**

## Problem statement

The app currently gives users strong sector-level context, but it does not yet help them move from:

> "This sector looks interesting"

to:

> "These are the industries worth hunting in, and these are the stocks that deserve deeper valuation work."

Without an industry layer, users are forced to compare stocks across businesses with very different economics, capital intensity, regulation, and peer groups.

## Users

### Primary user
A self-directed investor who:
- understands sectors and basic stock metrics,
- wants help finding value opportunities,
- does not want to manually sift through thousands of stocks,
- wants structured, explainable narrowing from market -> sector -> industry -> stock.

### Secondary user
A more advanced investor who:
- wants a repeatable screening workflow,
- wants clear deterministic rules before any LLM-driven narrative,
- wants to audit why a stock was surfaced or excluded.

## Jobs to be done

1. **When I am exploring a sector, help me see which industries within it are attractive or unattractive.**
2. **When I open an industry, help me quickly screen for cheap-but-possibly-good stocks.**
3. **When a stock is surfaced, show whether it is simply statistically cheap or a stronger value candidate.**
4. **When a stock is excluded, tell me whether that is because of leverage, margin collapse, dilution, weak cash conversion, or another trap signal.**
5. **When I revisit an industry later, help me see what changed.**

## Goals

### Product goals
- Add industries to each sector page in a way that feels native to the current UI.
- Launch a deterministic value screen from the industry page.
- Produce a shortlist that is explainable and ranked.
- Keep deep company analysis separate from screen-only results.
- Avoid publishing "value" claims when only shallow screening evidence exists.

### Quality goals
- Deterministic inputs and formulas wherever possible.
- LLM only for explanation, clustering, and deep-work synthesis.
- Explicit candidate publication rules.
- Ralph-loop validation for taxonomy, screening math, candidate states, and surface integrity.

## Non-goals
- Fully automated buy/sell advice from the industry page.
- Portfolio optimization.
- Predicting market timing.
- Replacing the stock valuation feature.
- Supporting every global exchange in the first release.

## Success metrics

### Product metrics
- % of sector page visits that open an industry detail page
- % of industry page visits that run the value screen
- % of screen results clicked into stock detail / valuation pages
- time-to-shortlist for a user session

### Quality metrics
- deterministic run reproducibility for same snapshot
- candidate false-positive rate from benchmark review
- candidate false-negative rate on benchmark fixtures
- percentage of surfaced candidate rows with complete evidence and peer-pack context
- zero publish-gate violations

## Functional requirements

### FR-1 Sector page includes industries
- Each sector page must show its industries.
- Each industry must show:
  - name
  - relative size / exposure
  - valuation status
  - revisions / fundamentals signal
  - candidate count
  - risk flag count
  - click-through to industry page

### FR-2 Industry page includes value screen
- User can run a deterministic value screen from the industry page.
- Screen results must be rankable and filterable.

### FR-3 Screen result states
Each stock result must be labeled as one of:
- `SCREEN_PASS`
- `NEEDS_DEEP_WORK`
- `PUBLISHED_VALUE_CANDIDATE`
- `WATCHLIST_ONLY`
- `EXCLUDED_VALUE_TRAP_RISK`

### FR-4 Stock detail integration
- A stock opened from the industry screen must show:
  - why it surfaced
  - which filters it passed
  - where it sits vs industry medians / history
  - whether it already has a valid stock valuation artifact

### FR-5 Auditability
- Every screen result must preserve:
  - input snapshot time
  - source provenance
  - thresholds used
  - benchmark / framework used
  - peer-pack status
