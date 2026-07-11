import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { watchlistItems } from "@/db/schema";

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

  const item = await db
    .select()
    .from(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, session.user.id),
        eq(watchlistItems.ticker, ticker.toUpperCase())
      )
    )
    .then((rows) => rows[0] ?? null);

  return NextResponse.json({ watching: !!item });
}

const VALID_STATUSES = ["watching", "to-research", "to-buy", "own", "pass"];

// PATCH { status }: update the triage status of a watched stock
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
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(watchlistItems)
    .set({ status })
    .where(
      and(
        eq(watchlistItems.userId, session.user.id),
        eq(watchlistItems.ticker, ticker.toUpperCase())
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

  await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, session.user.id),
        eq(watchlistItems.ticker, ticker.toUpperCase())
      )
    );

  return NextResponse.json({ status: "removed" });
}
