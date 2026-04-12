# Peer Registry Creation Feature

Automated peer discovery and registry creation for any ticker, replacing the current static hardcoded MU-only peer registry.

## Problem

The current peer registry (`src/lib/valuation/peer-registry.ts`) is a static lookup table with hand-curated peer data only for MU. Every other ticker gets `null` from `getPeerRegistry()`, which means:

- No relative valuation method contributes to fair value
- Valuation confidence is penalized for missing peers
- The "Peer Comparison" card on the dashboard says "based on competitors identified in the company's 10-K filing" but doesn't actually do anything

## Goal

Dynamically build a peer registry for any US-listed ticker during the valuation pipeline, using deterministic data sources (SEC EDGAR SIC codes, market data, and our own pipeline DB).

## Files

- `01-architecture.md` — System design and data flow
- `02-peer-discovery-strategy.md` — How peers are found and ranked
- `03-peer-multiples-sourcing.md` — How peer financial data is obtained
- `04-quality-scoring.md` — How peer quality and confidence are assessed
- `05-validation-framework.md` — Validation rules and acceptance criteria
- `rl-prompt.md` — RALPH loop execution prompt
