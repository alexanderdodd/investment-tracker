# Iteration 3 — Phase 3: Value Candidate Generation Engine

## What was built

### Database: value_candidates table
- candidateClass: validated_value | possible_value | value_trap_risk | not_attractive
- valuationLabel: cheap | fair | expensive | withheld
- valuationConfidence, peerQuality, trapRisk, score
- reasonsFor/reasonsAgainst as JSONB arrays
- hasValuationArtifact flag

### Candidate generation engine (src/lib/generate-value-candidates.ts)
- Fetches real stock metrics + valuation artifacts for all classified stocks
- Maps valuation insights verdict → valuation label (Undervalued→cheap, etc.)
- Maps confidence (High→0.80, Medium→0.60, Low→0.40)
- Assesses peer quality from valuation artifact peer details
- **Trap risk engine**: checks negative margin, negative FCF, low ROIC, cycle risk, withheld valuation
- **Candidate classification**: deterministic rules matching spec requirements:
  - validated_value: cheap + conf >= 0.60 + peer >= medium + trap != HIGH + artifact exists
  - possible_value: cheap/fair + conf >= 0.40 + trap != HIGH + artifact exists
  - value_trap_risk: cheap + trap == HIGH
  - not_attractive: everything else
- **Industry filter**: only ATTRACTIVE_HUNTING_GROUND or MIXED industries get value candidates
- Score 0-100 based on valuation + confidence + peer quality + metrics
- Reasons built from deterministic fields only (allowlisted)
- Updates industry analytics candidate counts after generation

### CLI script
- `npm run generate-candidates [--sector Name]`

### API update
- `/api/industries/[slug]` now returns candidates array with full classification data

### UI: Candidate list on industry detail page
- Cards showing ticker, company, candidate class badge, valuation badge, trap risk badge
- Score display, reasons for/against
- "No valuation report" label when artifact missing
- Filters out "not_attractive" from display

### Generated results for 4 benchmark sectors (36 stocks)
- ALL (Allstate): possible_value in Insurance (MIXED industry)
- INTC: value_trap_risk in Semiconductors (negative margins)
- 34 others: not_attractive (correctly — most large caps are fairly/expensively valued)
- 0 validated_value (correct — no stocks have valuation artifacts with cheap + high confidence)

## What works
- Deterministic candidate classification with clear rules
- Trap risk engine catches INTC (negative margins)
- Industry filter correctly blocks candidates in OVERHEATED industries
- Candidate counts update in industry analytics
- CAND-001 through CAND-005 enforceable (validated requires artifact, label, peers, trap check)

## What's next (Iteration 4+)
- Phase 4: Generate valuation artifacts for benchmark stocks (MU, KO, ALL, META) to get validated candidates
- Phase 5: Ralph loop validation suite with benchmark packs and negative controls
