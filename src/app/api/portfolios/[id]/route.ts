import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades, simDividends } from "@/db/schema";
import { auth } from "@/auth";
import { replayTrades, type TradeRecord } from "@/lib/sim-lots";
import { calculateCapitalGainsTax } from "@/lib/german-tax";

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

  // Compute positions via FIFO replay (accounts for sells).
  const tradeRecords: TradeRecord[] = trades.map((t) => ({
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
  const replay = replayTrades(tradeRecords);

  // Sum dividends per ticker
  const dividendsByTicker: Record<string, number> = {};
  for (const d of dividends) {
    dividendsByTicker[d.ticker] = (dividendsByTicker[d.ticker] ?? 0) + d.totalAmount;
  }

  const positions = replay.positions.map((pos) => ({
    ...pos,
    dividendsReceived: dividendsByTicker[pos.ticker] ?? 0,
  }));

  // Cash: starting − buys + sell proceeds (sell.totalCost stores net proceeds).
  const totalSpent = trades
    .filter((t) => t.tradeType === "buy")
    .reduce((sum, t) => sum + t.totalCost, 0);
  const totalProceeds = trades
    .filter((t) => t.tradeType === "sell")
    .reduce((sum, t) => sum + t.totalCost, 0);
  const cashRemaining = portfolio.startingCash - totalSpent + totalProceeds;

  const totalInvested = positions.reduce((sum, p) => sum + p.totalCost, 0);
  const totalDividends = dividends.reduce((sum, d) => sum + d.totalAmount, 0);

  // Realized gains + German capital-gains tax, grouped by calendar year.
  const yearMap: Record<number, { realizedGains: number; realizedLosses: number }> = {};
  let realizedTotal = 0;
  for (const t of trades) {
    if (t.tradeType !== "sell") continue;
    const gain = replay.realizedByTrade[t.id] ?? t.realizedGain ?? 0;
    realizedTotal += gain;
    const year = t.executedAt.getUTCFullYear();
    if (!yearMap[year]) yearMap[year] = { realizedGains: 0, realizedLosses: 0 };
    if (gain >= 0) yearMap[year].realizedGains += gain;
    else yearMap[year].realizedLosses += gain;
  }

  const taxByYear = Object.entries(yearMap)
    .map(([year, { realizedGains, realizedLosses }]) => ({
      year: Number(year),
      ...calculateCapitalGainsTax(realizedGains, realizedLosses),
    }))
    .sort((a, b) => b.year - a.year);

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
      totalDividends,
      realizedGains: realizedTotal,
      positionCount: positions.length,
      tradeCount: trades.length,
    },
    taxByYear,
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
      realizedGain:
        t.tradeType === "sell"
          ? replay.realizedByTrade[t.id] ?? t.realizedGain ?? null
          : null,
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

// PATCH — rename a portfolio (`name`) and/or adjust its cash: `addCash` tops
// up contributed capital, `setCash` pins cash remaining to an exact figure.
export async function PATCH(
  request: Request,
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
  const body = await request.json();

  const updates: { name?: string; startingCash?: number } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length === 0) {
      return NextResponse.json({ error: "A portfolio name is required" }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    }
    updates.name = name;
  }

  if (body.setCash !== undefined) {
    const setCash = Number(body.setCash);
    if (!Number.isFinite(setCash) || setCash < 0) {
      return NextResponse.json({ error: "Cash remaining must be zero or more" }, { status: 400 });
    }
    // Cash remaining = startingCash − buys + sell proceeds, so pinning it to a
    // target means backing the trade flow out of the target.
    const trades = await db
      .select()
      .from(simTrades)
      .where(eq(simTrades.portfolioId, id));
    const netTradeFlow = trades.reduce(
      (sum, t) => sum + (t.tradeType === "buy" ? -t.totalCost : t.totalCost),
      0
    );
    updates.startingCash = setCash - netTradeFlow;
  } else if (body.addCash !== undefined) {
    const addCash = Number(body.addCash);
    if (!Number.isFinite(addCash) || addCash <= 0) {
      return NextResponse.json({ error: "A positive cash amount is required" }, { status: 400 });
    }
    updates.startingCash = portfolio.startingCash + addCash;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(simPortfolios).set(updates).where(eq(simPortfolios.id, id));

  return NextResponse.json({
    name: updates.name ?? portfolio.name,
    startingCash: updates.startingCash ?? portfolio.startingCash,
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
