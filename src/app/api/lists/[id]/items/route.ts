import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { stockLists, listItems } from "@/db/schema";
import { fetchYahooSector } from "@/lib/stock-metrics";

// POST /api/lists/[id]/items { ticker, companyName?, sector?, note? }
// Add a stock to the list. Idempotent per (list, ticker): if it's already there
// we leave it but apply the note when one is supplied.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const db = getDb();
  const list = await db
    .select()
    .from(stockLists)
    .where(and(eq(stockLists.userId, userId), eq(stockLists.id, id)))
    .then((rows) => rows[0] ?? null);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    ticker?: string;
    companyName?: string;
    sector?: string;
    note?: string;
  } | null;
  const ticker = String(body?.ticker ?? "").trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const existing = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.userId, userId), eq(listItems.listId, id)))
    .then((rows) => rows.find((r) => r.ticker === ticker) ?? null);

  if (existing) {
    if (note !== null) {
      await db.update(listItems).set({ note }).where(eq(listItems.id, existing.id));
    }
    return NextResponse.json({ status: "already_added" });
  }

  const resolvedSector = await fetchYahooSector(ticker).catch(() => null);
  await db.insert(listItems).values({
    userId,
    listId: id,
    ticker,
    companyName: body?.companyName || null,
    sector: resolvedSector || body?.sector || null,
    note,
  });

  return NextResponse.json({ status: "added" });
}
