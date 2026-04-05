import { NextResponse } from "next/server";
import { slugToSector, SECTOR_ETFS } from "@/lib/sectors";

export interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

// Top 10 holdings for each sector ETF (as of early 2026, sourced from fund factsheets)
const SECTOR_HOLDINGS: Record<string, Holding[]> = {
  XLK: [
    { symbol: "AAPL", name: "Apple Inc.", weight: 15.59 },
    { symbol: "MSFT", name: "Microsoft Corp.", weight: 14.68 },
    { symbol: "NVDA", name: "NVIDIA Corp.", weight: 14.42 },
    { symbol: "AVGO", name: "Broadcom Inc.", weight: 5.29 },
    { symbol: "CRM", name: "Salesforce Inc.", weight: 3.07 },
    { symbol: "ORCL", name: "Oracle Corp.", weight: 2.97 },
    { symbol: "AMD", name: "Advanced Micro Devices", weight: 2.52 },
    { symbol: "CSCO", name: "Cisco Systems Inc.", weight: 2.35 },
    { symbol: "ACN", name: "Accenture plc", weight: 2.30 },
    { symbol: "IBM", name: "IBM Corp.", weight: 2.12 },
  ],
  XLF: [
    { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", weight: 13.68 },
    { symbol: "JPM", name: "JPMorgan Chase & Co.", weight: 10.58 },
    { symbol: "V", name: "Visa Inc.", weight: 7.95 },
    { symbol: "MA", name: "Mastercard Inc.", weight: 6.75 },
    { symbol: "BAC", name: "Bank of America Corp.", weight: 4.23 },
    { symbol: "WFC", name: "Wells Fargo & Co.", weight: 3.36 },
    { symbol: "GS", name: "Goldman Sachs Group", weight: 2.88 },
    { symbol: "SPGI", name: "S&P Global Inc.", weight: 2.65 },
    { symbol: "AXP", name: "American Express Co.", weight: 2.54 },
    { symbol: "MS", name: "Morgan Stanley", weight: 2.49 },
  ],
  XLU: [
    { symbol: "NEE", name: "NextEra Energy Inc.", weight: 14.07 },
    { symbol: "SO", name: "Southern Company", weight: 8.20 },
    { symbol: "DUK", name: "Duke Energy Corp.", weight: 7.45 },
    { symbol: "CEG", name: "Constellation Energy", weight: 5.89 },
    { symbol: "SRE", name: "Sempra", weight: 4.26 },
    { symbol: "AEP", name: "American Electric Power", weight: 3.99 },
    { symbol: "D", name: "Dominion Energy Inc.", weight: 3.72 },
    { symbol: "PCG", name: "PG&E Corp.", weight: 3.44 },
    { symbol: "VST", name: "Vistra Corp.", weight: 3.25 },
    { symbol: "EXC", name: "Exelon Corp.", weight: 3.16 },
  ],
  XLP: [
    { symbol: "PG", name: "Procter & Gamble Co.", weight: 14.25 },
    { symbol: "COST", name: "Costco Wholesale Corp.", weight: 13.10 },
    { symbol: "WMT", name: "Walmart Inc.", weight: 10.06 },
    { symbol: "KO", name: "Coca-Cola Company", weight: 8.68 },
    { symbol: "PEP", name: "PepsiCo Inc.", weight: 7.28 },
    { symbol: "PM", name: "Philip Morris International", weight: 4.93 },
    { symbol: "MDLZ", name: "Mondelez International", weight: 3.42 },
    { symbol: "MO", name: "Altria Group Inc.", weight: 3.24 },
    { symbol: "CL", name: "Colgate-Palmolive Co.", weight: 3.15 },
    { symbol: "TGT", name: "Target Corp.", weight: 2.32 },
  ],
  XLY: [
    { symbol: "AMZN", name: "Amazon.com Inc.", weight: 22.28 },
    { symbol: "TSLA", name: "Tesla Inc.", weight: 14.85 },
    { symbol: "HD", name: "Home Depot Inc.", weight: 8.72 },
    { symbol: "MCD", name: "McDonald's Corp.", weight: 4.84 },
    { symbol: "LOW", name: "Lowe's Companies Inc.", weight: 3.77 },
    { symbol: "BKNG", name: "Booking Holdings Inc.", weight: 3.64 },
    { symbol: "TJX", name: "TJX Companies Inc.", weight: 3.28 },
    { symbol: "SBUX", name: "Starbucks Corp.", weight: 2.92 },
    { symbol: "NKE", name: "Nike Inc.", weight: 2.36 },
    { symbol: "CMG", name: "Chipotle Mexican Grill", weight: 1.89 },
  ],
  XLI: [
    { symbol: "GE", name: "GE Aerospace", weight: 5.01 },
    { symbol: "CAT", name: "Caterpillar Inc.", weight: 4.76 },
    { symbol: "RTX", name: "RTX Corp.", weight: 4.26 },
    { symbol: "UNP", name: "Union Pacific Corp.", weight: 3.91 },
    { symbol: "HON", name: "Honeywell International", weight: 3.51 },
    { symbol: "ETN", name: "Eaton Corporation", weight: 3.32 },
    { symbol: "DE", name: "Deere & Company", weight: 3.14 },
    { symbol: "BA", name: "Boeing Company", weight: 2.75 },
    { symbol: "LMT", name: "Lockheed Martin Corp.", weight: 2.69 },
    { symbol: "ADP", name: "Automatic Data Processing", weight: 2.55 },
  ],
  XLV: [
    { symbol: "LLY", name: "Eli Lilly and Co.", weight: 11.65 },
    { symbol: "UNH", name: "UnitedHealth Group", weight: 9.18 },
    { symbol: "JNJ", name: "Johnson & Johnson", weight: 6.82 },
    { symbol: "ABBV", name: "AbbVie Inc.", weight: 6.47 },
    { symbol: "MRK", name: "Merck & Co. Inc.", weight: 5.24 },
    { symbol: "TMO", name: "Thermo Fisher Scientific", weight: 4.35 },
    { symbol: "ABT", name: "Abbott Laboratories", weight: 3.87 },
    { symbol: "ISRG", name: "Intuitive Surgical Inc.", weight: 3.25 },
    { symbol: "DHR", name: "Danaher Corporation", weight: 2.96 },
    { symbol: "PFE", name: "Pfizer Inc.", weight: 2.81 },
  ],
  XLE: [
    { symbol: "XOM", name: "Exxon Mobil Corp.", weight: 22.75 },
    { symbol: "CVX", name: "Chevron Corp.", weight: 16.25 },
    { symbol: "COP", name: "ConocoPhillips", weight: 7.33 },
    { symbol: "EOG", name: "EOG Resources Inc.", weight: 4.50 },
    { symbol: "SLB", name: "Schlumberger Ltd.", weight: 4.24 },
    { symbol: "MPC", name: "Marathon Petroleum Corp.", weight: 3.84 },
    { symbol: "WMB", name: "Williams Companies Inc.", weight: 3.65 },
    { symbol: "PSX", name: "Phillips 66", weight: 3.39 },
    { symbol: "PXD", name: "Pioneer Natural Resources", weight: 3.12 },
    { symbol: "OKE", name: "ONEOK Inc.", weight: 2.89 },
  ],
  XLB: [
    { symbol: "LIN", name: "Linde plc", weight: 17.86 },
    { symbol: "SHW", name: "Sherwin-Williams Co.", weight: 8.32 },
    { symbol: "FCX", name: "Freeport-McMoRan Inc.", weight: 6.42 },
    { symbol: "APD", name: "Air Products & Chemicals", weight: 5.63 },
    { symbol: "ECL", name: "Ecolab Inc.", weight: 5.15 },
    { symbol: "NEM", name: "Newmont Corp.", weight: 4.72 },
    { symbol: "CTVA", name: "Corteva Inc.", weight: 4.25 },
    { symbol: "DD", name: "DuPont de Nemours Inc.", weight: 3.87 },
    { symbol: "DOW", name: "Dow Inc.", weight: 3.45 },
    { symbol: "NUE", name: "Nucor Corp.", weight: 3.18 },
  ],
  XLC: [
    { symbol: "META", name: "Meta Platforms Inc.", weight: 22.41 },
    { symbol: "GOOGL", name: "Alphabet Inc. Class A", weight: 12.13 },
    { symbol: "GOOG", name: "Alphabet Inc. Class C", weight: 10.25 },
    { symbol: "NFLX", name: "Netflix Inc.", weight: 5.48 },
    { symbol: "T", name: "AT&T Inc.", weight: 4.85 },
    { symbol: "DIS", name: "Walt Disney Company", weight: 4.32 },
    { symbol: "CMCSA", name: "Comcast Corp.", weight: 3.97 },
    { symbol: "VZ", name: "Verizon Communications", weight: 3.72 },
    { symbol: "TMUS", name: "T-Mobile US Inc.", weight: 3.56 },
    { symbol: "EA", name: "Electronic Arts Inc.", weight: 1.92 },
  ],
  XLRE: [
    { symbol: "PLD", name: "Prologis Inc.", weight: 11.12 },
    { symbol: "AMT", name: "American Tower Corp.", weight: 8.76 },
    { symbol: "EQIX", name: "Equinix Inc.", weight: 7.95 },
    { symbol: "WELL", name: "Welltower Inc.", weight: 5.43 },
    { symbol: "SPG", name: "Simon Property Group", weight: 4.82 },
    { symbol: "DLR", name: "Digital Realty Trust", weight: 4.56 },
    { symbol: "PSA", name: "Public Storage", weight: 4.32 },
    { symbol: "O", name: "Realty Income Corp.", weight: 4.15 },
    { symbol: "CCI", name: "Crown Castle Inc.", weight: 3.45 },
    { symbol: "VICI", name: "VICI Properties Inc.", weight: 2.87 },
  ],
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: slug } = await params;
  const sector = slugToSector(slug);

  if (!sector) {
    return NextResponse.json({ error: "Unknown sector" }, { status: 404 });
  }

  const ticker = SECTOR_ETFS[sector];
  const holdings = SECTOR_HOLDINGS[ticker] ?? [];

  return NextResponse.json({ sector, ticker, holdings });
}
