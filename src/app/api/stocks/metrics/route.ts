import { NextRequest, NextResponse } from "next/server";
import { fetchStockMetrics } from "@/lib/stock-metrics";

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams.get("tickers");

  if (!tickers) {
    return NextResponse.json(
      { error: "Missing tickers parameter" },
      { status: 400 }
    );
  }

  const tickerList = tickers
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30); // Cap at 30 to avoid abuse

  if (tickerList.length === 0) {
    return NextResponse.json(
      { error: "No valid tickers provided" },
      { status: 400 }
    );
  }

  const metrics = await fetchStockMetrics(tickerList);

  return NextResponse.json(metrics);
}
