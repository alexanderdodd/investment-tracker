import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { listItems } from "@/db/schema";
import { getOrCreateDefaultList, VALID_LIST_STATUSES } from "@/lib/lists";

// Compatibility layer over the user's protected default ("Watchlist") list.
// Backs the screener star and the legacy per-ticker watch endpoints.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ watching: false });
  }

  const { ticker } = await params;
  const db = getDb();
  const list = await getOrCreateDefaultList(db, session.user.id);
  if (!list) return NextResponse.json({ watching: false, status: null });

  const item = await db
    .select()
    .from(listItems)
    .where(
      and(
        eq(listItems.userId, session.user.id),
        eq(listItems.listId, list.id),
        eq(listItems.ticker, ticker.toUpperCase())
      )
    )
    .then((rows) => rows[0] ?? null);

  return NextResponse.json({ watching: !!item, status: item?.status ?? null });
}

// PATCH { status }: update the triage status of the watched stock.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticker } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = String(body?.status ?? "");
  if (!(VALID_LIST_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getDb();
  const list = await getOrCreateDefaultList(db, session.user.id);
  if (!list) return NextResponse.json({ error: "Could not resolve watchlist" }, { status: 500 });

  await db
    .update(listItems)
    .set({ status })
    .where(
      and(
        eq(listItems.userId, session.user.id),
        eq(listItems.listId, list.id),
        eq(listItems.ticker, ticker.toUpperCase())
      )
    );

  return NextResponse.json({ status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticker } = await params;
  const db = getDb();
  const list = await getOrCreateDefaultList(db, session.user.id);
  if (!list) return NextResponse.json({ status: "removed" });

  await db
    .delete(listItems)
    .where(
      and(
        eq(listItems.userId, session.user.id),
        eq(listItems.listId, list.id),
        eq(listItems.ticker, ticker.toUpperCase())
      )
    );

  return NextResponse.json({ status: "removed" });
}
