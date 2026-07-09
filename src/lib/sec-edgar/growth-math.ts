/**
 * Pure Big Five math over per-year growth rows.
 *
 * No server dependencies — safe to import from client components, which the
 * Time Travel tab uses to recompute the Big Five "as of" an earlier fiscal
 * year by truncating the series before summarizing.
 */

export interface GrowthYearRow {
  fiscalYear: number;
  revenue: number | null;
  epsDiluted: number | null;
  equity: number | null;
  ocf: number | null;
  capex: number | null;
  fcf: number | null;
  operatingIncome: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  dilutedShares: number | null;
  roic: number | null;
}

export interface PeriodStat {
  value: number | null;
  /** Actual span used, when shorter history forced a smaller window */
  spanYears: number | null;
}

export interface BigFiveRow {
  tenYear: PeriodStat;
  fiveYear: PeriodStat;
  oneYear: PeriodStat;
}

export interface GrowthSummary {
  roic: BigFiveRow;
  salesGrowth: BigFiveRow;
  epsGrowth: BigFiveRow;
  equityGrowth: BigFiveRow;
  fcfGrowth: BigFiveRow;
}

const NULL_STAT: PeriodStat = { value: null, spanYears: null };

type Point = { fiscalYear: number; value: number | null };

/**
 * CAGR over up to `targetSpan` years, ending at the latest non-null point.
 * Uses the earliest available point within the window, reporting the actual
 * span so the UI can label e.g. "(7y)" for shorter histories. Null when
 * either endpoint is non-positive (CAGR is undefined) or the span is < 2
 * years (that's YoY territory).
 */
export function computeCagr(points: Point[], targetSpan: number): PeriodStat {
  const valid = points.filter((p) => p.value !== null);
  if (valid.length < 2) return NULL_STAT;
  const end = valid[valid.length - 1];
  const windowStart = valid.filter((p) => p.fiscalYear >= end.fiscalYear - targetSpan);
  const start = windowStart[0];
  const span = end.fiscalYear - start.fiscalYear;
  if (span < 2) return NULL_STAT;
  if (start.value! <= 0 || end.value! <= 0) return { value: null, spanYears: span };
  return { value: Math.pow(end.value! / start.value!, 1 / span) - 1, spanYears: span };
}

/** Latest year vs the year immediately before it. */
export function computeYoY(points: Point[]): PeriodStat {
  const valid = points.filter((p) => p.value !== null);
  if (valid.length < 2) return NULL_STAT;
  const end = valid[valid.length - 1];
  const prev = valid.find((p) => p.fiscalYear === end.fiscalYear - 1);
  if (!prev || prev.value! <= 0) return NULL_STAT;
  return { value: end.value! / prev.value! - 1, spanYears: 1 };
}

export function growthRow(points: Point[]): BigFiveRow {
  return {
    tenYear: computeCagr(points, 10),
    fiveYear: computeCagr(points, 5),
    oneYear: computeYoY(points),
  };
}

/** Average of non-null per-year ROICs within the trailing window. */
export function roicAverage(points: Point[], windowYears: number): PeriodStat {
  const valid = points.filter((p) => p.value !== null);
  if (valid.length === 0) return NULL_STAT;
  const endYear = valid[valid.length - 1].fiscalYear;
  const window = valid.filter((p) => p.fiscalYear > endYear - windowYears);
  if (window.length === 0) return NULL_STAT;
  const sum = window.reduce((acc, p) => acc + p.value!, 0);
  return { value: sum / window.length, spanYears: window.length };
}

const COMMON_SPLIT_RATIOS = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20];

/**
 * Detect splits directly from the filed share-count series: a split shows as
 * the diluted share count jumping N× in one year while EPS drops ~1/N
 * (reciprocal move — mergers dilute shares without the EPS reciprocity).
 *
 * Primary source for split adjustment: it is self-consistent with the
 * filings and catches local-share splits that ADR-based feeds miss entirely
 * (e.g. Toyota's 2021 5:1 split, invisible on the unsplit ADR). Returns a
 * cumulative factor per fiscal year, 1 for the latest.
 */
export function detectSplitFactors(
  years: number[],
  shares: Map<number, number>,
  eps: Map<number, number>
): Map<number, number> {
  const factors = new Map<number, number>();
  let cum = 1;
  // Walk newest → oldest; a split between y and y+1 multiplies every year ≤ y
  for (let i = years.length - 1; i >= 0; i--) {
    const y = years[i];
    factors.set(y, cum);
    const prev = years[i - 1];
    if (prev === undefined) break;
    const sNew = shares.get(y);
    const sOld = shares.get(prev);
    const eNew = eps.get(y);
    const eOld = eps.get(prev);
    if (!sNew || !sOld || sOld <= 0) continue;
    const ratio = sNew / sOld;
    if (ratio < 1.4 && ratio > 0.7) continue; // buyback/dilution noise
    // Require reciprocal EPS movement to rule out issuance-driven jumps
    if (eNew != null && eOld != null && eOld !== 0) {
      const reciprocity = Math.abs(Math.log(Math.abs((eNew / eOld) * ratio)));
      if (reciprocity > Math.log(1.8)) continue;
    }
    const target = ratio >= 1.4 ? ratio : 1 / ratio;
    const nearest = COMMON_SPLIT_RATIOS.reduce((best, r) =>
      Math.abs(Math.log(target / r)) < Math.abs(Math.log(target / best)) ? r : best
    );
    if (Math.abs(Math.log(target / nearest)) > Math.log(1.25)) continue; // not clean enough
    cum *= ratio >= 1.4 ? nearest : 1 / nearest;
    // cum now applies to `prev` and everything older; set on next iteration
  }
  return factors;
}

/** Full Big Five summary over a (possibly truncated) series of year rows. */
export function buildGrowthSummary(years: GrowthYearRow[]): GrowthSummary {
  const pick = (key: keyof GrowthYearRow): Point[] =>
    years.map((r) => ({ fiscalYear: r.fiscalYear, value: r[key] as number | null }));

  const roicPoints = pick("roic");
  return {
    roic: {
      tenYear: roicAverage(roicPoints, 10),
      fiveYear: roicAverage(roicPoints, 5),
      oneYear: roicAverage(roicPoints, 1),
    },
    salesGrowth: growthRow(pick("revenue")),
    epsGrowth: growthRow(pick("epsDiluted")),
    equityGrowth: growthRow(pick("equity")),
    fcfGrowth: growthRow(pick("fcf")),
  };
}
