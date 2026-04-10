import { config } from "dotenv";
config({ path: ".env.local" });

import { generateAllReports } from "../src/lib/generate-reports";
import { generateAllEmergingLeaders } from "../src/lib/generate-emerging-leaders";
import { generateAllSectorAnalyses } from "../src/lib/generate-sector-analysis";

async function main() {
  console.log("Generating sector reports...\n");

  const reportResults = await generateAllReports();
  for (const r of reportResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating emerging leaders...\n");

  const leaderResults = await generateAllEmergingLeaders();
  for (const r of leaderResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating sector analyses (multi-stage)...\n");

  const analysisResults = await generateAllSectorAnalyses();
  for (const r of analysisResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  const reportOk = reportResults.filter((r) => r.success).length;
  const leaderOk = leaderResults.filter((r) => r.success).length;
  const analysisOk = analysisResults.filter((r) => r.success).length;
  console.log(`\nDone! Reports: ${reportOk}/11. Leaders: ${leaderOk}/11. Analyses: ${analysisOk}/11.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
