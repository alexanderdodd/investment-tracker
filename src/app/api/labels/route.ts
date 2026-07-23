import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { stockLabels, userLabels } from "@/db/schema";
import { isLabelColor, nextLabelColor, type LabelColor } from "@/lib/labels";

// GET: the signed-in user's labels + every stock→label assignment, so the
// screener can render labels inline in one round-trip.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const userId = session.user.id;

  const [labels, assigns] = await Promise.all([
    db
      .select({ id: userLabels.id, name: userLabels.name, color: userLabels.color })
      .from(userLabels)
      .where(eq(userLabels.userId, userId))
      .orderBy(asc(userLabels.createdAt)),
    db
      .select({ ticker: stockLabels.ticker, labelId: stockLabels.labelId })
      .from(stockLabels)
      .where(eq(stockLabels.userId, userId)),
  ]);

  const assignments: Record<string, string[]> = {};
  for (const a of assigns) {
    (assignments[a.ticker] ??= []).push(a.labelId);
  }

  return NextResponse.json({ labels, assignments });
}

// POST { name, color? }: create a new label. Colour is auto-assigned from the
// palette when omitted. Returns the created (or existing, case-insensitive) label.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; color?: string }
    | null;
  const name = String(body?.name ?? "").trim().slice(0, 40);
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const userId = session.user.id;

  // Reuse an existing same-named label rather than erroring on the unique index.
  const existing = await db
    .select({ id: userLabels.id, name: userLabels.name, color: userLabels.color })
    .from(userLabels)
    .where(eq(userLabels.userId, userId))
    .then((rows) => rows.find((r) => r.name.toLowerCase() === name.toLowerCase()));
  if (existing) {
    return NextResponse.json({ label: existing, status: "exists" });
  }

  const current = await db
    .select({ color: userLabels.color })
    .from(userLabels)
    .where(eq(userLabels.userId, userId));
  const color: LabelColor = isLabelColor(body?.color)
    ? body!.color
    : nextLabelColor(current.map((c) => c.color));

  const [created] = await db
    .insert(userLabels)
    .values({ userId, name, color })
    .returning({ id: userLabels.id, name: userLabels.name, color: userLabels.color });

  return NextResponse.json({ label: created, status: "created" });
}
