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
