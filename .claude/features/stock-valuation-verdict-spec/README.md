# Stock Valuation Next-Feature Spec Bundle

This bundle defines the next phase of the stock valuation workflow:

- publishable **fair value ranges**
- **cheap / fair / expensive** labels
- conditional **buy / accumulate / hold / trim / sell-zone** analysis
- a valuation-specific **RALPH loop** that answers the question:
  - **"Can this feature publish a fair-value conclusion for MU that I would trust?"**

## Intended use

1. Treat `stock-valuation-next-feature-spec-complete.md` as the canonical master document.
2. Treat this bundle as an extension of the existing facts-first / valuation-withheld workflow.
3. Keep the current deterministic facts layer unchanged as the prerequisite foundation.
4. Implement valuation publication only after the new value gate and action gate pass.
5. Use MU first; generalize later by company archetype, not by copying MU logic.

## Additional specs (added during implementation)

- `14-key-risks-specification.md` — Deterministic key risk derivation
- `15-iteration-10-expert-fixes.md` — Expert review fixes: report consistency, reverse DCF removal, peer calibration

## Safety posture

- filing-first
- deterministic facts before narrative
- no value verdict on broken facts
- no action guidance on broken value layer
- explicit provenance and formula traces
- prefer withholding over false precision

## Key design decision

The next phase adds a **third gate**:

1. Facts gate
2. Value gate
3. Action gate

A stock can pass the facts gate and still fail the value gate.
A stock can pass the value gate and still fail the action gate.

That separation is required for trust.
