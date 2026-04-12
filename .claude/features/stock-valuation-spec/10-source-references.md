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

## Additional source-bundle requirements for annual-history validation

The frozen Micron baseline requires **five annual periods** for FY2021–FY2025.  
The production fixture must therefore pin authoritative annual source materials for FY2021, FY2022, FY2023, FY2024, and FY2025.

These annual source artifacts must be persisted in the source bundle even if not all individual URLs are listed here. The annual-history loader must not infer five-year averages from:
- TTM data
- quarterly data
- mixed annual + quarterly windows

## Notes on usage

- Filing-derived statement tables or iXBRL are the authoritative primary source for quarterly and annual facts.
- Companyfacts is a reconciliation source, not the primary quarter selector.
- Market data should be snapshotted and frozen for golden regression tests.
- The coding workflow should store raw source artifacts, hashes, period-end metadata, derivation logic, formula traces, and suppression audit records for every critical figure.
- Both DB-persisted artifacts and file-based iteration bundles are required.

## Baseline policy note

This source list is a snapshot support file for the frozen regression artifact.  
The production system must rediscover the latest authoritative sources at execution time and must not assume these URLs remain the latest forever.
