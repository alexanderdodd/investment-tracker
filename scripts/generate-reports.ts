import { config } from "dotenv";
config({ path: ".env.local" });

import { generateAllReports } from "../src/lib/generate-reports";

async function main() {
  console.log("Generating sector reports...\n");

  const results = await generateAllReports();

  for (const r of results) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`\nDone! ${succeeded} succeeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
