export interface StockMetrics {
  ticker: string;
  forwardPE: number | null;
  trailingPE: number | null;
  evToEbitda: number | null;
  evToEbit: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  pegRatio: number | null;
  freeCashFlow: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  roic: number | null;
  grossMargin: number | null;
  roe: number | null;
}

// "good" = green, "neutral" = default, "bad" = red, "caution" = amber
export type MetricRating = "good" | "neutral" | "caution" | "bad";

export interface MetricDef {
  label: string;
  short: string;
  description: string;
  format: "ratio" | "percent" | "currency";
  rate: (value: number, sector?: string) => MetricRating;
}

// Sector-specific thresholds for valuation multiples: [good_below, neutral_below, caution_below]
// Values above caution_below are rated "bad"
type Thresholds = [number, number, number];

const SECTOR_PE_THRESHOLDS: Record<string, Thresholds> = {
  Technology:                [25, 35, 50],
  "Communication Services":  [20, 30, 45],
  "Consumer Discretionary":  [20, 30, 45],
  "Health Care":             [20, 30, 45],
  Financials:                [12, 18, 25],
  Industrials:               [15, 22, 35],
  "Consumer Staples":        [18, 25, 35],
  Energy:                    [10, 15, 22],
  Utilities:                 [15, 20, 28],
  Materials:                 [12, 18, 28],
  "Real Estate":             [20, 30, 45],
};

const SECTOR_EVEBITDA_THRESHOLDS: Record<string, Thresholds> = {
  Technology:                [15, 22, 30],
  "Communication Services":  [12, 18, 25],
  "Consumer Discretionary":  [12, 18, 25],
  "Health Care":             [12, 18, 25],
  Financials:                [8, 12, 18],
  Industrials:               [10, 14, 20],
  "Consumer Staples":        [12, 16, 22],
  Energy:                    [5, 8, 12],
  Utilities:                 [8, 12, 16],
  Materials:                 [7, 10, 15],
  "Real Estate":             [12, 18, 25],
};

const SECTOR_PS_THRESHOLDS: Record<string, Thresholds> = {
  Technology:                [5, 10, 20],
  "Communication Services":  [3, 7, 15],
  "Consumer Discretionary":  [2, 5, 10],
  "Health Care":             [4, 8, 15],
  Financials:                [2, 4, 8],
  Industrials:               [2, 4, 8],
  "Consumer Staples":        [2, 4, 7],
  Energy:                    [1, 2, 4],
  Utilities:                 [2, 3, 5],
  Materials:                 [1, 3, 5],
  "Real Estate":             [3, 6, 12],
};

const SECTOR_MARGIN_THRESHOLDS: Record<string, Thresholds> = {
  Technology:                [0.15, 0.25, 999],  // > thresholds are "good"
  "Communication Services":  [0.15, 0.25, 999],
  "Consumer Discretionary":  [0.08, 0.15, 999],
  "Health Care":             [0.10, 0.20, 999],
  Financials:                [0.15, 0.25, 999],
  Industrials:               [0.08, 0.15, 999],
  "Consumer Staples":        [0.08, 0.15, 999],
  Energy:                    [0.08, 0.15, 999],
  Utilities:                 [0.10, 0.18, 999],
  Materials:                 [0.08, 0.15, 999],
  "Real Estate":             [0.10, 0.20, 999],
};

const DEFAULT_PE: Thresholds = [15, 25, 40];
const DEFAULT_EVEBITDA: Thresholds = [10, 15, 20];
const DEFAULT_PS: Thresholds = [2, 5, 10];
const DEFAULT_MARGIN: Thresholds = [0.10, 0.20, 999];

function rateLowerIsBetter(v: number, t: Thresholds): MetricRating {
  if (v < 0) return "bad";
  if (v < t[0]) return "good";
  if (v <= t[1]) return "neutral";
  if (v <= t[2]) return "caution";
  return "bad";
}

function rateHigherIsBetter(v: number, bad: number, caution: number, good: number): MetricRating {
  if (v >= good) return "good";
  if (v >= caution) return "neutral";
  if (v >= bad) return "caution";
  return "bad";
}

