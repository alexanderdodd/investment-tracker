import { config } from "dotenv";
config({ path: ".env.local" });

import { discoverEuropeanListings } from "../src/lib/discover-european";

async function main() {
  const regionIdx = process.argv.indexOf("--region");
  const onlyRegion = regionIdx >= 0 ? process.argv[regionIdx + 1] : undefined;
  const minCap = process.argv.includes("--small-cap") ? 300_000_000 : 1_000_000_000;
  const perIdx = process.argv.indexOf("--per-region");
  const perRegion = perIdx >= 0 ? parseInt(process.argv[perIdx + 1], 10) : 250;

  console.log("Discovering European listings via Yahoo region screener...");
  console.log(`  Min market cap: $${(minCap / 1e9).toFixed(2)}B`);
  console.log(`  Per region: ${perRegion}`);
  if (onlyRegion) console.log(`  Region: ${onlyRegion}`);
  console.log();

  const result = await discoverEuropeanListings({ minMarketCap: minCap, perRegion, onlyRegion });

  console.log("\nDone!");
  console.log(`  Regions queried: ${result.regionsQueried}`);
  console.log(`  Discovered: ${result.discovered}`);
  console.log(`  Upserted: ${result.upserted}`);
  console.log("\n  By region:");
  Object.entries(result.byRegion)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => console.log(`    ${region}: ${count}`));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
