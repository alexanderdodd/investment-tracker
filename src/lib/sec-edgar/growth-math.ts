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
