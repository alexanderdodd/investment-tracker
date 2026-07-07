/**
 * Growth history builder — Phil Town "Big Five Numbers".
 *
 * Builds up to 11 years of annual fundamentals from SEC EDGAR XBRL and
 * derives the Big Five: ROIC, sales growth, EPS growth, equity (book value)
 * growth, and free-cash-flow growth over 10y / 5y / 1y horizons.
 *
 * Deterministic — no LLM involvement. Fiscal years are labeled by the
 * calendar year the fiscal year ends in (same convention as ttm.ts).
 */

import {
  resolveTickerToCIK,
  getSubmissions,
  getCompanyFacts,
  type XbrlUnit,
} from "./client";
import { extractAllXbrl, findAllRevenueUnitArrays } from "./xbrl-mapper";
import { buildAnnualHistory, buildAnnualInstantHistory } from "./ttm";

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

export interface GrowthHistoryPayload {
  ticker: string;
  companyName: string | null;
  cik: string | null;
  fiscalYearEndMonth: string | null;
  available: boolean;
  unavailableReason: string | null;
  years: GrowthYearRow[];
  summary: GrowthSummary | null;
}

// One more than 10 so a true 10-year CAGR has both endpoints
const HISTORY_YEARS = 11;

const FALLBACK_TAX_RATE = 0.21;

const MONTHS = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// Fiscal year end month codes from SEC (e.g., "0831" → August)
function parseFiscalYearEnd(code: string | undefined): string | null {
  if (!code) return null;
  const monthNum = parseInt(code.slice(0, 2), 10);
  return MONTHS[monthNum] || null;
}

type Series = { fiscalYear: number; value: number }[];

function seriesToMap(series: Series | null): Map<number, number> {
  const map = new Map<number, number>();
  for (const { fiscalYear, value } of series ?? []) map.set(fiscalYear, value);
  return map;
}

/**
 * Merge annual histories from several tag variants of the same concept.
 * Earlier arrays win on conflicting years; later ones fill the gaps
 * (e.g. pre-ASC-606 revenue tags supplying years before 2018).
 */
function mergedAnnualHistory(unitArrays: XbrlUnit[][], years: number): Map<number, number> {
  const merged = new Map<number, number>();
  for (const units of unitArrays) {
    for (const { fiscalYear, value } of buildAnnualHistory(units, years)) {
      if (!merged.has(fiscalYear)) merged.set(fiscalYear, value);
    }
  }
  return merged;
}

const NULL_STAT: PeriodStat = { value: null, spanYears: null };

/**
 * CAGR over up to `targetSpan` years, ending at the latest non-null point.
 * Uses the earliest available point within the window, reporting the actual
 * span so the UI can label e.g. "(7y)" for shorter histories. Null when
 * either endpoint is non-positive (CAGR is undefined) or the span is < 2
 * years (that's YoY territory).
 */
