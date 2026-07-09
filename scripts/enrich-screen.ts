/**
 * One-off/maintenance: backfill quotes (market cap, price) and sticker/MOS
 * for big_five_screen rows that don't have them yet. Normally the sweep
 * enriches as it goes — this exists to catch up rows swept by older runs.
 *
 * Usage: npx tsx scripts/enrich-screen.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { isNull, and, gte, eq } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { bigFiveScreen } from "../src/db/schema";
import { enrichQuotes, enrichStickers } from "../src/lib/sweep-big-five";

async function main() {
  const db = getDb();

  const missingQuotes = await db
    .select({ ticker: bigFiveScreen.ticker })
    .from(bigFiveScreen)
    .where(and(eq(bigFiveScreen.available, true), isNull(bigFiveScreen.marketCap)));
  console.log(`Backfilling quotes for ${missingQuotes.length} rows…`);
  await enrichQuotes(missingQuotes.map((r) => r.ticker));

  const missingStickers = await db
    .select({ ticker: bigFiveScreen.ticker })
    .from(bigFiveScreen)
    .where(
      and(
        eq(bigFiveScreen.available, true),
        gte(bigFiveScreen.score, 3),
        isNull(bigFiveScreen.sticker)
      )
    );
  console.log(`Backfilling stickers for ${missingStickers.length} qualifiers…`);
  await enrichStickers(missingStickers.map((r) => r.ticker));

  console.log("Done.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
