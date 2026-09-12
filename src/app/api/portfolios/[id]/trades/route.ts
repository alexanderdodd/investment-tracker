import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades } from "@/db/schema";
import { auth } from "@/auth";
import { calculateFee, type FeeModel } from "@/lib/sim-fees";
import { getYahooCrumb } from "@/lib/stock-metrics";
import { computeSaleRealizedGain, type TradeRecord } from "@/lib/sim-lots";

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
  const tradeType: "buy" | "sell" = body.tradeType === "sell" ? "sell" : "buy";

  if (!ticker || typeof shares !== "number" || shares <= 0) {
    return NextResponse.json({ error: "Ticker and positive shares required" }, { status: 400 });
  }

  // Existing trades — used for cash checks and FIFO realized-gain computation.
  const existingRows = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.portfolioId, portfolioId));

  const existingTrades: TradeRecord[] = existingRows.map((t) => ({
    id: t.id,
    ticker: t.ticker,
    companyName: t.companyName,
    tradeType: t.tradeType,
    shares: t.shares,
    pricePerShare: t.pricePerShare,
    fees: t.fees,
    totalCost: t.totalCost,
    executedAt: t.executedAt,
    spyPriceAtTrade: t.spyPriceAtTrade,
    sectorEtfTicker: t.sectorEtfTicker,
    sectorEtfPriceAtTrade: t.sectorEtfPriceAtTrade,
  }));

  // Fetch live prices
  const { crumb, cookie } = await getYahooCrumb();
  const [stockPrice, spyPrice] = await Promise.all([
    fetchLivePrice(ticker, crumb, cookie),
    fetchLivePrice("SPY", crumb, cookie),
  ]);

  // Optional custom buy price — lets you backfill a position you already own,
  // bought earlier at a price different from the current market price.
  const customBuyPrice =
    tradeType === "buy" &&
    typeof body.pricePerShare === "number" &&
    body.pricePerShare > 0
      ? body.pricePerShare
      : null;

  // Sells always execute at the live price; buys may use a custom price.
  const effectivePrice = tradeType === "buy" ? customBuyPrice ?? stockPrice : stockPrice;

  if (!effectivePrice) {
    return NextResponse.json({ error: `Could not fetch price for ${ticker}` }, { status: 400 });
  }

  // Fetch sector ETF info and price
  const sectorInfo = await fetchSectorInfo(ticker, crumb, cookie);
  let sectorEtfPrice: number | null = null;
  if (sectorInfo?.etfTicker) {
    sectorEtfPrice = await fetchLivePrice(sectorInfo.etfTicker, crumb, cookie);
  }

  // Calculate fees on the effective execution price
  const fees = calculateFee(portfolio.feeModel as FeeModel, shares, effectivePrice);

  const totalSpent = existingTrades
    .filter((t) => t.tradeType === "buy")
    .reduce((sum, t) => sum + t.totalCost, 0);
  const totalProceeds = existingTrades
    .filter((t) => t.tradeType === "sell")
    .reduce((sum, t) => sum + t.totalCost, 0);
  const cashAvailable = portfolio.startingCash - totalSpent + totalProceeds;

  if (tradeType === "sell") {
    // Sell: proceeds credited to cash, realized gain computed FIFO.
    const proceeds = shares * effectivePrice - fees;
    const result = computeSaleRealizedGain(existingTrades, ticker, shares, effectivePrice, fees);
    if (!result) {
      const held = existingTrades.length
        ? computeSaleRealizedGain(existingTrades, ticker, 0, effectivePrice, 0)?.sharesHeld ?? 0
        : 0;
      return NextResponse.json(
        { error: `Not enough shares to sell (holding ${held}, tried to sell ${shares})` },
        { status: 400 }
      );
    }

    const tradeId = crypto.randomUUID();
    await db.insert(simTrades).values({
      id: tradeId,
      portfolioId,
      ticker,
      companyName: companyName ?? ticker,
      tradeType: "sell",
      shares,
      pricePerShare: effectivePrice,
      fees,
      totalCost: proceeds,
      realizedGain: result.realizedGain,
      spyPriceAtTrade: spyPrice,
      sectorEtfTicker: sectorInfo?.etfTicker ?? null,
      sectorEtfPriceAtTrade: sectorEtfPrice,
      notes: notes ?? null,
    });

    return NextResponse.json({
      trade: {
        id: tradeId,
        tradeType: "sell",
        ticker,
        shares,
        pricePerShare: effectivePrice,
        fees,
        proceeds,
        realizedGain: result.realizedGain,
        cashRemaining: cashAvailable + proceeds,
      },
    });
  }

  // Buy (at the effective price — live or user-supplied)
  const totalCost = shares * effectivePrice + fees;
  if (totalCost > cashAvailable) {
    return NextResponse.json({
      error: "Insufficient cash",
      cashAvailable,
      totalCost,
      shortfall: totalCost - cashAvailable,
    }, { status: 400 });
  }

  const tradeId = crypto.randomUUID();
  await db.insert(simTrades).values({
    id: tradeId,
    portfolioId,
    ticker,
    companyName: companyName ?? ticker,
    tradeType: "buy",
    shares,
    pricePerShare: effectivePrice,
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
      tradeType: "buy",
      ticker,
      shares,
      pricePerShare: effectivePrice,
      fees,
      totalCost,
      cashRemaining: cashAvailable - totalCost,
      spyPriceAtTrade: spyPrice,
      sectorEtfTicker: sectorInfo?.etfTicker,
      sectorEtfPriceAtTrade: sectorEtfPrice,
    },
  });
}
