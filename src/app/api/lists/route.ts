import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { stockLists, listItems } from "@/db/schema";
import { getOrCreateDefaultList } from "@/lib/lists";
import { isLabelColor, nextLabelColor } from "@/lib/labels";

// GET /api/lists            → all of the user's lists with item counts.
// GET /api/lists?ticker=KO  → same, plus each list's membership for that ticker
//                             ({ note, status } | null) for the add-to-list picker.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const db = getDb();

  // Ensure the protected default list exists so a fresh user sees "Watchlist".
  await getOrCreateDefaultList(db, userId);

  const [lists, items] = await Promise.all([
    db
      .select()
      .from(stockLists)
      .where(eq(stockLists.userId, userId))
      .orderBy(asc(stockLists.sortOrder), asc(stockLists.createdAt)),
    db.select().from(listItems).where(eq(listItems.userId, userId)),
  ]);

  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.listId, (counts.get(it.listId) ?? 0) + 1);

  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.toUpperCase() ?? null;
  const membership = new Map<string, { note: string | null; status: string }>();
  if (ticker) {
    for (const it of items) {
      if (it.ticker === ticker) membership.set(it.listId, { note: it.note, status: it.status });
    }
  }

  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      isDefault: l.isDefault,
      count: counts.get(l.id) ?? 0,
      ...(ticker ? { membership: membership.get(l.id) ?? null } : {}),
    })),
  });
}

// POST /api/lists { name, color? } → create a list. Reuses a same-named list if
// one already exists (case-insensitive). Auto-assigns a non-colliding color.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await request.json().catch(() => null)) as { name?: string; color?: string } | null;
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const existingLists = await db.select().from(stockLists).where(eq(stockLists.userId, userId));

  const dup = existingLists.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (dup) {
    return NextResponse.json({
      list: { id: dup.id, name: dup.name, color: dup.color, isDefault: dup.isDefault, count: 0 },
      status: "exists",
    });
  }

  const color = isLabelColor(body?.color)
    ? body!.color!
    : nextLabelColor(existingLists.map((l) => l.color));
  const sortOrder = existingLists.reduce((max, l) => Math.max(max, l.sortOrder), 0) + 1;

  const [created] = await db
    .insert(stockLists)
    .values({ userId, name, color, sortOrder })
    .returning();

  return NextResponse.json({
    list: { id: created.id, name: created.name, color: created.color, isDefault: false, count: 0 },
    status: "created",
  });
}
