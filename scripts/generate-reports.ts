import { config } from "dotenv";
config({ path: ".env.local" });

import { generateAllReports } from "../src/lib/generate-reports";
import { generateAllEmergingLeaders } from "../src/lib/generate-emerging-leaders";
import { generateAllValueStocks } from "../src/lib/generate-value-stocks";
import { generateAllSectorAnalyses } from "../src/lib/generate-sector-analysis";
import { generateIndustryAnalytics } from "../src/lib/generate-industry-analytics";
import { generateValueCandidates } from "../src/lib/generate-value-candidates";
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

  console.log(`Generating sector reports for ${label}...\n`);

  const reportResults = await generateAllReports(sector);
  for (const r of reportResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating emerging leaders...\n");

  const leaderResults = await generateAllEmergingLeaders(sector);
  for (const r of leaderResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating value stocks...\n");

  const valueResults = await generateAllValueStocks(sector);
  for (const r of valueResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating sector analyses (multi-stage)...\n");

  const analysisResults = await generateAllSectorAnalyses(sector);
  for (const r of analysisResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating industry analytics...\n");

  const industryResults = await generateIndustryAnalytics(sector);
  for (const r of industryResults) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector} / ${r.industry}${r.error ? `: ${r.error}` : ""}`);
  }

  console.log("\nGenerating value candidates...\n");

  const candidateResults = await generateValueCandidates(sector);
  const candidatesByClass: Record<string, number> = {};
  for (const r of candidateResults) {
    candidatesByClass[r.candidateClass] = (candidatesByClass[r.candidateClass] ?? 0) + 1;
  }
  for (const [cls, count] of Object.entries(candidatesByClass)) {
    console.log(`  ${cls}: ${count}`);
  }

  const reportOk = reportResults.filter((r) => r.success).length;
  const leaderOk = leaderResults.filter((r) => r.success).length;
  const valueOk = valueResults.filter((r) => r.success).length;
  const analysisOk = analysisResults.filter((r) => r.success).length;
  const industryOk = industryResults.filter((r) => r.success).length;
  const total = sector ? 1 : 11;
  console.log(`\nDone! Reports: ${reportOk}/11. Leaders: ${leaderOk}/11. Value: ${valueOk}/11. Analyses: ${analysisOk}/${total}. Industries: ${industryOk}. Candidates: ${candidateResults.length}.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
