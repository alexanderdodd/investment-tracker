import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades, simDividends } from "@/db/schema";
import { auth } from "@/auth";

// GET — portfolio detail with positions, trades, dividends
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const portfolios = await db
    .select()
    .from(simPortfolios)
    .where(eq(simPortfolios.id, id));

  if (portfolios.length === 0 || portfolios[0].userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const portfolio = portfolios[0];

  // Get all trades
  const trades = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.portfolioId, id))
    .orderBy(desc(simTrades.executedAt));

  // Get all dividends
  const dividends = await db
    .select()
    .from(simDividends)
    .where(eq(simDividends.portfolioId, id))
    .orderBy(desc(simDividends.recordedAt));

  // Compute positions (aggregate by ticker)
  const positionMap: Record<string, {
    ticker: string;
    companyName: string;
    shares: number;
    totalCost: number;
    totalFees: number;
    avgCostBasis: number;
    firstBuyDate: string;
    sectorEtfTicker: string | null;
    spyPriceAtFirstBuy: number | null;
    sectorEtfPriceAtFirstBuy: number | null;
  }> = {};

  for (const trade of trades) {
    if (trade.tradeType !== "buy") continue;
    if (!positionMap[trade.ticker]) {
      positionMap[trade.ticker] = {
        ticker: trade.ticker,
        companyName: trade.companyName,
        shares: 0,
        totalCost: 0,
        totalFees: 0,
        avgCostBasis: 0,
        firstBuyDate: trade.executedAt.toISOString(),
        sectorEtfTicker: trade.sectorEtfTicker,
        spyPriceAtFirstBuy: trade.spyPriceAtTrade,
        sectorEtfPriceAtFirstBuy: trade.sectorEtfPriceAtTrade,
      };
    }
    const pos = positionMap[trade.ticker];
    pos.shares += trade.shares;
    pos.totalCost += trade.totalCost;
    pos.totalFees += trade.fees;
    pos.avgCostBasis = pos.totalCost / pos.shares;
  }

  // Sum dividends per ticker
  const dividendsByTicker: Record<string, number> = {};
  for (const d of dividends) {
    dividendsByTicker[d.ticker] = (dividendsByTicker[d.ticker] ?? 0) + d.totalAmount;
  }

  const positions = Object.values(positionMap).map((pos) => ({
    ...pos,
    dividendsReceived: dividendsByTicker[pos.ticker] ?? 0,
  }));

  const totalInvested = positions.reduce((sum, p) => sum + p.totalCost, 0);
  const totalFees = positions.reduce((sum, p) => sum + p.totalFees, 0);
  const totalDividends = dividends.reduce((sum, d) => sum + d.totalAmount, 0);
  const cashRemaining = portfolio.startingCash - totalInvested;

  return NextResponse.json({
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      startingCash: portfolio.startingCash,
      feeModel: portfolio.feeModel,
      createdAt: portfolio.createdAt.toISOString(),
    },
    summary: {
      cashRemaining,
      totalInvested,
      totalFees,
      totalDividends,
      positionCount: positions.length,
      tradeCount: trades.length,
    },
    positions,
    trades: trades.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      companyName: t.companyName,
      tradeType: t.tradeType,
      shares: t.shares,
      pricePerShare: t.pricePerShare,
      fees: t.fees,
      totalCost: t.totalCost,
      notes: t.notes,
      executedAt: t.executedAt.toISOString(),
    })),
    dividends: dividends.map((d) => ({
      id: d.id,
      ticker: d.ticker,
      exDate: d.exDate,
      amountPerShare: d.amountPerShare,
      sharesHeld: d.sharesHeld,
      totalAmount: d.totalAmount,
    })),
  });
}

// DELETE — delete portfolio
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const portfolios = await db
    .select()
    .from(simPortfolios)
    .where(eq(simPortfolios.id, id));

  if (portfolios.length === 0 || portfolios[0].userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(simPortfolios).where(eq(simPortfolios.id, id));
  return NextResponse.json({ deleted: true });
}
