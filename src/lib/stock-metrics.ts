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
  description: string | ((sector: string) => string);
  format: "ratio" | "percent" | "currency";
  rate: (value: number, sector?: string) => MetricRating;
}

export function getDescription(def: MetricDef, sector?: string): string {
  if (typeof def.description === "function") {
    return def.description(sector ?? "");
  }
  return def.description;
}

function peFmt(t: Thresholds): string {
  return `Under ${t[0]}x = cheap (green), ${t[0]}-${t[1]}x = fair, ${t[1]}-${t[2]}x = pricey (amber), above ${t[2]}x = expensive (red).`;
}

function evFmt(t: Thresholds): string {
  return `Under ${t[0]}x = cheap (green), ${t[0]}-${t[1]}x = fair, ${t[1]}-${t[2]}x = pricey (amber), above ${t[2]}x = expensive (red).`;
}

function psFmt(t: Thresholds): string {
  return `Under ${t[0]}x = cheap (green), ${t[0]}-${t[1]}x = fair, ${t[1]}-${t[2]}x = pricey (amber), above ${t[2]}x = expensive (red).`;
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
    description: (sector) => {
      const t = SECTOR_PE_THRESHOLDS[sector] ?? DEFAULT_PE;
      return `How many dollars you pay for each dollar of expected profit. Example: 20x means you pay $20 per $1 of earnings — it would take 20 years of that profit to 'earn back' the price. Lower = cheaper. Negative means expected losses. For ${sector || "this sector"}: ${peFmt(t)}`;
    },
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PE_THRESHOLDS[s ?? ""] ?? DEFAULT_PE),
  },
  trailingPE: {
    label: "Trailing P/E",
    short: "P/E",
    description: (sector) => {
      const t = SECTOR_PE_THRESHOLDS[sector] ?? DEFAULT_PE;
      return `Same as Forward P/E but using actual past-year earnings. A stock at 15x earned $1 for every $15 of price. Lower = more earnings per dollar. Negative = the company lost money. For ${sector || "this sector"}: ${peFmt(t)}`;
    },
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PE_THRESHOLDS[s ?? ""] ?? DEFAULT_PE),
  },
  evToEbitda: {
    label: "EV/EBITDA",
    short: "EV/EBITDA",
    description: (sector) => {
      const t = SECTOR_EVEBITDA_THRESHOLDS[sector] ?? DEFAULT_EVEBITDA;
      return `Total business value (including debt) vs. operating earnings. More reliable than P/E for comparing companies with different debt levels. For ${sector || "this sector"}: ${evFmt(t)}`;
    },
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_EVEBITDA_THRESHOLDS[s ?? ""] ?? DEFAULT_EVEBITDA),
  },
  evToEbit: {
    label: "EV/EBIT",
    short: "EV/EBIT",
    description: (sector) => {
      const base = SECTOR_EVEBITDA_THRESHOLDS[sector] ?? DEFAULT_EVEBITDA;
      const t: Thresholds = [Math.round(base[0] * 1.3), Math.round(base[1] * 1.3), Math.round(base[2] * 1.3)];
      return `Like EV/EBITDA but stricter — includes depreciation costs. Better for asset-heavy industries where equipment wear is a real expense. For ${sector || "this sector"}: ${evFmt(t)}`;
    },
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
    description: (sector) => {
      if (sector === "Financials") return "Market price vs. net asset value. For banks and insurers: under 1.2x = cheap (green), 1.2-2x = fair, 2-3x = pricey (amber), above 3x = expensive (red). Under 1.0x can mean undervalued or troubled.";
      if (sector === "Real Estate") return "Market price vs. net asset value. For real estate: under 1.5x = cheap (green), 1.5-3x = fair, 3-5x = pricey (amber), above 5x = expensive (red).";
      return "Market price vs. net asset value. Most useful for financials and asset-heavy firms. For tech/growth companies, high P/B is normal because their value is in intangibles (IP, brand), not physical assets.";
    },
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
    description: (sector) => {
      const t = SECTOR_PS_THRESHOLDS[sector] ?? DEFAULT_PS;
      return `Market cap vs. revenue. Useful when a company isn't yet profitable — you can still value it by what you pay per dollar of sales. For ${sector || "this sector"}: ${psFmt(t)}`;
    },
    format: "ratio",
    rate: (v, s) => rateLowerIsBetter(v, SECTOR_PS_THRESHOLDS[s ?? ""] ?? DEFAULT_PS),
  },
  pegRatio: {
    label: "PEG Ratio",
    short: "PEG",
    description:
      "Checks if a high P/E is justified by growth. It divides P/E by the growth rate. Example: a stock with 30x P/E growing at 30% = PEG of 1.0 (fairly priced). Under 1.0 = you're getting growth cheap (green). 1.0-1.5 = fair. Above 2.0 = overpaying even after accounting for growth (red). Works across all sectors.",
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
    description: (sector) => {
      const context = (sector === "Technology" || sector === "Communication Services")
        ? "For tech, negative FCF can be acceptable if the company is investing heavily in growth — but most mature tech companies should be FCF-positive."
        : `For ${sector || "this sector"}, positive and growing FCF is a key quality signal.`;
      return `The actual cash left over after paying all bills and buying equipment. Think of it as the company's 'take-home pay'. Positive (green) = healthy, the business generates real cash. Negative (red) = burning cash, spending more than it earns. ${context}`;
    },
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
    description: (sector) => {
      if (sector === "Technology" || sector === "Communication Services") {
        return `Year-over-year sales change. For ${sector}: above 20% is strong (green), 10-20% is solid, below 10% is slow for this sector (amber), negative is shrinking (red).`;
      }
      if (sector === "Utilities" || sector === "Consumer Staples") {
        return `Year-over-year sales change. For ${sector}: above 5% is solid (green), 2-5% is normal for this stable sector, below 2% is flat (amber), negative is shrinking (red).`;
      }
      return `Year-over-year sales change. For ${sector || "this sector"}: above 15% is strong (green), 5-15% is solid, below 5% is modest (amber), negative is shrinking (red).`;
    },
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
    description: (sector) => {
      const t = SECTOR_MARGIN_THRESHOLDS[sector] ?? DEFAULT_MARGIN;
      const low = (t[0] * 100).toFixed(0);
      const high = (t[1] * 100).toFixed(0);
      return `What percentage of revenue becomes operating profit. Negative means the core business is losing money. For ${sector || "this sector"}: above ${high}% is strong (green), ${low}-${high}% is fair, below ${low}% is thin (amber).`;
    },
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
      "How much profit the company makes for each dollar invested in it. Example: 20% ROIC means every $1 invested generates $0.20 of profit. Above 15% = excellent, the business has a real competitive advantage (green). 8-15% = decent (neutral). Below 8% = the company isn't earning more than its cost of capital, which destroys shareholder value (red). One of the single best quality indicators across all sectors.",
    format: "percent",
    rate: (v) => rateHigherIsBetter(v, 0, 0.08, 0.15),
  },
  grossMargin: {
    label: "Gross Margin",
    short: "Gross Margin",
    description:
      "How much the company keeps from each sale after paying direct production costs. Example: 60% gross margin means for every $100 in sales, $60 is left after making the product. Above 50% = strong pricing power, typical of software and luxury brands (green). 30-50% = solid. Under 30% = thin margins, common in retail and commodities (amber). Negative = selling below cost (red).",
    format: "percent",
    rate: (v) => rateHigherIsBetter(v, 0, 0.3, 0.5),
  },
  roe: {
    label: "Return on Equity",
    short: "ROE",
    description: (sector) => {
      const benchmark = sector === "Financials" ? "12%" : "15%";
      return `How much profit the company generates with shareholders' money. Example: 15% ROE means $1 of equity produces $0.15 of profit. Above ${benchmark} = strong for ${sector || "this sector"} (green). 10-${benchmark} = decent. Below 10% = weak (amber). Caveat: very high ROE (30%+) can mean either an excellent business or dangerously high debt — check the balance sheet.`;
    },
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
