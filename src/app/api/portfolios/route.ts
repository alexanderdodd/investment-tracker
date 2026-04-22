import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { simPortfolios, simTrades } from "@/db/schema";
import { auth } from "@/auth";

// POST — create portfolio
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, startingCash, feeModel } = body;

  if (!name || typeof startingCash !== "number" || startingCash <= 0) {
    return NextResponse.json({ error: "Name and positive startingCash required" }, { status: 400 });
  }

  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(simPortfolios).values({
    id,
    userId: session.user.id,
    name,
    description: description ?? null,
    startingCash,
    feeModel: feeModel ?? "ibkr_pro",
  });

  return NextResponse.json({ id, name, startingCash, feeModel: feeModel ?? "ibkr_pro" });
}

// GET — list user's portfolios with summary stats
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const portfolios = await db
    .select()
    .from(simPortfolios)
    .where(eq(simPortfolios.userId, session.user.id));

  // Get trades for each portfolio to compute summary
  const result = await Promise.all(
    portfolios.map(async (p) => {
      const trades = await db
        .select()
        .from(simTrades)
        .where(eq(simTrades.portfolioId, p.id));

      const totalInvested = trades
        .filter((t) => t.tradeType === "buy")
        .reduce((sum, t) => sum + t.totalCost, 0);

      const cashRemaining = p.startingCash - totalInvested;
      const positionCount = new Set(trades.map((t) => t.ticker)).size;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        startingCash: p.startingCash,
        feeModel: p.feeModel,
        cashRemaining,
        totalInvested,
        positionCount,
        tradeCount: trades.length,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ portfolios: result });
}
