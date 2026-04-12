import { NextResponse } from "next/server";

export const revalidate = 60; // Cache for 60 seconds

// GET: fetch current stock price from Yahoo Finance chart API
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Price unavailable" }, { status: 502 });
    }

    const json = await res.json();
    const meta = json.chart?.result?.[0]?.meta;

    if (!meta?.regularMarketPrice) {
      return NextResponse.json({ error: "No price data" }, { status: 404 });
    }

    return NextResponse.json({
      ticker: upper,
      price: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      timestamp: new Date((meta.regularMarketTime ?? 0) * 1000).toISOString(),
      currency: meta.currency ?? "USD",
      exchange: meta.exchangeName ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