function computeCagr(points: { fiscalYear: number; value: number | null }[], targetSpan: number): PeriodStat {
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
function computeYoY(points: { fiscalYear: number; value: number | null }[]): PeriodStat {
  const valid = points.filter((p) => p.value !== null);
  if (valid.length < 2) return NULL_STAT;
  const end = valid[valid.length - 1];
  const prev = valid.find((p) => p.fiscalYear === end.fiscalYear - 1);
  if (!prev || prev.value! <= 0) return NULL_STAT;
  return { value: end.value! / prev.value! - 1, spanYears: 1 };
}

function growthRow(points: { fiscalYear: number; value: number | null }[]): BigFiveRow {
  return {
    tenYear: computeCagr(points, 10),
    fiveYear: computeCagr(points, 5),
    oneYear: computeYoY(points),
  };
}

/** Average of non-null per-year ROICs within the trailing window. */
function roicAverage(points: { fiscalYear: number; value: number | null }[], windowYears: number): PeriodStat {
  const valid = points.filter((p) => p.value !== null);
  if (valid.length === 0) return NULL_STAT;
  const endYear = valid[valid.length - 1].fiscalYear;
  const window = valid.filter((p) => p.fiscalYear > endYear - windowYears);
  if (window.length === 0) return NULL_STAT;
  const sum = window.reduce((acc, p) => acc + p.value!, 0);
  return { value: sum / window.length, spanYears: window.length };
}

interface SplitEvent {
  date: string; // ISO date
  ratio: number; // e.g. 4 for a 4-for-1 split
}

/**
 * Stock split events from Yahoo Finance. XBRL values are as-originally-filed,
 * so pre-split years report pre-split EPS/share counts — without adjustment a
 * 4-for-1 split reads as EPS collapsing 75%.
 * Best-effort: returns [] when Yahoo is unreachable.
 */
async function fetchSplitEvents(ticker: string): Promise<SplitEvent[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=15y&events=splits`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const json = await res.json();
    const splits = json?.chart?.result?.[0]?.events?.splits ?? {};
    return Object.values(splits as Record<string, { date: number; numerator: number; denominator: number }>)
      .filter((s) => s.numerator > 0 && s.denominator > 0)
      .map((s) => ({
        date: new Date(s.date * 1000).toISOString().slice(0, 10),
        ratio: s.numerator / s.denominator,
      }));
  } catch {
    return [];
  }
}

/**
 * Cumulative split factor for a fiscal year: the product of all split ratios
 * that occurred AFTER that fiscal year ended. Dividing as-filed EPS by the
 * factor (or multiplying share counts) puts every year on the current basis.
 */
function splitFactorForYear(
  fiscalYear: number,
  fiscalYearEndCode: string | undefined,
  splits: SplitEvent[]
): number {
  // fiscalYearEnd from SEC submissions is "MMDD" (e.g. "0928")
  const mmdd =
    fiscalYearEndCode && /^\d{4}$/.test(fiscalYearEndCode)
      ? `${fiscalYearEndCode.slice(0, 2)}-${fiscalYearEndCode.slice(2)}`
      : "12-31";
  const fyEnd = `${fiscalYear}-${mmdd}`;
  return splits.reduce((factor, s) => (s.date > fyEnd ? factor * s.ratio : factor), 1);
}

function unavailable(
  ticker: string,
  reason: string,
  extras: Partial<GrowthHistoryPayload> = {}
): GrowthHistoryPayload {
  return {
    ticker,
    companyName: null,
    cik: null,
    fiscalYearEndMonth: null,
    available: false,
    unavailableReason: reason,
    years: [],
    summary: null,
    ...extras,
  };
}

export async function buildGrowthHistory(ticker: string): Promise<GrowthHistoryPayload> {
  const upper = ticker.toUpperCase();

  let cik: string;
  try {
    cik = await resolveTickerToCIK(upper);
  } catch {
    return unavailable(upper, "Not an SEC filer (non-US listing, ETF, or fund) — no EDGAR filings found.");
  }

  const [submissions, companyFacts, splits] = await Promise.all([
    getSubmissions(cik),
    getCompanyFacts(cik),
    fetchSplitEvents(upper),
  ]);

  const companyName = submissions.name || companyFacts.entityName || upper;
  const fiscalYearEndMonth = parseFiscalYearEnd(submissions.fiscalYearEnd);
  const xbrl = extractAllXbrl(companyFacts);

  // Duration series (income statement / cash flow).
  // Revenue merges all tag variants — the ASC 606 transition (~2018) split
  // most companies' revenue history across old and new tags.
  const revenue = mergedAnnualHistory(findAllRevenueUnitArrays(companyFacts), HISTORY_YEARS);
  const eps = seriesToMap(xbrl.epsDilutedUnits ? buildAnnualHistory(xbrl.epsDilutedUnits, HISTORY_YEARS) : null);
  const ocf = seriesToMap(xbrl.ocfUnits ? buildAnnualHistory(xbrl.ocfUnits, HISTORY_YEARS) : null);
  const capex = seriesToMap(xbrl.capexUnits ? buildAnnualHistory(xbrl.capexUnits, HISTORY_YEARS) : null);
  const opIncome = seriesToMap(xbrl.operatingIncomeUnits ? buildAnnualHistory(xbrl.operatingIncomeUnits, HISTORY_YEARS) : null);
  const taxExpense = seriesToMap(xbrl.taxExpenseUnits ? buildAnnualHistory(xbrl.taxExpenseUnits, HISTORY_YEARS) : null);
  const pretaxIncome = seriesToMap(xbrl.pretaxIncomeUnits ? buildAnnualHistory(xbrl.pretaxIncomeUnits, HISTORY_YEARS) : null);
  const dilutedShares = seriesToMap(xbrl.dilutedSharesUnits ? buildAnnualHistory(xbrl.dilutedSharesUnits, HISTORY_YEARS) : null);

  // Instant series (balance sheet at fiscal-year end)
  const equity = seriesToMap(xbrl.totalEquityUnits ? buildAnnualInstantHistory(xbrl.totalEquityUnits, HISTORY_YEARS) : null);
  const cash = seriesToMap(xbrl.cashUnits ? buildAnnualInstantHistory(xbrl.cashUnits, HISTORY_YEARS) : null);
  const stInv = seriesToMap(xbrl.shortTermInvestmentsUnits ? buildAnnualInstantHistory(xbrl.shortTermInvestmentsUnits, HISTORY_YEARS) : null);
  const ltInv = seriesToMap(xbrl.ltInvestmentsUnits ? buildAnnualInstantHistory(xbrl.ltInvestmentsUnits, HISTORY_YEARS) : null);
  const currentDebt = seriesToMap(xbrl.currentDebtUnits ? buildAnnualInstantHistory(xbrl.currentDebtUnits, HISTORY_YEARS) : null);
  const longTermDebt = seriesToMap(xbrl.longTermDebtUnits ? buildAnnualInstantHistory(xbrl.longTermDebtUnits, HISTORY_YEARS) : null);

  const allYears = Array.from(
    new Set([...revenue.keys(), ...equity.keys()])
  ).sort((a, b) => a - b).slice(-HISTORY_YEARS);

  if (allYears.filter((y) => revenue.has(y)).length < 2) {
    // Foreign private issuers (20-F) file under ifrs-full, which the
    // us-gaap extractor doesn't read — they land here too.
    return unavailable(upper, "No US-GAAP annual filings (10-K) found in SEC EDGAR for this ticker.", {
      companyName,
      cik,
      fiscalYearEndMonth,
    });
  }

  const years: GrowthYearRow[] = allYears.map((fy) => {
    const get = (m: Map<number, number>) => m.get(fy) ?? null;

    // Per-share values are as-originally-filed; put them on the current
    // post-split basis so growth rates aren't distorted by splits.
    const splitFactor = splitFactorForYear(fy, submissions.fiscalYearEnd, splits);
    const epsRaw = get(eps);
    const sharesRaw = get(dilutedShares);

    const ocfVal = get(ocf);
    const capexVal = get(capex);
    const fcf = ocfVal === null ? null : ocfVal - Math.abs(capexVal ?? 0);

    const equityVal = get(equity);
    const totalDebt =
      currentDebt.has(fy) || longTermDebt.has(fy)
        ? (get(currentDebt) ?? 0) + (get(longTermDebt) ?? 0)
        : null;
    const totalCash =
      cash.has(fy) || stInv.has(fy) || ltInv.has(fy)
        ? (get(cash) ?? 0) + (get(stInv) ?? 0) + (get(ltInv) ?? 0)
        : null;

    // Effective tax rate from the filing when sane, else statutory 21%
    // (consistent with the valuation pipeline's ROIC in financial-analysis.ts)
    const tax = get(taxExpense);
    const pretax = get(pretaxIncome);
    let taxRate = FALLBACK_TAX_RATE;
    if (tax !== null && pretax !== null && pretax > 0) {
      taxRate = Math.min(Math.max(tax / pretax, 0), 0.5);
    }

    // Rule #1 ROIC: NOPAT / (equity + debt). Cash is deliberately NOT
    // subtracted — for cash-rich companies (e.g. Apple's investment
    // portfolio) that turns invested capital negative and ROIC meaningless.
    const oi = get(opIncome);
    let roic: number | null = null;
    if (oi !== null && equityVal !== null) {
      const investedCapital = equityVal + (totalDebt ?? 0);
      if (investedCapital > 0) {
        roic = (oi * (1 - taxRate)) / investedCapital;
      }
    }

    return {
      fiscalYear: fy,
      revenue: get(revenue),
      epsDiluted: epsRaw === null ? null : epsRaw / splitFactor,
      equity: equityVal,
      ocf: ocfVal,
      capex: capexVal === null ? null : Math.abs(capexVal),
      fcf,
      operatingIncome: oi,
      totalDebt,
      totalCash,
      dilutedShares: sharesRaw === null ? null : sharesRaw * splitFactor,
      roic,
    };
  });

  const pick = (key: keyof GrowthYearRow) =>
    years.map((r) => ({ fiscalYear: r.fiscalYear, value: r[key] as number | null }));

  const roicPoints = pick("roic");
  const summary: GrowthSummary = {
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

  return {
    ticker: upper,
    companyName,
    cik,
    fiscalYearEndMonth,
    available: true,
    unavailableReason: null,
    years,
    summary,
  };
}
