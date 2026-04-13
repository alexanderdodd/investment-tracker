# Value stock candidate methodology

## Objective

Identify stocks that are plausible value opportunities **within the correct industry context**.

## Core rule

A stock may not be labeled a “validated value candidate” unless:
1. the stock has a deterministic GICS industry assignment
2. the stock has a peer pack appropriate to that industry
3. the stock has a stock valuation artifact
4. the stock valuation artifact is publishable
5. the stock is cheap versus both:
   - its own fair value range
   - and/or its own history / peers in a way consistent with the framework
6. the trap-risk checks do not fail

## Candidate generation pipeline

### Step 1 — Build eligible stock universe per industry
Inputs:
- U.S.-listed stock universe (start with S&P 500 / liquid mid-large cap)
- GICS mapping
- market data
- canonical facts / valuation artifacts

### Step 2 — Run industry filter
Only generate candidates in industries that are:
- `ATTRACTIVE_HUNTING_GROUND`
- or `MIXED` with at least one cheapness signal

Do not generate value candidates for:
- `OVERHEATED`
- `WITHHELD`
unless explicitly in a “speculative / monitor” section

### Step 3 — Run stock-level candidate screen
Minimum deterministic screening fields:
- cheap/fair/expensive label
- valuation confidence
- peer quality
- balance-sheet health
- profitability / cash flow
- history sufficiency
- data freshness

### Step 4 — Classify candidate

#### Validated value candidate
Requirements:
- stock valuation label = `cheap`
- valuation confidence >= 0.60
- peer quality >= `medium`
- no major trap-risk flags
- data freshness within SLA

#### Possible value
Requirements:
- valuation label = `cheap` or `fair with upside`
- confidence between 0.40 and 0.60
- peer quality medium or weak
- some open questions remain

#### Value trap risk
Requirements:
- optically cheap, but:
  - earnings collapsing
  - leverage too high
  - margins structurally deteriorating
  - peer set weak
  - sector/industry economics worsening
  - stock valuation withheld

#### Not attractive
Requirements:
- valuation label = `fair` or `expensive`
- or industry unattractive
- or quality too weak

## Trap-risk engine

Every candidate should compute a trap-risk score.

### Suggested trap-risk checks
- persistent negative free cash flow
- net leverage too high for industry
- downward revision trend
- margin deterioration not explained by normal cycle
- peer comparison poor even when cheap
- capital allocation concerns
- missing or weak peer set
- withheld stock valuation

### Trap-risk labels
- `LOW`
- `MEDIUM`
- `HIGH`

If trap-risk is `HIGH`, the stock may not be shown as validated value.

## Framework-specific candidate logic

### Cyclical semiconductor example (MU-like)
Candidate not enough if:
- stock is cheap only because earnings are at trough
- normalized value not demonstrably above price
- cycle state too uncertain

Need:
- normalized DCF
- self-history support
- peer support
- cycle-aware confidence

### Consumer beverage example (KO / PEP / KDP style)
Need:
- peer valuation
- stable cash flow and margin profile
- dividend / FCF support
- lower cyclicality penalty

### Property & casualty insurance example (ALL / PGR / TRV style)
Need:
- P/B and P/E discipline
- ROE context
- underwriting / combined ratio context
- not EV/EBITDA-led logic

### Interactive media / platform example (META / GOOGL / PINS / SNAP)
Need:
- peer set quality
- margin durability
- ad-cycle and capital allocation context
- network-effect / scale differences accounted for

## Example benchmark peer packs

### MU — memory semiconductors
Primary:
- SK hynix
- Samsung Electronics
Secondary:
- Western Digital / storage adjacent
Exclude as primary:
- Nvidia
- AMD
- Intel

### KO — beverages
Primary:
- PepsiCo
- Keurig Dr Pepper
Secondary:
- Coca-Cola Europacific Partners
- Monster Beverage

### ALL — property & casualty insurance
Primary:
- Progressive
- Travelers
Secondary:
- Hartford
- Cincinnati Financial
- Chubb

### META — interactive media & services
Primary:
- Alphabet
Secondary:
- Pinterest
- Snap
- Reddit (if coverage acceptable)
Exclude:
- unrelated enterprise software or casinos or insurers, even if screeners suggest them

## Important validation principle

The app must validate not only the subject stock, but also the peer set behind the stock.

That means candidate publication requires:
- peer discovery
- peer scoring
- peer valuation snapshots or stock valuation artifacts
- peer freshness
- role correctness
- exclusion correctness
