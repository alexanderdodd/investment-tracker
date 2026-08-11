import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { watchlistItems, stockLists, listItems } from "../src/db/schema";
import { DEFAULT_LIST_NAME } from "../src/lib/lists";

// One-off migration: fold every user's legacy `watchlist_item` rows into the new
// lists model. Each user gets a protected default "Watchlist" list; their items
// are copied into `list_item` preserving ticker/company/sector/status/addedAt.
// Idempotent — re-running skips items already present in the target list and
// won't create a second default list.
async function main() {
  const db = getDb();

  const legacy = await db.select().from(watchlistItems);
  if (legacy.length === 0) {
    console.log("No watchlist_item rows to migrate.");
    return;
  }

  const byUser = new Map<string, typeof legacy>();
  for (const row of legacy) {
    const arr = byUser.get(row.userId) ?? [];
    arr.push(row);
    byUser.set(row.userId, arr);
  }

  console.log(`Migrating ${legacy.length} items across ${byUser.size} user(s)…`);

  for (const [userId, rows] of byUser) {
    // Find or create this user's protected default list.
    let list = await db
      .select()
      .from(stockLists)
      .where(and(eq(stockLists.userId, userId), eq(stockLists.isDefault, true)))
      .then((r) => r[0] ?? null);

    if (!list) {
      [list] = await db
        .insert(stockLists)
        .values({ userId, name: DEFAULT_LIST_NAME, isDefault: true, sortOrder: 0 })
        .returning();
      console.log(`  user ${userId}: created "${DEFAULT_LIST_NAME}" list`);
    }

    const existing = await db
      .select()
      .from(listItems)
      .where(and(eq(listItems.userId, userId), eq(listItems.listId, list.id)));
    const have = new Set(existing.map((i) => i.ticker));

    const toInsert = rows
      .filter((r) => !have.has(r.ticker))
      .map((r) => ({
        userId,
        listId: list!.id,
        ticker: r.ticker,
        companyName: r.companyName,
        sector: r.sector,
        note: null,
        status: r.status,
        addedAt: r.addedAt,
      }));

    if (toInsert.length > 0) {
      await db.insert(listItems).values(toInsert);
    }
    console.log(
      `  user ${userId}: ${toInsert.length} migrated, ${rows.length - toInsert.length} already present`
    );
  }

  console.log("Done. The legacy watchlist_item table is left untouched as a backup.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
