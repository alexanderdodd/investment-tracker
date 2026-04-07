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

export const METRIC_INFO: Record<
  keyof Omit<StockMetrics, "ticker">,
  { label: string; short: string; description: string; format: "ratio" | "percent" | "currency" }
> = {
  forwardPE: {
    label: "Forward P/E",
    short: "Fwd P/E",
    description:
      "Price divided by expected next-year earnings. Shows how much the market is willing to pay for future profits. Lower may indicate value; higher may reflect growth expectations.",
    format: "ratio",
  },
  trailingPE: {
    label: "Trailing P/E",
    short: "P/E",
    description:
      "Price divided by last 12 months' earnings. A quick benchmark for how the market prices current profitability versus peers.",
    format: "ratio",
  },
  evToEbitda: {
    label: "EV/EBITDA",
    short: "EV/EBITDA",
    description:
      "Enterprise value divided by earnings before interest, taxes, depreciation, and amortization. Compares the whole business value (including debt) against operating earnings. One of the most widely used cross-company valuation metrics.",
    format: "ratio",
  },
  evToEbit: {
    label: "EV/EBIT",
    short: "EV/EBIT",
    description:
      "Like EV/EBITDA but stricter — includes depreciation costs. Better for asset-heavy companies where capital expenditure and wear matter.",
    format: "ratio",
  },
  priceToBook: {
    label: "Price/Book",
    short: "P/B",
    description:
      "Market price divided by net asset value per share. Core valuation metric for banks, insurers, and asset-heavy firms. Below 1.0 may signal undervaluation or poor returns on equity.",
    format: "ratio",
  },
  priceToSales: {
    label: "Price/Sales",
    short: "P/S",
    description:
      "Market cap divided by revenue. Useful when earnings are weak or absent — lets you value companies before profitability stabilizes. Common for early-stage growth companies.",
    format: "ratio",
  },
  pegRatio: {
    label: "PEG Ratio",
    short: "PEG",
    description:
      "P/E divided by expected earnings growth rate. Helps judge whether a high P/E is justified by growth. A PEG near 1.0 suggests fair pricing relative to growth.",
    format: "ratio",
  },
  freeCashFlow: {
    label: "Free Cash Flow",
    short: "FCF",
    description:
      "Cash generated after capital expenditures. The cash actually available to shareholders — central to intrinsic (DCF) valuation. Positive and growing FCF is a strong quality signal.",
    format: "currency",
  },
  revenueGrowth: {
    label: "Revenue Growth",
    short: "Rev Growth",
    description:
      "Year-over-year change in revenue. A major driver of intrinsic value — fast-growing revenue often supports higher valuation multiples.",
    format: "percent",
  },
  operatingMargin: {
    label: "Operating Margin",
    short: "Op Margin",
    description:
      "Operating income as a percentage of revenue. Shows how much revenue becomes operating profit. Higher margins generally support higher valuations.",
    format: "percent",
  },
  roic: {
    label: "ROIC",
    short: "ROIC",
    description:
      "Return on invested capital — how efficiently the business turns capital into returns. High and sustained ROIC is one of the strongest indicators of business quality and usually supports premium valuations.",
    format: "percent",
  },
  grossMargin: {
    label: "Gross Margin",
    short: "Gross Margin",
    description:
      "Revenue minus cost of goods sold, as a percentage. Indicates pricing power and production efficiency. Especially important for growth companies not yet showing operating profit.",
    format: "percent",
  },
  roe: {
    label: "Return on Equity",
    short: "ROE",
    description:
      "Net income divided by shareholder equity. Measures how effectively management uses equity to generate profit. Especially important for banks and financial companies.",
    format: "percent",
  },
};

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

export async function fetchStockMetrics(
  tickers: string[]
): Promise<Record<string, StockMetrics>> {
  const results: Record<string, StockMetrics> = {};

  // Fetch in parallel batches of 5 to avoid overwhelming Yahoo
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const promises = batch.map(async (ticker) => {
      try {
        const modules =
          "defaultKeyStatistics,financialData,summaryDetail,incomeStatementHistory";
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
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
        results[ticker] = {
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
    });
    await Promise.all(promises);
  }

  return results;
}
