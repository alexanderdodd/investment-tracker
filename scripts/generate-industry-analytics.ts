import { config } from "dotenv";
config({ path: ".env.local" });

import { generateIndustryAnalytics } from "../src/lib/generate-industry-analytics";
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
