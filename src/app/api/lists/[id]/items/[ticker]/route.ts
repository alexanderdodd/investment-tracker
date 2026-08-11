import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { listItems } from "@/db/schema";
import { VALID_LIST_STATUSES } from "@/lib/lists";

// PATCH /api/lists/[id]/items/[ticker] { status?, note? }
// Update the triage status and/or note of a stock in a list. A null/empty note
// clears it.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticker } = await params;

  const body = (await request.json().catch(() => null)) as {
    status?: string;
    note?: string | null;
  } | null;
  const patch: { status?: string; note?: string | null } = {};

  if (body?.status !== undefined) {
    if (!(VALID_LIST_STATUSES as readonly string[]).includes(String(body.status))) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = String(body.status);
  }
  if (body?.note !== undefined) {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    patch.note = note ? note : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(listItems)
    .set(patch)
    .where(
      and(
        eq(listItems.userId, session.user.id),
        eq(listItems.listId, id),
        eq(listItems.ticker, ticker.toUpperCase())
      )
    );

  return NextResponse.json({ status: "updated", ...patch });
}

// DELETE /api/lists/[id]/items/[ticker] → remove a stock from a list.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, ticker } = await params;

  const db = getDb();
  await db
    .delete(listItems)
    .where(
      and(
        eq(listItems.userId, session.user.id),
        eq(listItems.listId, id),
        eq(listItems.ticker, ticker.toUpperCase())
      )
    );

  return NextResponse.json({ status: "removed" });
}
