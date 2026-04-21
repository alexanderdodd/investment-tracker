import { config } from "dotenv";
config({ path: ".env.local" });

import { runIndustryScreen } from "../src/lib/industry-screen";
import type { SectorName } from "../src/lib/sectors";

async function main() {
  const sectorArg = process.argv.find((a) => a.startsWith("--sector"));
  const sectorIdx = process.argv.indexOf("--sector");
  const sector = sectorIdx >= 0 ? process.argv[sectorIdx + 1] as SectorName : undefined;

  console.log(
    sector
      ? `Running industry screen for ${sector}...`
      : "Running industry screen for all sectors..."
  );
  console.log();

  const results = await runIndustryScreen(sector);

  // Summary by state
  const stateCounts: Record<string, number> = {};
  for (const r of results) {
    stateCounts[r.screenState] = (stateCounts[r.screenState] || 0) + 1;
  }

  console.log("\n════════════════════════════════════════");
  console.log(`Total: ${results.length} stocks screened`);
  for (const [state, count] of Object.entries(stateCounts).sort()) {
    const icon =
      state === "PUBLISHED_VALUE_CANDIDATE" ? "★" :
      state === "SCREEN_PASS" ? "◎" :
      state === "NEEDS_DEEP_WORK" ? "◆" :
      state === "WATCHLIST_ONLY" ? "·" :
      "⚠";
    console.log(`  ${icon} ${state}: ${count}`);
  }

  // Detail for non-WATCHLIST results
  const interesting = results
    .filter((r) => r.screenState !== "WATCHLIST_ONLY")
    .sort((a, b) => b.compositeScore - a.compositeScore);

  if (interesting.length > 0) {
    console.log("\nDetailed results (non-WATCHLIST):");
    for (const r of interesting) {
      const cheap = r.cheapnessPass ? "cheap✓" : "cheap✗";
      const qual = r.qualityPass ? "quality✓" : "quality✗";
      const art = r.hasValuationArtifact ? "artifact✓" : "artifact✗";
      const peer = r.hasPeerArtifact ? "peers✓" : "peers✗";
      console.log(
        `  ${r.screenState.padEnd(28)} ${r.ticker.padEnd(6)} score=${r.compositeScore.toString().padStart(3)} ` +
        `${cheap} ${qual} ${art} ${peer} ` +
        `signals=${r.cheapnessSignalCount} qScore=${r.qualityScore}`
      );
      if (r.trapFlags.length > 0) {
        console.log(`${"".padEnd(38)}trap: ${r.trapFlags.join(", ")}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
