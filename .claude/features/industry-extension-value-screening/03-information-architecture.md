# 03. Information architecture

## Navigation hierarchy

```text
Market
  └── Sectors
        └── Sector Detail
              ├── Overview
              ├── Learn
              ├── Position
              ├── Holdings
              └── Industries   ← NEW
                    └── Industry Detail
                          ├── Overview
                          ├── Value Screen   ← NEW
                          ├── Candidates     ← NEW
                          ├── Compare        ← NEW
                          └── Evidence
                                └── Stock Detail / Valuation
```

## New top-level objects

### Sector
The broad GICS level used for top-down market navigation.

### Industry
The narrower GICS level used for:
- comparability
- median valuation calculations
- screening medians and percentiles
- peer-pack expectations
- candidate publication

### Candidate
A stock surfaced by the industry screen.

Important: a `candidate` is not necessarily a published value call.

## Page roles

### Sector Overview
Purpose:
- broad sector direction
- where to hunt

### Sector Industries tab
Purpose:
- show which industries inside the sector look attractive / neutral / unattractive
- act as the launch point into industry pages

### Industry Detail
Purpose:
- explain what the industry is
- show composition, valuation, concentration, cycle state, and macro drivers

### Industry Value Screen
Purpose:
- apply the Stage A-E funnel to all stocks in the industry
- return a ranked list with deterministic reasons

### Industry Candidates
Purpose:
- show only the strongest screen passes and validated candidates
- split by confidence / publication state

### Stock Detail / Valuation
Purpose:
- connect industry context to stock valuation and peer analysis

## New tabs and entry points

### On the Sector page
Add tab:
- `Industries`

### On the Industry page
Add tabs:
- `Overview`
- `Value Screen`
- `Candidates`
- `Compare`
- `Evidence`

## Primary user flow

1. User opens **Sectors**
2. User opens **Technology**
3. User clicks **Industries**
4. User sees Software, Semiconductors, Communications Equipment, etc.
5. User opens **Semiconductors**
6. User runs **Value Screen**
7. App shows:
   - screen passes
   - exclusions
   - likely traps
   - published candidates
8. User opens a surfaced stock
9. User sees stock valuation and peer context

## Screen states

### Sector page
- all industries loaded
- partial industries loaded
- stale industry analytics
- unavailable industry analytics

### Industry screen
- no results yet
- screening in progress
- deterministic results ready
- deep work pending
- candidate publication ready
