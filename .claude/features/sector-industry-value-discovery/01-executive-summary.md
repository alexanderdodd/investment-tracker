# Executive summary

This specification extends the current app from sector cards and sector detail pages into a full **sector -> industry -> stock value discovery system**.

The feature adds three layers:

1. **Industry layer inside each sector**
   - every sector page gets a ranked list of industries and sub-industries
   - each industry has performance, valuation, quality, cyclicality, concentration, and candidate counts
   - industries are analyzed as the proper comparison unit for stock selection

2. **Value stock candidate engine**
   - the app generates candidate stocks within attractive industries
   - each candidate must be backed by a stock-level valuation run and a validated peer set
   - candidates are classified as:
     - validated value candidate
     - possible value candidate (needs more work)
     - likely value trap
     - not attractive

3. **Ralph-loop evaluation**
   - the loop validates not just core facts, but also:
     - GICS mappings
     - industry coverage
     - industry scores
     - peer registry quality
     - candidate scoring
     - stock-level valuation availability
     - UI surface integrity

## Core product rule

A sector can be expensive while one industry inside it is attractive.
An industry can be attractive while most stocks inside it are still poor value.
A stock can only be surfaced as a true value candidate if its own valuation report passes its publish gate.

## Why this matters

Your current UI already does a good job of:
- sector performance
- sector narrative
- sector concentration
- holdings inspection
- stock-level valuation views

What is missing is the **middle layer**:
- how to reason from sector to industry
- how to identify where value may exist inside a sector
- how to translate that into validated stock candidates

This spec fills that gap.

## Scope for the first implementation

### In scope
- sector pages gain industry analysis
- new industry detail page
- deterministic industry attractiveness scoring
- deterministic candidate generation
- candidate cards linked to stock valuation artifacts
- Ralph-loop quality thresholds for publish-safe value candidate lists

### Out of scope
- full market-wide coverage on day 1
- non-U.S. listings as first-class support
- fully automated buy/sell recommendations
- portfolio optimization or trade execution

## Recommended implementation milestone sequence

### Milestone 1
Add industries to sectors and publish industry-level analytics.

### Milestone 2
Generate “potential value stocks” inside attractive industries.

### Milestone 3
Require every surfaced candidate to have:
- validated peer pack
- stock valuation artifact
- publishable cheap/fair/expensive label
- confidence explanation

### Milestone 4
Add stock action guidance only after valuation and peer layers are stable.
