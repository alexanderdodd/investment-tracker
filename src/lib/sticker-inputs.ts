/**
 * Gathers the inputs for the Rule #1 sticker price calculation:
 * TTM EPS + analyst growth + current price (Yahoo), historical high P/E
 * (price history ÷ SEC per-FY EPS), and equity growth (SEC growth history).
 * Used by the sticker-price API route and the Rule #1 industry screen.
 */

import { getOrBuildGrowthHistory } from "./sec-edgar/growth-history-cache";
import { getYahooCrumb } from "./stock-metrics";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const MONTH_NUMBER: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

export interface YearlyPe {
  fiscalYear: number;
  eps: number;
  highPrice: number;
  highPe: number;
}

export interface StickerPriceInputs {
  ticker: string;
  companyName: string | null;
  available: boolean;
  unavailableReason: string | null;
  currentPrice: number | null;
  /** Trailing-twelve-month diluted EPS (Yahoo), falling back to latest SEC fiscal year */
  eps: number | null;
  epsSource: "yahoo-ttm" | "sec-fiscal-year" | null;
  epsFiscalYear: number | null;
  /** Analyst consensus growth estimate (Yahoo earningsTrend) */
  analystGrowth: number | null;
  /** Which horizon the analyst estimate covers — Yahoo dropped the 5y series
   *  for most tickers, so this is usually the next-fiscal-year estimate */
  analystGrowthPeriod: "5y" | "1y" | null;
  /** Historical equity (book value) growth from SEC filings */
  equityGrowth: { value: number; spanYears: number } | null;
  /** Median of yearly high P/Es (FY high price ÷ FY diluted EPS) */
  historicalHighPe: number | null;
  peYearsUsed: YearlyPe[];
  /** Last monthly close within each fiscal year — lets the Time Travel tab
   *  compare a past sticker price with the price back then */
  yearEndPrices: { fiscalYear: number; price: number }[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Assign a date to the fiscal year it falls in (labeled by end calendar year). */
function fiscalYearOf(date: Date, fyEndMonth: number): number {
  return date.getUTCMonth() + 1 <= fyEndMonth
    ? date.getUTCFullYear()
    : date.getUTCFullYear() + 1;
}

async function fetchYahooSummary(ticker: string): Promise<{
  trailingEps: number | null;
  analystGrowth: number | null;
  analystGrowthPeriod: "5y" | "1y" | null;
  currentPrice: number | null;
}> {
  const empty = {
    trailingEps: null,
    analystGrowth: null,
    analystGrowthPeriod: null,
    currentPrice: null,
  } as const;
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,earningsTrend,price&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (!res.ok) return empty;
    const json = await res.json();
    const result = json.quoteSummary?.result?.[0];

    const trailingEps = result?.defaultKeyStatistics?.trailingEps?.raw ?? null;
    const currentPrice = result?.price?.regularMarketPrice?.raw ?? null;

    // Prefer the "+5y" long-term consensus when Yahoo still provides it;
    // they dropped it for most tickers, so fall back to next fiscal year
    const trends: Array<{ period?: string; growth?: { raw?: number } }> =
      result?.earningsTrend?.trend ?? [];
    const fiveYear = trends.find((t) => t.period === "+5y")?.growth?.raw;
    const nextYear = trends.find((t) => t.period === "+1y")?.growth?.raw;
    const analystGrowth = fiveYear ?? nextYear ?? null;
    const analystGrowthPeriod: "5y" | "1y" | null =
      fiveYear != null ? "5y" : nextYear != null ? "1y" : null;

    return { trailingEps, analystGrowth, analystGrowthPeriod, currentPrice };
  } catch {
    return empty;
  }
}

async function fetchMonthlyCloses(
  ticker: string
): Promise<{ date: Date; close: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=20y&interval=1mo`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000), close: closes[i] }))
      .filter((p): p is { date: Date; close: number } => p.close != null);
  } catch {
    return [];
  }
}

export async function buildStickerInputs(ticker: string): Promise<StickerPriceInputs> {
  const upperTicker = ticker.toUpperCase();

  let growth;
  try {
    growth = await getOrBuildGrowthHistory(upperTicker);
  } catch {
    growth = null;
  }
  const payload = growth?.payload ?? null;

  const [summary, closes] = await Promise.all([
    fetchYahooSummary(upperTicker),
    fetchMonthlyCloses(upperTicker),
  ]);

  // EPS: prefer Yahoo TTM; fall back to latest SEC fiscal year (split-adjusted)
  let eps = summary.trailingEps;
  let epsSource: StickerPriceInputs["epsSource"] = eps !== null ? "yahoo-ttm" : null;
  let epsFiscalYear: number | null = null;
  if (eps === null && payload?.available) {
    const latestEpsRow = [...payload.years].reverse().find((y) => y.epsDiluted !== null);
    if (latestEpsRow) {
      eps = latestEpsRow.epsDiluted;
      epsSource = "sec-fiscal-year";
      epsFiscalYear = latestEpsRow.fiscalYear;
    }
  }

  // Equity growth: 10y CAGR, falling back to 5y for shorter histories
  let equityGrowth: StickerPriceInputs["equityGrowth"] = null;
  const eq = payload?.summary?.equityGrowth;
  const pick = eq?.tenYear.value !== null && eq?.tenYear.value !== undefined ? eq.tenYear : eq?.fiveYear;
  if (pick && pick.value !== null && pick.spanYears !== null) {
    equityGrowth = { value: pick.value, spanYears: pick.spanYears };
  }

  // Historical high P/E: per fiscal year, high monthly close ÷ that FY's diluted
  // EPS (both split-adjusted); median across years for robustness
  const peYearsUsed: YearlyPe[] = [];
  const yearEndPrices: { fiscalYear: number; price: number }[] = [];
  if (payload?.available && closes.length > 0) {
    const fyEndMonth = MONTH_NUMBER[payload.fiscalYearEndMonth ?? "December"] ?? 12;
    const highByFy = new Map<number, number>();
    const lastByFy = new Map<number, { date: Date; close: number }>();
    for (const { date, close } of closes) {
      const fy = fiscalYearOf(date, fyEndMonth);
      highByFy.set(fy, Math.max(highByFy.get(fy) ?? 0, close));
      const last = lastByFy.get(fy);
      if (!last || date > last.date) lastByFy.set(fy, { date, close });
    }
    for (const [fy, { close }] of Array.from(lastByFy.entries()).sort((a, b) => a[0] - b[0])) {
      yearEndPrices.push({ fiscalYear: fy, price: close });
    }
    for (const row of payload.years) {
      const high = highByFy.get(row.fiscalYear);
      if (high !== undefined && row.epsDiluted !== null && row.epsDiluted > 0) {
        peYearsUsed.push({
          fiscalYear: row.fiscalYear,
          eps: row.epsDiluted,
          highPrice: high,
          highPe: high / row.epsDiluted,
        });
      }
    }
  }
  const historicalHighPe = median(peYearsUsed.map((y) => y.highPe));

  const available = eps !== null && eps > 0;
  const unavailableReason = !available
    ? eps === null
      ? "No EPS available for this ticker."
      : "EPS is negative (loss-making) — the sticker price method needs positive earnings to project from."
    : null;

  return {
    ticker: upperTicker,
    companyName: payload?.companyName ?? null,
    available,
    unavailableReason,
    currentPrice: summary.currentPrice,
    eps,
    epsSource,
    epsFiscalYear,
    analystGrowth: summary.analystGrowth,
    analystGrowthPeriod: summary.analystGrowthPeriod,
    equityGrowth,
    historicalHighPe,
    peYearsUsed,
    yearEndPrices,
  };
}
