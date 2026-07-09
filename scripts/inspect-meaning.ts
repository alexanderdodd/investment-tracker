// Dev utility: print stored meaning rows (tags + one-liners)
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/db/index";
import { companyMeaning } from "../src/db/schema";

async function main() {
  const db = getDb();
  const rows = await db.select().from(companyMeaning);
  for (const r of rows) {
    console.log(
      `${r.ticker} | ${(r.tags ?? []).join(", ")} | extra: ${(r.extraTags ?? []).join(",")} | ${r.oneLiner}`
    );
  }
  process.exit(0);
}
main();
