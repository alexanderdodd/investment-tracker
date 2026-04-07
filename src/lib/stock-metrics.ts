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
  rate: (value: number) => MetricRating;
}

export const METRIC_INFO: Record<keyof Omit<StockMetrics, "ticker">, MetricDef> = {
  forwardPE: {
    label: "Forward P/E",
    short: "Fwd P/E",
    description:
      "Price vs. expected next-year earnings. Under 15x is generally cheap, 15-25x is fair for quality companies, 25-40x is growth-priced, above 40x is very expensive. Negative means the company is expected to lose money.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 15) return "good";
      if (v <= 25) return "neutral";
      if (v <= 40) return "caution";
      return "bad";
    },
  },
  trailingPE: {
    label: "Trailing P/E",
    short: "P/E",
    description:
      "Price vs. last 12 months' actual earnings. Under 15x is value territory, 15-25x is typical for established companies, above 25x suggests the market expects strong growth. Negative means the company lost money.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 15) return "good";
      if (v <= 25) return "neutral";
      if (v <= 40) return "caution";
      return "bad";
    },
  },
  evToEbitda: {
    label: "EV/EBITDA",
    short: "EV/EBITDA",
    description:
      "Total business value vs. operating earnings (debt-neutral). Under 10x is cheap, 10-15x is fair, 15-20x is pricey, above 20x is expensive. More reliable than P/E for comparing companies with different debt levels.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 10) return "good";
      if (v <= 15) return "neutral";
      if (v <= 20) return "caution";
      return "bad";
    },
  },
  evToEbit: {
    label: "EV/EBIT",
    short: "EV/EBIT",
    description:
      "Like EV/EBITDA but stricter — includes depreciation. Under 12x is cheap, 12-18x is fair, above 18x is expensive. Better for asset-heavy industries (manufacturing, utilities) where depreciation is a real cost.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 12) return "good";
      if (v <= 18) return "neutral";
      if (v <= 25) return "caution";
      return "bad";
    },
  },
  priceToBook: {
    label: "Price/Book",
    short: "P/B",
    description:
      "Market price vs. net asset value. Under 1.0x means the stock trades below book value (potentially cheap or troubled). 1-2x is typical for banks. Above 3x suggests the market values intangibles like brand or IP highly.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 1.5) return "good";
      if (v <= 3) return "neutral";
      if (v <= 5) return "caution";
      return "bad";
    },
  },
  priceToSales: {
    label: "Price/Sales",
    short: "P/S",
    description:
      "Market cap vs. revenue. Under 2x is cheap, 2-5x is reasonable for growing companies, 5-10x is pricey (needs strong growth), above 10x is very expensive. Useful when a company isn't yet profitable.",
    format: "ratio",
    rate: (v) => {
      if (v < 0) return "bad";
      if (v < 2) return "good";
      if (v <= 5) return "neutral";
      if (v <= 10) return "caution";
      return "bad";
    },
  },
  pegRatio: {
    label: "PEG Ratio",
    short: "PEG",
    description:
      "P/E divided by earnings growth rate. Under 1.0 suggests undervalued relative to growth, 1.0-1.5 is fairly priced, above 2.0 means you're paying a premium even accounting for growth.",
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
      "Cash left after running the business and buying equipment. Positive is good — it's real money available to shareholders. Negative means the company is burning cash. The higher, the stronger the business.",
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
      "Year-over-year sales change. Above 20% is strong growth, 10-20% is solid, 0-10% is modest, negative means revenue is shrinking — a red flag unless it's a deliberate business transition.",
    format: "percent",
    rate: (v) => {
      if (v > 0.2) return "good";
      if (v > 0.05) return "neutral";
      if (v >= 0) return "caution";
      return "bad";
    },
  },
  operatingMargin: {
    label: "Operating Margin",
    short: "Op Margin",
    description:
      "What percentage of revenue becomes operating profit. Above 20% is strong, 10-20% is healthy, 0-10% is thin, negative means the core business is losing money.",
    format: "percent",
    rate: (v) => {
      if (v > 0.2) return "good";
      if (v > 0.1) return "neutral";
      if (v >= 0) return "caution";
      return "bad";
    },
  },
  roic: {
    label: "ROIC",
    short: "ROIC",
    description:
      "Return on invested capital — profit generated per dollar invested in the business. Above 15% is excellent (strong competitive advantage), 10-15% is good, below 10% is mediocre, below cost of capital (~8%) destroys value.",
    format: "percent",
    rate: (v) => {
      if (v > 0.15) return "good";
      if (v > 0.08) return "neutral";
      if (v >= 0) return "caution";
      return "bad";
    },
  },
  grossMargin: {
    label: "Gross Margin",
    short: "Gross Margin",
    description:
      "Revenue minus direct costs, as a percentage. Above 50% signals strong pricing power (software, luxury brands), 30-50% is solid, under 30% is thin (retail, commodities). Key for growth companies not yet showing operating profit.",
    format: "percent",
    rate: (v) => {
      if (v > 0.5) return "good";
      if (v > 0.3) return "neutral";
      if (v >= 0) return "caution";
      return "bad";
    },
  },
  roe: {
    label: "Return on Equity",
    short: "ROE",
    description:
      "Profit per dollar of shareholder equity. Above 15% is strong, 10-15% is decent, below 10% is weak. For banks, 12%+ is the benchmark. Very high ROE (30%+) can signal either excellence or heavy debt leverage.",
    format: "percent",
    rate: (v) => {
      if (v > 0.15) return "good";
      if (v > 0.1) return "neutral";
      if (v >= 0) return "caution";
      return "bad";
    },
  },
};

export function rateMetric(
  metricKey: keyof Omit<StockMetrics, "ticker">,
  value: number | null
): MetricRating {
  if (value === null || value === undefined || isNaN(value)) return "neutral";
  return METRIC_INFO[metricKey].rate(value);
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
