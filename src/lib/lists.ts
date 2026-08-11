// Shared types + helpers for user-defined stock lists. A list is a curated
// bucket of tickers (each with an optional note) with no cash allocation — the
// evolution of the old single "watchlist". Every user has one protected default
// list named "Watchlist"; the Watch action and screener star target it.

import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db/index";
import { stockLists } from "@/db/schema";

/** Triage statuses — must match VALID_STATUSES below and WATCHLIST_STATUSES. */
export const VALID_LIST_STATUSES = [
  "watching",
  "to-research",
  "to-buy",
  "own",
  "pass",
] as const;

export const DEFAULT_LIST_NAME = "Watchlist";

export type Db = ReturnType<typeof getDb>;

export interface StockListMeta {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  count: number;
}

export interface ListItemView {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  note: string | null;
  status: string;
  addedAt: string;
}

/**
 * Return the user's protected default ("Watchlist") list, creating it if it
 * doesn't exist yet. Safe to call concurrently: on a unique-name collision it
 * re-reads the existing row.
 */
export async function getOrCreateDefaultList(db: Db, userId: string) {
  const existing = await db
    .select()
    .from(stockLists)
    .where(and(eq(stockLists.userId, userId), eq(stockLists.isDefault, true)))
    .then((rows) => rows[0] ?? null);
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(stockLists)
      .values({ userId, name: DEFAULT_LIST_NAME, isDefault: true, sortOrder: 0 })
      .returning();
    return created;
  } catch {
    // Lost a race (or a pre-existing "Watchlist" name) — re-read.
    const row = await db
      .select()
      .from(stockLists)
      .where(and(eq(stockLists.userId, userId), eq(stockLists.isDefault, true)))
      .then((rows) => rows[0] ?? null);
    if (row) return row;
    // Fall back to any list named "Watchlist" and promote it.
    const byName = await db
      .select()
      .from(stockLists)
      .where(eq(stockLists.userId, userId))
      .then((rows) => rows.find((r) => r.name.toLowerCase() === DEFAULT_LIST_NAME.toLowerCase()) ?? null);
    return byName;
  }
}
