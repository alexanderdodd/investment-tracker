/**
 * Company profile (name, business description) from Yahoo Finance.
 * Used by the /api/stocks/[ticker]/profile route and the Meaning
 * extraction pipeline.
 */

import { getYahooCrumb } from "./stock-metrics";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface StockProfile {
  ticker: string;
  name: string | null;
  description: string | null;
  website: string | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  city: string | null;
  country: string | null;
}

export async function fetchCompanyProfile(ticker: string): Promise<StockProfile> {
  const upperTicker = ticker.toUpperCase();
  const empty: StockProfile = {
    ticker: upperTicker,
    name: null,
    description: null,
    website: null,
    sector: null,
    industry: null,
    employees: null,
    city: null,
    country: null,
  };

  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${upperTicker}?modules=assetProfile,price&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (!res.ok) return empty;
    const json = await res.json();
    const r = json.quoteSummary?.result?.[0];
    const profile = r?.assetProfile;
    const price = r?.price;

    return {
      ticker: upperTicker,
      name: price?.longName ?? price?.shortName ?? null,
      description: profile?.longBusinessSummary ?? null,
      website: profile?.website ?? null,
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      employees: profile?.fullTimeEmployees ?? null,
      city: profile?.city ?? null,
      country: profile?.country ?? null,
    };
  } catch {
    return empty;
  }
}
