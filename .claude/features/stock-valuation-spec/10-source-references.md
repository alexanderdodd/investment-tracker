# Source references and provenance notes

This file lists the core reference sources used to build the golden Micron baseline and the workflow specification snapshot.

## SEC / EDGAR

1. SEC EDGAR API overview
   https://www.sec.gov/search-filings/edgar-application-programming-interfaces

## Micron primary investor-relations sources used in the frozen baseline

2. Micron Q2 FY2026 10-Q / filing materials (quarter ended 2026-02-26)
   https://investors.micron.com/static-files/236af4a3-d99f-4287-b088-09721d0f6ace

3. Micron Q2 FY2026 earnings release / quarter update
   https://investors.micron.com/node/50256/pdf

4. Micron FY2025 Q4 / full-year results release
   https://investors.micron.com/node/49371/pdf

5. Micron FY2025 10-K or filing-linked annual materials
   https://investors.micron.com/static-files/7a1f8c6f-1ce9-4efe-bc6e-722b6b9c4550

6. Micron Q1 FY2026 results release
   https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-first-quarter-fiscal-2026

7. Micron business unit reorganization announcement
   https://investors.micron.com/news-releases/news-release-details/micron-announces-business-unit-reorganization-capitalize-ai

8. Micron exit from Crucial consumer business announcement
   https://investors.micron.com/news-releases/news-release-details/micron-announces-exit-crucial-consumer-business

## Notes on usage

- Filing-derived statement tables or iXBRL are the authoritative primary source for quarterly and annual facts.
- Companyfacts is a reconciliation source, not the primary quarter selector.
- Market data should be snapshotted and frozen for golden regression tests.
- The coding workflow should store raw source artifacts, hashes, period-end metadata, and derivation logic for every critical figure.

## Baseline policy note

This source list is a snapshot support file for the frozen regression artifact. The production system must rediscover the latest authoritative sources at execution time and must not assume these URLs remain the latest forever.
