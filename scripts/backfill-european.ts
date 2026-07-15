import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, like, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { bigFiveScreen, stockGrowthHistories } from "../src/db/schema";
import { sweepTickers, loadSectorMap } from "../src/lib/sweep-big-five";

// Re-run the sweep over European (dot-suffixed) rows that are currently
// unavailable, after clearing their cached growth history so the new Yahoo
// fallback gets a fresh shot. Resumable: rows that flip to available won't be
// re-selected on the next run.
async function main() {
  const db = getDb();
  const rows = await db
    .select({ ticker: bigFiveScreen.ticker, name: bigFiveScreen.companyName })
    .from(bigFiveScreen)
    .where(and(eq(bigFiveScreen.available, false), like(bigFiveScreen.ticker, "%.%")));

  console.log(`Unavailable European rows to retry: ${rows.length}`);
  if (rows.length === 0) return;

  // Drop stale "unavailable" growth-cache rows so they rebuild (batched).
  const tickers = rows.map((r) => r.ticker);
  for (let i = 0; i < tickers.length; i += 200) {
    await db.delete(stockGrowthHistories).where(inArray(stockGrowthHistories.ticker, tickers.slice(i, i + 200)));
  }

  const sectorMap = await loadSectorMap();
  const stats = await sweepTickers(
    rows.map((r) => ({ ticker: r.ticker, name: r.name ?? r.ticker })),
    sectorMap,
    undefined,
    (done, total, s) => {
      if (done % 25 === 0) console.log(`[${done}/${total}] — ${s.qualifiers} qualifiers, ${s.unavailable} still unavailable, ${s.errors} errors`);
    }
  );
  console.log(`Done. Swept ${stats.swept}, qualifiers: ${stats.qualifiers}, still unavailable: ${stats.unavailable}, errors: ${stats.errors}.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error("Fatal:", err); process.exit(1); });