export const METRIC_INFO: Record<keyof Omit<StockMetrics, "ticker">, MetricDef> = {
  forwardPE: {
    label: "Forward P/E",
    short: "Fwd P/E",
    description:
      "How many dollars you pay for each dollar of expected profit. Example: 20x means you pay $20 per $1 of earnings — so it would take 20 years of that profit to 'earn back' the price. Lower = cheaper. A high number means the market expects big future growth to justify the price. Negative means the company is expected to lose money (no earnings to price against). Typical ranges vary by sector — tech at 25-35x, energy at 10-15x.",
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PE_THRESHOLDS[s ?? ""] ?? DEFAULT_PE),
  },
  trailingPE: {
    label: "Trailing P/E",
    short: "P/E",
    description:
      "Same idea as Forward P/E, but based on actual earnings from the past 12 months instead of forecasts. A stock at 15x earned $1 for every $15 of its price last year. Lower = you're getting more earnings per dollar spent. Negative means the company actually lost money — there are no earnings, so the ratio flips negative. Best compared within the same sector.",
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PE_THRESHOLDS[s ?? ""] ?? DEFAULT_PE),
  },
  evToEbitda: {
    label: "EV/EBITDA",
    short: "EV/EBITDA",
    description:
      "Total business value vs. operating earnings (debt-neutral). Sector norms vary widely: energy at 5-8x, industrials at 10-14x, tech at 15-22x. More reliable than P/E for cross-company comparison.",
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_EVEBITDA_THRESHOLDS[s ?? ""] ?? DEFAULT_EVEBITDA),
  },
  evToEbit: {
    label: "EV/EBIT",
    short: "EV/EBIT",
    description:
      "Like EV/EBITDA but stricter — includes depreciation. Better for asset-heavy industries (manufacturing, utilities, real estate) where depreciation is a real cost. Typically 2-4x higher than EV/EBITDA.",
    format: "ratio",
    rate: (v, s) => {
      // Roughly EV/EBITDA thresholds * 1.3
      const base = SECTOR_EVEBITDA_THRESHOLDS[s ?? ""] ?? DEFAULT_EVEBITDA;
      return rateLowerIsBetter(v, [base[0] * 1.3, base[1] * 1.3, base[2] * 1.3]);
    },
  },
  priceToBook: {
    label: "Price/Book",
    short: "P/B",
    description:
      "Market price vs. net asset value. Under 1.0x means trading below book value (potentially cheap or troubled). For banks 1-2x is normal, for tech 5x+ is common due to intangible assets. Most useful for financials and asset-heavy firms.",
    format: "ratio",
    rate: (v, s) => {
      if (s === "Financials") return rateLowerIsBetter(v, [1.2, 2, 3]);
      if (s === "Real Estate") return rateLowerIsBetter(v, [1.5, 3, 5]);
      return rateLowerIsBetter(v, [2, 5, 10]);
    },
  },
  priceToSales: {
    label: "Price/Sales",
    short: "P/S",
    description:
      "Market cap vs. revenue. Ranges vary hugely: energy/retail at 0.5-2x, industrials at 2-4x, tech/software at 5-15x. Useful when a company isn't yet profitable. Color coding adjusts for sector norms.",
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PS_THRESHOLDS[s ?? ""] ?? DEFAULT_PS),
  },
  pegRatio: {
    label: "PEG Ratio",
    short: "PEG",
    description:
      "P/E divided by expected earnings growth rate. Under 1.0 suggests undervalued relative to growth, 1.0-1.5 is fairly priced, above 2.0 means you're overpaying even accounting for growth. Sector-agnostic — works across industries.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 1) return "good";
      if (v <= 1.5) return "neutral";
      if (v <= 2) return "caution";
      return "bad";
    },
  },
  freeCashFlow: {
    label: "Free Cash Flow",
    short: "FCF",
    description:
      "Cash left after running the business and buying equipment. Positive is good — it's real money available to shareholders. Negative means burning cash (acceptable for high-growth companies, red flag for mature ones).",
    format: "currency",
    rate: (v) => {
      if (v > 0) return "good";
      if (v === 0) return "neutral";
      return "bad";
    },
  },
  revenueGrowth: {
    label: "Revenue Growth",
    short: "Rev Growth",
    description:
      "Year-over-year sales change. Above 20% is strong, 10-20% is solid, 0-10% is modest, negative is shrinking. Expectations vary: 5% is fine for utilities, but tech investors expect 15%+.",
    format: "percent",
    rate: (v, s) => {
      // Higher growth expectations for tech/growth sectors
      if (s === "Technology" || s === "Communication Services") {
        return rateHigherIsBetter(v, -0.05, 0.10, 0.20);
      }
      if (s === "Utilities" || s === "Consumer Staples") {
        return rateHigherIsBetter(v, -0.02, 0.02, 0.05);
      }
      return rateHigherIsBetter(v, -0.05, 0.05, 0.15);
    },
  },
  operatingMargin: {
    label: "Operating Margin",
    short: "Op Margin",
    description:
      "What percentage of revenue becomes operating profit. Norms vary: software at 25-40%, industrials at 8-15%, retail at 3-8%. Negative means the core business is losing money. Color coding adjusts for sector expectations.",
    format: "percent",
    rate: (v, s) => {
      const t = SECTOR_MARGIN_THRESHOLDS[s ?? ""] ?? DEFAULT_MARGIN;
      if (v < 0) return "bad";
      if (v < t[0]) return "caution";
      if (v < t[1]) return "neutral";
      return "good";
    },
  },
  roic: {
    label: "ROIC",
    short: "ROIC",
    description:
      "Return on invested capital — profit per dollar invested. Above 15% is excellent (strong moat), 10-15% is good, below cost of capital (~8%) destroys value. One of the best single indicators of business quality, applicable across all sectors.",
    format: "percent",
    rate: (v) => rateHigherIsBetter(v, 0, 0.08, 0.15),
  },
  grossMargin: {
    label: "Gross Margin",
    short: "Gross Margin",
    description:
      "Revenue minus direct costs. Above 60% signals software/IP businesses, 40-60% is strong (pharma, brands), 20-40% is typical (hardware, manufacturing), under 20% is thin (retail, commodities).",
    format: "percent",
    rate: (v) => rateHigherIsBetter(v, 0, 0.3, 0.5),
  },
  roe: {
    label: "Return on Equity",
    short: "ROE",
    description:
      "Profit per dollar of shareholder equity. Above 15% is strong, 10-15% is decent, below 10% is weak. For banks, 12%+ is the benchmark. Very high ROE (30%+) can signal either excellence or heavy debt leverage — check debt levels.",
    format: "percent",
    rate: (v, s) => {
      if (s === "Financials") return rateHigherIsBetter(v, 0, 0.08, 0.12);
      return rateHigherIsBetter(v, 0, 0.10, 0.15);
    },
  },
};

