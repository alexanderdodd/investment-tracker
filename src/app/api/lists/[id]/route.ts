import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { stockLists, listItems } from "@/db/schema";
import { fetchYahooSector } from "@/lib/stock-metrics";
import { SECTORS } from "@/lib/sectors";
import { isLabelColor } from "@/lib/labels";

const VALID_SECTORS = new Set<string>(SECTORS);

async function loadList(userId: string, id: string) {
  const db = getDb();
  return db
    .select()
    .from(stockLists)
    .where(and(eq(stockLists.userId, userId), eq(stockLists.id, id)))
    .then((rows) => rows[0] ?? null);
}

// GET /api/lists/[id] → list meta + its items (with lazy GICS sector backfill,
// mirroring the old watchlist behaviour).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const list = await loadList(session.user.id, id);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();
  const items = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.userId, session.user.id), eq(listItems.listId, id)))
    .orderBy(desc(listItems.addedAt));

  // Backfill items with a missing or non-GICS sector.
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
    list: { id: list.id, name: list.name, color: list.color, isDefault: list.isDefault },
    items: items.map((item) => ({
      ticker: item.ticker,
      companyName: item.companyName,
      sector: item.sector,
      note: item.note,
      status: item.status,
      addedAt: item.addedAt.toISOString(),
    })),
  });
}

// PATCH /api/lists/[id] { name?, color? } → rename/recolor. The default list is
// protected and can't be renamed.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const list = await loadList(session.user.id, id);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { name?: string; color?: string } | null;
  const patch: { name?: string; color?: string } = {};

  if (typeof body?.name === "string") {
    if (list.isDefault) {
      return NextResponse.json({ error: "The Watchlist can't be renamed" }, { status: 403 });
    }
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name can't be empty" }, { status: 400 });
    // Guard against colliding with another of the user's lists.
    const others = await getDb()
      .select()
      .from(stockLists)
      .where(eq(stockLists.userId, session.user.id));
    if (others.some((l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "You already have a list with that name" }, { status: 409 });
    }
    patch.name = name;
  }

  if (body?.color !== undefined) {
    if (!isLabelColor(body.color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    patch.color = body.color;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await getDb().update(stockLists).set(patch).where(eq(stockLists.id, id));
  return NextResponse.json({ status: "updated", ...patch });
}

// DELETE /api/lists/[id] → delete a list (items cascade). The default list is
// protected and can't be deleted.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const list = await loadList(session.user.id, id);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (list.isDefault) {
    return NextResponse.json({ error: "The Watchlist can't be deleted" }, { status: 403 });
  }

  await getDb().delete(stockLists).where(eq(stockLists.id, id));
  return NextResponse.json({ status: "removed" });
}
