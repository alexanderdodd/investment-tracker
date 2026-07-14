# 07. UI / UX specification

## Design goals
- preserve the app's existing dark, card-based style
- keep sectors as the top-level mental model
- make industries feel like the "bridge" into stock screening
- clearly separate deterministic screen output from deeper valuation output

---

## Screen 1 — Sector Overview with industry summary strips

### Additions
Each sector card gains:
- number of industries
- top 3 industries by weight / relevance
- "value hunting ground" indicator
- candidate count badge

### Interaction
Clicking a sector card still opens the sector page.
New quick action:
- `Industries`

---

## Screen 2 — Sector Detail / Industries tab

### Header
Keep current sector header with stance, confidence, update time.

### New industries section
For each industry card show:
- industry name
- share of sector
- valuation status (`cheap / fair / expensive`)
- revision trend
- quality median
- candidate count
- trap-risk count
- button: `Open Industry`

### CTA
Primary CTA:
- `Run value screen for this industry`

---

## Screen 3 — Industry Detail page

### Hero
- industry name
- sector breadcrumb
- industry status
- update time
- member count
- sub-industry count
- concentration note

### Tabs
- Overview
- Value Screen
- Candidates
- Compare
- Evidence

### Overview tab
Show:
- what the industry does
- top holdings / leaders
- median valuation vs history
- margin and growth medians
- key macro drivers
- cycle state

### Value Screen tab
Show the deterministic funnel:
- Stage A passed universe size
- Stage B hunting-ground score
- Stage C cheapness passes
- Stage D quality passes
- rows grouped by result state

### Candidates tab
Show only:
- published candidates
- screen passes
- needs-deep-work list
with clear labels

### Compare tab
Show:
- medians
- percentiles
- peer-pack context
- charts

---

## Screen 4 — Stock page with industry context

Add an industry context panel:
- sector
- industry
- industry medians
- stock vs industry percentile
- why it surfaced from the industry page
- candidate state
- link to full valuation report

---

## Content rules

### Allowed labels
- Attractive hunting ground
- Mixed
- Caution
- Screen pass
- Needs deep work
- Watchlist only
- Excluded: value trap risk
- Published value candidate

### Forbidden labels without stock-level valuation support
- Best value stock
- Buy now
- Strong buy
- Undervalued by X%
- Hidden gem

### Tone
Use:
- "screened cheap relative to industry"
- "requires deep work"
- "published candidate based on validated valuation artifact"

Avoid:
- certainty language when confidence is moderate or low

---

## Empty and edge states

### No industries available
- show taxonomy/data issue
- no screening CTA

### No candidates found
- show why:
  - industry expensive
  - no cheap names with acceptable quality
  - insufficient data

### Too many results
- default to top 20 ranked by score
- expose filters and sorting
