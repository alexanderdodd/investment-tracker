# Product goals and scope

## User problem

The current app helps users understand sectors, but it does not yet answer the crucial next questions:

- Which industries inside this sector are actually attractive?
- Where might value exist inside those industries?
- Which specific stocks are cheap versus their own history and their true peers?
- Which stocks are merely optically cheap but probably traps?

## Primary product goals

### Goal 1 — Make sector analysis more actionable
Users should be able to move from:
- “Technology looks expensive”
to:
- “Software is mixed, Semiconductors are stretched, but IT Services may contain a few value pockets.”

### Goal 2 — Use industry as the real comparison unit
Sector is too broad for valuation.
The app should compare businesses within:
- the same industry
- ideally the same sub-industry
- with similar capital intensity, margins, and business model

### Goal 3 — Surface value candidates with evidence
A value candidate should not be just a watchlist item.
It must be backed by:
- sector context
- industry context
- peer context
- stock-level valuation artifact
- confidence reasons

### Goal 4 — Avoid false positives
The app must avoid:
- labeling pre-profit momentum names as “value” based on weak heuristics
- mixing bad peers
- surfacing candidates when stock-level valuation is missing or withheld
- using sector cheapness as a proxy for stock cheapness

## Target user

A self-directed investor who:
- understands sectors, markets, and broad stock concepts
- is not deeply trained in professional valuation workflows
- wants structured support, not just a screener
- wants to understand “why this may be attractive”

## User jobs to be done

### Sector mode
- See which sectors are attractive or stretched
- Understand what is driving each sector

### Industry mode
- See which industries inside a sector are attractive
- Understand whether that attractiveness is valuation, momentum, quality, or macro driven

### Candidate mode
- See which stocks inside the attractive industries are plausible value candidates
- Understand whether they are validated or still speculative

### Stock mode
- Open a stock page and see:
  - industry
  - peers
  - valuation label
  - confidence
  - risks and why the stock may be cheap

## Non-goals for this phase

- direct trade recommendations
- target allocation construction
- tax optimization
- options strategies
- portfolio-level buy/sell automation

## Release principle

This feature is successful when a user can say:

> “I can go from sector view to industry view to a small list of genuinely plausible value candidates, and I understand why they are there.”

It is not necessary in the first phase that every candidate be perfect.
It is necessary that obviously bad candidates are filtered out and confidence is honest.
