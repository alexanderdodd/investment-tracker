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

import {
  buildGrowthSummary,
  detectSplitFactors,
  type GrowthYearRow,
  type GrowthSummary,
} from "./growth-math";

// Re-exported for existing importers (schema, routes, tabs)
export type { GrowthYearRow, PeriodStat, BigFiveRow, GrowthSummary } from "./growth-math";
export { detectSplitFactors } from "./growth-math";

export interface GrowthHistoryPayload {
  ticker: string;
  companyName: string | null;
  cik: string | null;
  fiscalYearEndMonth: string | null;
  /** Filing currency of the monetary values ("USD", "BRL", "JPY", …).
   *  Values are kept in the filing currency, never converted. */
  currency?: string | null;
  available: boolean;
  unavailableReason: string | null;
  years: GrowthYearRow[];
  summary: GrowthSummary | null;
  /** Where the fundamentals came from. SEC/ESEF are real filings; "yahoo" is
   *  the thin last-resort feed used for cross-listings and small non-filers,
   *  whose data the screener distrusts when a filing-sourced sibling exists. */
  source?: "sec" | "esef" | "yahoo" | null;
}

// 16 years: enough that the Time Travel tab can compute a true 10-year
// window as of ~5 years ago (XBRL coverage starts around 2009-2011, so
// older filers simply top out there)
const HISTORY_YEARS = 16;

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
 * Merge annual revenue histories from several tag variants, taking the
 * LARGEST value per year. Two reasons: tag switches leave gaps (pre-ASC-606
 * years live under old tags), and for some companies the ASC 606 tag only
 * covers part of total revenue — e.g. commodity firms like ADM report most
 * revenue under derivatives accounting, so RevenueFromContractWithCustomer
 * is a small slice of Revenues. Components never exceed the total, so max
 * per year recovers the true top line.
 */
function mergedAnnualHistory(unitArrays: XbrlUnit[][], years: number): Map<number, number> {
  const merged = new Map<number, number>();
  for (const units of unitArrays) {
    for (const { fiscalYear, value } of buildAnnualHistory(units, years)) {
      const existing = merged.get(fiscalYear);
      if (existing === undefined || value > existing) merged.set(fiscalYear, value);
    }
  }
  return merged;
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
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=20y&events=splits`;
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

/** Yahoo's official long name — the search key for ESEF entity resolution */
async function fetchYahooLongName(ticker: string): Promise<string | null> {
  try {
    const { getYahooCrumb } = await import("../stock-metrics");
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json.quoteSummary?.result?.[0]?.price;
    return price?.longName ?? price?.shortName ?? null;
  } catch {
    return null;
  }
}

/** European fallback: build the payload from ESEF filings when possible */
async function tryEsef(
  ticker: string,
  knownName?: string | null
): Promise<GrowthHistoryPayload | null> {
  try {
    const name = knownName ?? (await fetchYahooLongName(ticker));
    if (!name) return null;
    const { buildEsefGrowthHistory } = await import("../esef/esef-growth");
    const esef = await buildEsefGrowthHistory(ticker, name);
    return esef ? { ...esef, source: "esef" as const } : esef;
  } catch {
    return null;
  }
}

// Last resort when neither SEC nor ESEF cover the ticker (Swiss/German and
// smaller European names): Yahoo's ~4y fundamentals → a short Big Five.
async function tryYahoo(
  ticker: string,
  knownName?: string | null
): Promise<GrowthHistoryPayload | null> {
  try {
    const { buildYahooGrowthHistory } = await import("../yahoo-fundamentals");
    const y = await buildYahooGrowthHistory(ticker, knownName);
    return y ? { ...y, source: "yahoo" as const } : y;
  } catch {
    return null;
  }
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
    // Not an SEC filer — try European ESEF, then Yahoo's short fundamentals
    const esef = await tryEsef(upper);
    if (esef) return esef;
    const yahoo = await tryYahoo(upper);
    if (yahoo) return yahoo;
    return unavailable(
      upper,
      "No SEC (EDGAR), European (ESEF), or Yahoo fundamentals found for this ticker — non-covered listing, ETF, or fund."
    );
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
    // A CIK exists but carries no structured annual data (registration-only
    // filers) — try ESEF, then Yahoo's short fundamentals
    const esef = await tryEsef(upper, companyName);
    if (esef) return esef;
    const yahoo = await tryYahoo(upper, companyName);
    if (yahoo) return yahoo;
    return unavailable(upper, "No structured annual filings (SEC 10-K/20-F, European ESEF, or Yahoo) found for this ticker.", {
      companyName,
      cik,
      fiscalYearEndMonth,
    });
  }

  // Per-share values are as-originally-filed; put them on the current
  // post-split basis. Prefer split factors detected from the share-count
  // series itself (catches local splits that ADR feeds miss); fall back to
  // Yahoo's split events when the filings don't reveal any.
  // Where the filings omit share counts, net income ÷ EPS implies them —
  // net income is split-invariant, so the implied series still shows the jump.
  const netIncome = seriesToMap(
    xbrl.netIncomeUnits ? buildAnnualHistory(xbrl.netIncomeUnits, HISTORY_YEARS) : null
  );
  const sharesForDetection = new Map(dilutedShares);
  for (const fy of allYears) {
    if (sharesForDetection.has(fy)) continue;
    const ni = netIncome.get(fy);
    const e = eps.get(fy);
    if (ni !== undefined && e !== undefined && e !== 0) {
      sharesForDetection.set(fy, Math.abs(ni / e));
    }
  }
  const detectedFactors = detectSplitFactors(allYears, sharesForDetection, eps);
  const anyDetected = Array.from(detectedFactors.values()).some((f) => f !== 1);

  const years: GrowthYearRow[] = allYears.map((fy) => {
    const get = (m: Map<number, number>) => m.get(fy) ?? null;

    const splitFactor = anyDetected
      ? (detectedFactors.get(fy) ?? 1)
      : splitFactorForYear(fy, submissions.fiscalYearEnd, splits);
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

  const summary: GrowthSummary = buildGrowthSummary(years);

  return {
    ticker: upper,
    companyName,
    cik,
    fiscalYearEndMonth,
    currency: xbrl.currency,
    available: true,
    unavailableReason: null,
    years,
    summary,
    source: "sec",
  };
}
