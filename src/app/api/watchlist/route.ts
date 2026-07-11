import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { watchlistItems } from "@/db/schema";
import { fetchYahooSector } from "@/lib/stock-metrics";
import { SECTORS } from "@/lib/sectors";

const VALID_SECTORS = new Set<string>(SECTORS);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const items = await db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, session.user.id))
    .orderBy(desc(watchlistItems.addedAt));

  // Backfill items with missing or non-GICS sector
  const toFix = items.filter((i) => !i.sector || !VALID_SECTORS.has(i.sector));
  if (toFix.length > 0) {
    await Promise.all(
      toFix.map(async (item) => {
        try {
          const sector = await fetchYahooSector(item.ticker);
          if (sector) {
            item.sector = sector;
            await db
              .update(watchlistItems)
              .set({ sector })
              .where(eq(watchlistItems.id, item.id));
          }
        } catch { /* ignore — will retry next load */ }
      })
    );
  }

  return NextResponse.json({
    items: items.map((item) => ({
      ticker: item.ticker,
      companyName: item.companyName,
      sector: item.sector,
      status: item.status,
      addedAt: item.addedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ticker, companyName, sector } = body;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const db = getDb();

  // Check if already watching
  const existing = await db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, session.user.id))
    .then((rows) => rows.find((r) => r.ticker === ticker.toUpperCase()));

  if (existing) {
    return NextResponse.json({ status: "already_watching" });
  }

  // Fetch GICS sector from Yahoo Finance for accurate sector classification
  const resolvedSector = await fetchYahooSector(ticker.toUpperCase()).catch(() => null);

  await db.insert(watchlistItems).values({
    userId: session.user.id,
    ticker: ticker.toUpperCase(),
    companyName: companyName || null,
    sector: resolvedSector || sector || null,
  });

  return NextResponse.json({ status: "added" });
}
