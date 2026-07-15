/**
 * Last-resort fundamentals from Yahoo's fundamentals-timeseries endpoint, for
 * companies neither SEC (EDGAR) nor European (ESEF) cover — chiefly Swiss and
 * German listings and smaller European names. Yahoo only carries ~4 annual
 * periods, so this yields a SHORT-history Big Five (labelled "(Ny)"), not the
 * full 10-year version — but that beats a blank row. Deterministic, no LLM.
 *
 * Values are kept in the company's reporting currency (never converted).
 */

import { getYahooCrumb } from "./stock-metrics";
import { buildGrowthSummary, type GrowthYearRow } from "./sec-edgar/growth-math";
import type { GrowthHistoryPayload } from "./sec-edgar/growth-history";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const FALLBACK_TAX_RATE = 0.21;

// Yahoo annual line items we pull. Keys become per-year maps below.
const TYPES = [
  "annualTotalRevenue",
  "annualDilutedEPS",
  "annualBasicEPS",
  "annualStockholdersEquity",
  "annualFreeCashFlow",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
  "annualNetIncome",
  "annualEBIT",
  "annualPretaxIncome",
  "annualTaxProvision",
  "annualInvestedCapital",
  "annualDilutedAverageShares",
] as const;

type Metric = (typeof TYPES)[number];

const MONTHS = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

async function fetchTimeseries(
  ticker: string,
  crumb: string,
  cookie: string
): Promise<{ maps: Record<Metric, Map<number, number>>; latestMonth: number | null }> {
  const maps = Object.fromEntries(TYPES.map((t) => [t, new Map<number, number>()])) as Record<
    Metric,
    Map<number, number>
  >;
  let latestMonth: number | null = null;
  let latestYear = -Infinity;

  // ~12 years back; Yahoo returns however few it has (usually ~4).
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 12 * 366 * 24 * 3600;
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}` +
    `?symbol=${encodeURIComponent(ticker)}&type=${TYPES.join(",")}` +
    `&period1=${period1}&period2=${period2}&merge=false&crumb=${encodeURIComponent(crumb)}`;

  const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
  if (!res.ok) return { maps, latestMonth };
  const json = await res.json();
  const results: Array<Record<string, unknown>> = json?.timeseries?.result ?? [];

  for (const item of results) {
    const meta = item.meta as { type?: string[] } | undefined;
    const type = meta?.type?.[0] as Metric | undefined;
    if (!type || !(type in maps)) continue;
    const arr = item[type] as Array<{ asOfDate?: string; reportedValue?: { raw?: number } }> | undefined;
    for (const point of arr ?? []) {
      if (!point?.asOfDate || point.reportedValue?.raw == null) continue;
      const year = parseInt(point.asOfDate.slice(0, 4), 10);
      if (!Number.isFinite(year)) continue;
      maps[type].set(year, point.reportedValue.raw);
      const month = parseInt(point.asOfDate.slice(5, 7), 10);
      // Fiscal-year-end month = the month of the most recent reporting date.
      if (Number.isFinite(month) && year > latestYear) {
        latestYear = year;
        latestMonth = month;
      }
    }
  }
  return { maps, latestMonth };
}

async function fetchMeta(
  ticker: string,
  crumb: string,
  cookie: string
): Promise<{ currency: string | null; name: string | null }> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,financialData&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (!res.ok) return { currency: null, name: null };
    const r = (await res.json()).quoteSummary?.result?.[0];
    return {
      currency: r?.financialData?.financialCurrency ?? r?.price?.currency ?? null,
      name: r?.price?.longName ?? r?.price?.shortName ?? null,
    };
  } catch {
    return { currency: null, name: null };
  }
}

/**
 * Build a (short) Big Five history from Yahoo. Returns null when Yahoo has too
 * little to be meaningful (fewer than ~3 years of revenue + EPS), so the caller
 * keeps the row "unavailable" rather than showing a one-point series.
 */
export async function buildYahooGrowthHistory(
  ticker: string,
  knownName?: string | null
): Promise<GrowthHistoryPayload | null> {
  const upper = ticker.toUpperCase();
  let crumb: string, cookie: string;
  try {
    ({ crumb, cookie } = await getYahooCrumb());
  } catch {
    return null;
  }

  const [{ maps, latestMonth }, meta] = await Promise.all([
    fetchTimeseries(upper, crumb, cookie),
    fetchMeta(upper, crumb, cookie),
  ]);

  const years = Array.from(
    new Set([...maps.annualTotalRevenue.keys(), ...maps.annualStockholdersEquity.keys()])
  ).sort((a, b) => a - b);

  // Need enough overlapping revenue + EPS to compute at least a short CAGR.
  const revYears = years.filter((y) => maps.annualTotalRevenue.has(y));
  const epsYears = years.filter((y) => maps.annualDilutedEPS.has(y) || maps.annualBasicEPS.has(y));
  if (revYears.length < 3 || epsYears.length < 3) return null;

  const rows: GrowthYearRow[] = years.map((fy) => {
    const ebit = maps.annualEBIT.get(fy) ?? null;
    const pretax = maps.annualPretaxIncome.get(fy) ?? null;
    const tax = maps.annualTaxProvision.get(fy) ?? null;
    const netIncome = maps.annualNetIncome.get(fy) ?? null;
    const invested = maps.annualInvestedCapital.get(fy) ?? null;

    // NOPAT / invested capital; effective tax rate from the filing, clamped.
    let roic: number | null = null;
    if (invested !== null && invested > 0) {
      const taxRate =
        pretax !== null && pretax > 0 && tax !== null
          ? Math.min(Math.max(tax / pretax, 0), 0.5)
          : FALLBACK_TAX_RATE;
      const nopat = ebit !== null ? ebit * (1 - taxRate) : netIncome;
      if (nopat !== null) roic = nopat / invested;
    }

    const ocf = maps.annualOperatingCashFlow.get(fy) ?? null;
    const capex = maps.annualCapitalExpenditure.get(fy) ?? null;
    const fcf =
      maps.annualFreeCashFlow.get(fy) ??
      (ocf !== null && capex !== null ? ocf - capex : null);

    return {
      fiscalYear: fy,
      revenue: maps.annualTotalRevenue.get(fy) ?? null,
      epsDiluted: maps.annualDilutedEPS.get(fy) ?? maps.annualBasicEPS.get(fy) ?? null,
      equity: maps.annualStockholdersEquity.get(fy) ?? null,
      ocf,
      capex,
      fcf,
      operatingIncome: ebit,
      totalDebt: null,
      totalCash: null,
      dilutedShares: maps.annualDilutedAverageShares.get(fy) ?? null,
      roic,
    };
  });

  return {
    ticker: upper,
    companyName: meta.name ?? knownName ?? null,
    cik: null,
    fiscalYearEndMonth: latestMonth ? MONTHS[latestMonth] ?? null : null,
    currency: meta.currency ?? null,
    available: true,
    unavailableReason: null,
    years: rows,
    summary: buildGrowthSummary(rows),
  } as GrowthHistoryPayload;
}