export function rateMetric(
  metricKey: keyof Omit<StockMetrics, "ticker">,
  value: number | null,
  sector?: string
): MetricRating {
  if (value === null || value === undefined || isNaN(value)) return "neutral";
  return METRIC_INFO[metricKey].rate(value, sector);
}

export function formatMetric(
  value: number | null,
  format: "ratio" | "percent" | "currency"
): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  switch (format) {
    case "ratio":
      return value.toFixed(1) + "x";
    case "percent":
      return (value * 100).toFixed(1) + "%";
    case "currency":
      if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + "B";
      if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + "M";
      return value.toFixed(0);
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function getYahooCrumb(): Promise<{
  crumb: string;
  cookie: string;
}> {
  // Step 1: hit fc.yahoo.com to get a session cookie
  const initRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const setCookies = initRes.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");

  // Step 2: get crumb using the cookie
  const crumbRes = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: { "User-Agent": UA, Cookie: cookie },
    }
  );
  const crumb = await crumbRes.text();

  if (!crumb || crumb.includes("Too Many") || crumb.includes("error")) {
    throw new Error(`Failed to get Yahoo crumb: ${crumb}`);
  }

  return { crumb, cookie };
}

export async function fetchStockMetrics(
  tickers: string[]
): Promise<Record<string, StockMetrics>> {
  const results: Record<string, StockMetrics> = {};

  // Get auth credentials first
  let crumb: string;
  let cookie: string;
  try {
    const auth = await getYahooCrumb();
    crumb = auth.crumb;
    cookie = auth.cookie;
  } catch (err) {
    console.error("Failed to authenticate with Yahoo Finance:", err);
    // Return empty metrics for all tickers
    for (const ticker of tickers) {
      results[ticker] = emptyMetrics(ticker);
    }
    return results;
  }

  // Fetch in parallel batches of 5 to avoid overwhelming Yahoo
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const promises = batch.map(async (ticker) => {
      try {
        const modules =
          "defaultKeyStatistics,financialData,summaryDetail";
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Cookie: cookie },
        });

        if (!res.ok) throw new Error(`${res.status}`);

        const json = await res.json();
        const result = json.quoteSummary?.result?.[0];
        if (!result) throw new Error("No data");

        const stats = result.defaultKeyStatistics ?? {};
        const fin = result.financialData ?? {};
        const summary = result.summaryDetail ?? {};

        const num = (obj: Record<string, unknown>): number | null => {
          const raw = obj?.raw;
          return typeof raw === "number" && isFinite(raw) ? raw : null;
        };

        // Calculate ROIC: EBIT / (Total Assets - Current Liabilities)
        // We approximate with returnOnAssets * (1 + debt/equity) or use operatingCashflow/totalDebt
        // Yahoo doesn't provide ROIC directly, so we'll use ROA as a proxy indicator
        const roa = num(fin.returnOnAssets);
        const debtToEquity = num(fin.debtToEquity);
        let roic: number | null = null;
        if (roa !== null && debtToEquity !== null && debtToEquity > 0) {
          // ROIC ≈ ROA * (1 + D/E) / (1 + D/E * (1-tax)) — simplified
          roic = roa * (1 + debtToEquity / 100);
        } else {
          roic = roa;
        }

        // EV/EBIT: compute from EV and EBIT if available
        const ev = num(stats.enterpriseValue);
        const ebitda = num(fin.ebitda);
        const operatingMarginVal = num(fin.operatingMargins);
        const totalRevenue = num(fin.totalRevenue);
        let evToEbit: number | null = null;
        if (ev !== null && totalRevenue !== null && operatingMarginVal !== null) {
          const ebit = totalRevenue * operatingMarginVal;
          if (ebit > 0) evToEbit = ev / ebit;
        }

        let evToEbitda: number | null = null;
        if (ev !== null && ebitda !== null && ebitda > 0) {
          evToEbitda = ev / ebitda;
        }

        results[ticker] = {
          ticker,
          forwardPE: num(stats.forwardPE) ?? num(summary.forwardPE),
          trailingPE: num(summary.trailingPE),
          evToEbitda,
          evToEbit,
          priceToBook: num(stats.priceToBook),
          priceToSales: num(summary.priceToSalesTrailing12Months),
          pegRatio: num(stats.pegRatio),
          freeCashFlow: num(fin.freeCashflow),
          revenueGrowth: num(fin.revenueGrowth),
          operatingMargin: num(fin.operatingMargins),
          roic,
          grossMargin: num(fin.grossMargins),
          roe: num(fin.returnOnEquity),
        };
      } catch {
        results[ticker] = emptyMetrics(ticker);
      }
    });
    await Promise.all(promises);
  }

  return results;
}

function emptyMetrics(ticker: string): StockMetrics {
  return {
    ticker,
    forwardPE: null,
    trailingPE: null,
    evToEbitda: null,
    evToEbit: null,
    priceToBook: null,
    priceToSales: null,
    pegRatio: null,
    freeCashFlow: null,
    revenueGrowth: null,
    operatingMargin: null,
    roic: null,
    grossMargin: null,
    roe: null,
  };
}
