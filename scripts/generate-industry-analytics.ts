import { config } from "dotenv";
config({ path: ".env.local" });

import { generateIndustryAnalytics } from "../src/lib/generate-industry-analytics";
import { discoverConstituents } from "../src/lib/discover-constituents";
import { discoverViaScreener } from "../src/lib/discover-screener";
import { SECTORS, type SectorName } from "../src/lib/sectors";

function parseSectorArg(): SectorName | undefined {
  const idx = process.argv.indexOf("--sector");
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  const name = process.argv[idx + 1];
  const match = SECTORS.find(
    (s) => s.toLowerCase() === name.toLowerCase()
  );
  if (!match) {
    console.error(`Unknown sector: "${name}". Valid sectors:\n  ${SECTORS.join("\n  ")}`);
    process.exit(1);
  }
  return match;
}

async function main() {
  const sector = parseSectorArg();
  const label = sector ?? "all sectors";

  // Step 1: Auto-discover constituents
  const skipDiscovery = process.argv.includes("--skip-discovery");
  if (!skipDiscovery) {
    // Phase A: Yahoo screener (broad — 20-50 stocks per industry)
    console.log(`Discovering constituents via Yahoo screener...\n`);
    const screener = await discoverViaScreener({ onlySector: sector });
    console.log(`  Screener: ${screener.inserted} new, ${screener.skippedExisting} existing, ${screener.skippedExchange} filtered (OTC)\n`);

    // Phase B: ETF holdings (catches any top holdings the screener missed)
    console.log(`Supplementing from ETF holdings...\n`);
    const etf = await discoverConstituents(sector);
    console.log(`  ETF: ${etf.inserted} new, ${etf.skipped} existing\n`);
  }

  // Step 2: Generate analytics
  console.log(`Generating industry analytics for ${label}...\n`);

  const results = await generateIndustryAnalytics(sector);

  for (const r of results) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector} / ${r.industry}${r.error ? `: ${r.error}` : ""}`);
  }

  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;
  console.log(`\nDone! ${ok} succeeded, ${fail} failed.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
