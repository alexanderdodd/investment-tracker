import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades, simDividends } from "@/db/schema";
import { auth } from "@/auth";

// POST — duplicate a portfolio (deep copy of trades + dividends).
export async function POST(
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

  const source = portfolios[0];

  // Optional custom name for the copy; defaults to "<name> (copy)".
  let name: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim();
  } catch {
    // No body — use the default name.
  }

  const [trades, dividends] = await Promise.all([
    db.select().from(simTrades).where(eq(simTrades.portfolioId, id)),
    db.select().from(simDividends).where(eq(simDividends.portfolioId, id)),
  ]);

  const newId = crypto.randomUUID();
  await db.insert(simPortfolios).values({
    id: newId,
    userId: session.user.id,
    name: name ?? `${source.name} (copy)`,
    description: source.description,
    startingCash: source.startingCash,
    feeModel: source.feeModel,
  });

  // Copy trades with fresh ids, preserving every value (prices, fees, realized
  // gains, benchmark levels, notes, and original execution timestamps).
  if (trades.length > 0) {
    await db.insert(simTrades).values(
      trades.map((t) => ({
        id: crypto.randomUUID(),
        portfolioId: newId,
        ticker: t.ticker,
        companyName: t.companyName,
        tradeType: t.tradeType,
        shares: t.shares,
        pricePerShare: t.pricePerShare,
        fees: t.fees,
        totalCost: t.totalCost,
        realizedGain: t.realizedGain,
        spyPriceAtTrade: t.spyPriceAtTrade,
        sectorEtfTicker: t.sectorEtfTicker,
        sectorEtfPriceAtTrade: t.sectorEtfPriceAtTrade,
        notes: t.notes,
        executedAt: t.executedAt,
      }))
    );
  }

  if (dividends.length > 0) {
    await db.insert(simDividends).values(
      dividends.map((d) => ({
        id: crypto.randomUUID(),
        portfolioId: newId,
        ticker: d.ticker,
        exDate: d.exDate,
        amountPerShare: d.amountPerShare,
        sharesHeld: d.sharesHeld,
        totalAmount: d.totalAmount,
        recordedAt: d.recordedAt,
      }))
    );
  }

  return NextResponse.json({ id: newId, name: name ?? `${source.name} (copy)` });
}
