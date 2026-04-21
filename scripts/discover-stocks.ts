import { config } from "dotenv";
config({ path: ".env.local" });

import { discoverViaScreener } from "../src/lib/discover-screener";
import { SECTORS, type SectorName } from "../src/lib/sectors";

async function main() {
  const sectorIdx = process.argv.indexOf("--sector");
  const sector = sectorIdx >= 0 ? process.argv[sectorIdx + 1] as SectorName : undefined;
  const minCap = process.argv.includes("--small-cap") ? 500_000_000 : 2_000_000_000;
  const maxPer = 50;

  console.log(`Discovering stocks via Yahoo screener...`);
  console.log(`  Min market cap: $${(minCap / 1e9).toFixed(1)}B`);
  console.log(`  Max per industry: ${maxPer}`);
  if (sector) console.log(`  Sector: ${sector}`);
  console.log();

  const result = await discoverViaScreener({
    onlySector: sector,
    minMarketCap: minCap,
    maxPerIndustry: maxPer,
  });

  console.log(`\nDone!`);
  console.log(`  Industries queried: ${result.industriesQueried}`);
  console.log(`  Stocks discovered: ${result.totalDiscovered}`);
  console.log(`  New inserts: ${result.inserted}`);
  console.log(`  Skipped (existing): ${result.skippedExisting}`);
  console.log(`  Skipped (OTC/foreign): ${result.skippedExchange}`);

  // Show breakdown by GICS code
  const byCode: Record<string, number> = {};
  result.results.filter(r => r.action === "inserted").forEach(r => {
    byCode[r.gicsIndustryCode] = (byCode[r.gicsIndustryCode] || 0) + 1;
  });
  if (Object.keys(byCode).length > 0) {
    console.log(`\n  New stocks by industry:`);
    Object.entries(byCode).sort((a, b) => b[1] - a[1]).forEach(([code, cnt]) => {
      console.log(`    ${code}: +${cnt}`);
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
