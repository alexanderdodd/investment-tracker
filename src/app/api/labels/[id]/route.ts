import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { userLabels } from "@/db/schema";
import { isLabelColor } from "@/lib/labels";

// PATCH { name?, color? }: rename or recolour a label.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { name?: string; color?: string }
    | null;

  const set: { name?: string; color?: string } = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 40);
    if (name) set.name = name;
  }
  if (isLabelColor(body?.color)) set.color = body!.color;
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(userLabels)
    .set(set)
    .where(and(eq(userLabels.id, id), eq(userLabels.userId, session.user.id)))
    .returning({ id: userLabels.id, name: userLabels.name, color: userLabels.color });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ label: updated });
}

// DELETE: remove a label. Its stock assignments cascade away.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  await db
    .delete(userLabels)
    .where(and(eq(userLabels.id, id), eq(userLabels.userId, session.user.id)));

  return NextResponse.json({ status: "removed" });
}
