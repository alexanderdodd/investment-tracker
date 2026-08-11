import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { listItems } from "@/db/schema";
import { fetchYahooSector } from "@/lib/stock-metrics";
import { SECTORS } from "@/lib/sectors";
import { getOrCreateDefaultList } from "@/lib/lists";

// Compatibility layer over the user's protected default ("Watchlist") list, so
// the screener star and other legacy callers keep working after the move to
// multiple lists. New UI should prefer /api/lists.
const VALID_SECTORS = new Set<string>(SECTORS);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const list = await getOrCreateDefaultList(db, session.user.id);
  if (!list) return NextResponse.json({ items: [] });

  const items = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.userId, session.user.id), eq(listItems.listId, list.id)))
    .orderBy(desc(listItems.addedAt));

  const toFix = items.filter((i) => !i.sector || !VALID_SECTORS.has(i.sector));
  if (toFix.length > 0) {
    await Promise.all(
      toFix.map(async (item) => {
        try {
          const sector = await fetchYahooSector(item.ticker);
          if (sector) {
            item.sector = sector;
            await db.update(listItems).set({ sector }).where(eq(listItems.id, item.id));
          }
        } catch {
          /* ignore — retry next load */
        }
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
  const list = await getOrCreateDefaultList(db, session.user.id);
  if (!list) return NextResponse.json({ error: "Could not resolve watchlist" }, { status: 500 });

  const upper = ticker.toUpperCase();
  const existing = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.userId, session.user.id), eq(listItems.listId, list.id)))
    .then((rows) => rows.find((r) => r.ticker === upper));
  if (existing) {
    return NextResponse.json({ status: "already_watching" });
  }

  const resolvedSector = await fetchYahooSector(upper).catch(() => null);
  await db.insert(listItems).values({
    userId: session.user.id,
    listId: list.id,
    ticker: upper,
    companyName: companyName || null,
    sector: resolvedSector || sector || null,
  });

  return NextResponse.json({ status: "added" });
}
