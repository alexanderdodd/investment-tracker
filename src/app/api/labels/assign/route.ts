import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { stockLabels, userLabels } from "@/db/schema";

// Resolve { ticker, labelId } from the request and confirm the label belongs to
// the signed-in user. Returns null (→ caller responds) on any problem.
async function resolve(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const body = (await request.json().catch(() => null)) as
    | { ticker?: string; labelId?: string }
    | null;
  const ticker = String(body?.ticker ?? "").trim().toUpperCase();
  const labelId = String(body?.labelId ?? "").trim();
  if (!ticker || !labelId) {
    return { error: NextResponse.json({ error: "ticker and labelId required" }, { status: 400 }) };
  }

  const db = getDb();
  const userId = session.user.id;
  const owns = await db
    .select({ id: userLabels.id })
    .from(userLabels)
    .where(and(eq(userLabels.id, labelId), eq(userLabels.userId, userId)))
    .then((rows) => rows.length > 0);
  if (!owns) {
    return { error: NextResponse.json({ error: "Label not found" }, { status: 404 }) };
  }
  return { db, userId, ticker, labelId };
}

// POST: apply a label to a stock (idempotent).
export async function POST(request: Request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  await r.db
    .insert(stockLabels)
    .values({ userId: r.userId, labelId: r.labelId, ticker: r.ticker })
    .onConflictDoNothing();
  return NextResponse.json({ status: "assigned" });
}

// DELETE: remove a label from a stock.
export async function DELETE(request: Request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  await r.db
    .delete(stockLabels)
    .where(and(eq(stockLabels.labelId, r.labelId), eq(stockLabels.ticker, r.ticker), eq(stockLabels.userId, r.userId)));
  return NextResponse.json({ status: "unassigned" });
}
