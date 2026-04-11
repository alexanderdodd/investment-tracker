/**
 * Deterministic market data client.
 *
 * Fetches current price, shares outstanding, beta from Yahoo Finance API.
 * This is the same API used by the sector data module.
 */

interface YahooQuoteResult {
  regularMarketPrice: number;
  regularMarketTime: number;
  sharesOutstanding: number;
  marketCap: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
}

export interface MarketDataSnapshot {
  price: number;
  priceTimestamp: string; // ISO date
  sharesOutstanding: number; // actual count, not millions
  marketCap: number; // in dollars
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  annualDividendRate: number | null;
  annualDividendYield: number | null;
}

export async function fetchMarketData(ticker: string): Promise<MarketDataSnapshot> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for ${ticker}`);
  }

  const json = await res.json();
  const meta = json.chart.result[0].meta;

  const price = meta.regularMarketPrice as number;
  const timestamp = new Date(
    (meta.regularMarketTime as number) * 1000
  ).toISOString();

  // Yahoo also provides quote-level data through a different endpoint for richer fields
  // For shares outstanding and market cap, we need the quote endpoint
  const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,defaultKeyStatistics,summaryDetail`;
  let sharesOutstanding = 0;
  let marketCap = 0;
  let fiftyTwoWeekLow = 0;
  let fiftyTwoWeekHigh = 0;
  let annualDividendRate: number | null = null;
  let annualDividendYield: number | null = null;

  try {
    const quoteRes = await fetch(quoteUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (quoteRes.ok) {
      const quoteJson = await quoteRes.json();
      const priceData = quoteJson.quoteSummary?.result?.[0]?.price;
      const keyStats = quoteJson.quoteSummary?.result?.[0]?.defaultKeyStatistics;
      const summaryDetail = quoteJson.quoteSummary?.result?.[0]?.summaryDetail;

      sharesOutstanding = keyStats?.sharesOutstanding?.raw ?? priceData?.marketCap?.raw / price;
      marketCap = priceData?.marketCap?.raw ?? price * sharesOutstanding;
      fiftyTwoWeekLow = summaryDetail?.fiftyTwoWeekLow?.raw ?? 0;
      fiftyTwoWeekHigh = summaryDetail?.fiftyTwoWeekHigh?.raw ?? 0;
      annualDividendRate = summaryDetail?.trailingAnnualDividendRate?.raw ?? null;
      annualDividendYield = summaryDetail?.trailingAnnualDividendYield?.raw ?? null;
    }
  } catch {
    // Fallback: estimate from price data
    marketCap = 0;
    sharesOutstanding = 0;
  }

  return {
    price,
    priceTimestamp: timestamp,
    sharesOutstanding,
    marketCap,
    fiftyTwoWeekLow,
    fiftyTwoWeekHigh,
    annualDividendRate,
    annualDividendYield,
  };
}

/**
 * Fetch beta from Yahoo Finance.
 */
export async function fetchBeta(ticker: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.quoteSummary?.result?.[0]?.defaultKeyStatistics?.beta?.raw ?? null;
  } catch {
    return null;
  }
}
