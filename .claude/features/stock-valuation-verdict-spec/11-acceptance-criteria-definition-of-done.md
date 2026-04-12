# Acceptance criteria / definition of done

The next feature is done for MU only when all of the following are true:

1. the current facts layer still passes all existing Micron baseline checks
2. a deterministic peer / relative framework exists for MU
3. all surfaced valuation fields have formula traces
4. a reproducible fair value range is generated
5. the expensive/fair/cheap label is mechanically derived from the range
6. valuation confidence is deterministic and traceable
7. action zones are deterministic and condition-based
8. action guidance is withheld when action prerequisites fail
9. the current MU output passes the expert-reviewed valuation envelope test
10. historical MU snapshots pass directional sanity tests
11. no unsupported valuation or action claims leak into the report
12. negative controls still force `WITHHOLD_ALL` or `PUBLISH_FACTS_ONLY` as appropriate

## Milestone recommendation

### Milestone A
Publish:
- fair value range
- cheap/fair/expensive label

Do not publish action guidance yet unless the action gate also passes.

### Milestone B
Publish:
- conditional buy / accumulate / hold / trim / sell-zone analysis

Only after valuation confidence is stable and historical calibration passes.
