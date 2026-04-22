import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades } from "@/db/schema";
import { auth } from "@/auth";
import { calculateFee, type FeeModel } from "@/lib/sim-fees";
import { getYahooCrumb } from "@/lib/stock-metrics";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/** Fetch current price for a ticker from Yahoo Finance */
async function fetchLivePrice(
  ticker: string,
  crumb: string,
  cookie: string
): Promise<number | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw ?? null;
}

/** Fetch sector ETF ticker for a stock from Yahoo */
async function fetchSectorInfo(
  ticker: string,
  crumb: string,
  cookie: string
): Promise<{ sector: string; etfTicker: string | null } | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const sector = json.quoteSummary?.result?.[0]?.assetProfile?.sector;
  if (!sector) return null;

  const SECTOR_ETF: Record<string, string> = {
    Technology: "XLK", "Financial Services": "XLF", "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP", Healthcare: "XLV", "Communication Services": "XLC",
    Industrials: "XLI", Energy: "XLE", Utilities: "XLU",
    "Basic Materials": "XLB", "Real Estate": "XLRE",
  };

  return { sector, etfTicker: SECTOR_ETF[sector] ?? null };
}

// POST — execute a simulated trade
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: portfolioId } = await params;
  const db = getDb();

  // Verify portfolio ownership
  const portfolios = await db
    .select()
    .from(simPortfolios)
    .where(eq(simPortfolios.id, portfolioId));

  if (portfolios.length === 0 || portfolios[0].userId !== session.user.id) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  const portfolio = portfolios[0];
  const body = await request.json();
  const { ticker, companyName, shares, notes } = body;

  if (!ticker || typeof shares !== "number" || shares <= 0) {
    return NextResponse.json({ error: "Ticker and positive shares required" }, { status: 400 });
  }

  // Fetch live prices
  const { crumb, cookie } = await getYahooCrumb();
  const [stockPrice, spyPrice] = await Promise.all([
    fetchLivePrice(ticker, crumb, cookie),
    fetchLivePrice("SPY", crumb, cookie),
  ]);

  if (!stockPrice) {
    return NextResponse.json({ error: `Could not fetch price for ${ticker}` }, { status: 400 });
  }

  // Fetch sector ETF info and price
  const sectorInfo = await fetchSectorInfo(ticker, crumb, cookie);
  let sectorEtfPrice: number | null = null;
  if (sectorInfo?.etfTicker) {
    sectorEtfPrice = await fetchLivePrice(sectorInfo.etfTicker, crumb, cookie);
  }

  // Calculate fees
  const fees = calculateFee(portfolio.feeModel as FeeModel, shares, stockPrice);
  const totalCost = shares * stockPrice + fees;

  // Check cash available
  const existingTrades = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.portfolioId, portfolioId));

  const totalSpent = existingTrades
    .filter((t) => t.tradeType === "buy")
    .reduce((sum, t) => sum + t.totalCost, 0);

  const cashAvailable = portfolio.startingCash - totalSpent;

  if (totalCost > cashAvailable) {
    return NextResponse.json({
      error: "Insufficient cash",
      cashAvailable,
      totalCost,
      shortfall: totalCost - cashAvailable,
    }, { status: 400 });
  }

  // Execute trade
  const tradeId = crypto.randomUUID();
  await db.insert(simTrades).values({
    id: tradeId,
    portfolioId,
    ticker,
    companyName: companyName ?? ticker,
    tradeType: "buy",
    shares,
    pricePerShare: stockPrice,
    fees,
    totalCost,
    spyPriceAtTrade: spyPrice,
    sectorEtfTicker: sectorInfo?.etfTicker ?? null,
    sectorEtfPriceAtTrade: sectorEtfPrice,
    notes: notes ?? null,
  });

  return NextResponse.json({
    trade: {
      id: tradeId,
      ticker,
      shares,
      pricePerShare: stockPrice,
      fees,
      totalCost,
      cashRemaining: cashAvailable - totalCost,
      spyPriceAtTrade: spyPrice,
      sectorEtfTicker: sectorInfo?.etfTicker,
      sectorEtfPriceAtTrade: sectorEtfPrice,
    },
  });
}
