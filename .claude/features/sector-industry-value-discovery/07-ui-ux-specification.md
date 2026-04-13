# UI / UX specification

## Design principles

1. Preserve the current dark visual language.
2. Add industry depth without cluttering the sector overview.
3. Keep sectors scannable and industries drillable.
4. Separate:
   - broad market narrative
   - industry attractiveness
   - stock candidate validation
5. Never present candidate stocks as validated if their valuation is withheld.

## New navigation pattern

### Sector page tabs
Current:
- Overview
- Learn
- Position
- Holdings

Add:
- **Industries**

Optionally rename:
- `Holdings` -> `Leaders & Candidates`

## New / updated views

### A. Sector Overview page (updated)
Add to each sector card:
- number of industries
- top 2 attractive industries
- count of validated candidates

Card footer example:
- `Industries: 7`
- `Top opportunities: IT Services, Software`
- `Validated candidates: 4`

### B. Sector Detail — Industries tab (new)
Core modules:
1. Industry heatmap / table
2. Industry cards ranked by attractiveness
3. “Where value may exist” summary
4. Candidate counts by industry
5. Filters:
   - all industries
   - attractive only
   - validated candidate count > 0
   - cyclical only
   - defensive only

### C. Industry Detail page (new)
Header:
- Industry name
- sector
- attractiveness state
- confidence
- updated timestamp

Sections:
1. What this industry includes
2. Performance vs sector / market
3. Valuation vs own history
4. Quality profile
5. Top companies and concentration
6. Candidate value stocks
7. Risks and what to watch
8. Peer quality notes

### D. Candidate stocks module (new)
Display:
- ticker / company
- valuation label
- confidence
- peer quality
- trap risk
- short value thesis
- why it is here
- CTA: open valuation report

### E. Stock valuation page (updated)
Add:
- sector / industry / sub-industry breadcrumb
- peer-set quality badge
- industry median multiples panel
- “why surfaced from industry screen” panel
- “value candidate status” badge

## UI states

### Candidate state badge set
- `Validated value`
- `Possible value`
- `Trap risk`
- `Not attractive`
- `Withheld`

### Industry state badge set
- `Attractive hunting ground`
- `Mixed`
- `Overheated`
- `Low visibility`
- `Withheld`

## Interaction requirements

### Sector → industry drill-in
Clicking an industry row must preserve context:
- sector
- selected time horizon
- valuation filter
- view mode

### Candidate clicks
Opening a candidate stock should pass:
- source industry
- source sector
- candidate class
- screening reasons

That allows the stock page to explain:
> “Surfaced from Technology > IT Services because it screens cheap vs peers and history, with medium peer quality and low trap risk.”

## Accessibility and clarity
- avoid red/green only; include text badges
- show confidence as text + tooltip
- show withheld reasons explicitly
- show peer quality with explanation on hover

## Recommended new screens
- Sector overview with industry strip
- Sector detail industries tab
- Industry detail with candidate list
- Stock valuation page with peer panel and industry context
