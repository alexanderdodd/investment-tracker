import { NextResponse } from "next/server";
import { normalizeCurrency } from "@/lib/currency";

export const revalidate = 60;

// GET: fetch current stock price + optional chart data
// ?chart=true&range=5y returns historical prices for charting
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const url = new URL(request.url);
  const wantChart = url.searchParams.get("chart") === "true";
  const range = url.searchParams.get("range") ?? "1d";

  // Map range to Yahoo interval
  const intervalMap: Record<string, string> = {
    "1d": "5m", "5d": "15m", "1mo": "1d", "3mo": "1d",
    "1y": "1d", "5y": "1wk", "10y": "1mo", "max": "1mo",
  };
  const interval = intervalMap[range] ?? "1d";

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Price unavailable" }, { status: 502 });
    }

    const json = await res.json();
    const result = json.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta?.regularMarketPrice) {
      return NextResponse.json({ error: "No price data" }, { status: 404 });
    }

    // Yahoo quotes some markets (e.g. UK) in a minor unit like pence (GBp).
    // Normalise everything to the major unit (GBP) so prices, chart closes and
    // downstream sticker math all share one consistent currency.
    const { currency, divisor } = normalizeCurrency(meta.currency);
    const scale = (v: number | null | undefined) =>
      v === null || v === undefined ? null : v / divisor;

    const response: Record<string, unknown> = {
      ticker: upper,
      price: scale(meta.regularMarketPrice),
      previousClose: scale(meta.chartPreviousClose ?? meta.previousClose),
      timestamp: new Date((meta.regularMarketTime ?? 0) * 1000).toISOString(),
      currency,
      exchange: meta.exchangeName ?? "",
      fiftyTwoWeekHigh: scale(meta.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: scale(meta.fiftyTwoWeekLow),
    };

    if (wantChart && result?.timestamp && result?.indicators?.quote?.[0]?.close) {
      const timestamps: number[] = result.timestamp;
      const q = result.indicators.quote[0];
      const closes: (number | null)[] = q.close;
      const highs: (number | null)[] = q.high ?? [];
      const lows: (number | null)[] = q.low ?? [];
      response.chart = timestamps.map((ts: number, i: number) => ({
        ts,
        close: scale(closes[i]),
        // High/low included for indicators (e.g. Stochastic); scaled the same
        high: scale(highs[i]) ?? scale(closes[i]),
        low: scale(lows[i]) ?? scale(closes[i]),
      })).filter((p: { close: number | null }) => p.close !== null);
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
