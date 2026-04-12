import { NextResponse } from "next/server";

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
    "1y": "1d", "5y": "1wk",
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

    const response: Record<string, unknown> = {
      ticker: upper,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      timestamp: new Date((meta.regularMarketTime ?? 0) * 1000).toISOString(),
      currency: meta.currency ?? "USD",
      exchange: meta.exchangeName ?? "",
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    };

    if (wantChart && result?.timestamp && result?.indicators?.quote?.[0]?.close) {
      const timestamps: number[] = result.timestamp;
      const closes: (number | null)[] = result.indicators.quote[0].close;
      response.chart = timestamps.map((ts: number, i: number) => ({
        ts,
        close: closes[i],
      })).filter((p: { close: number | null }) => p.close !== null);
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
