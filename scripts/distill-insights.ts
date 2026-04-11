import { config } from "dotenv";
config({ path: ".env.local" });

import { redistillAllInsights } from "../src/lib/generate-sector-analysis";
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

  console.log(`Distilling structured insights for ${label}...\n`);

  const results = await redistillAllInsights(sector);
  for (const r of results) {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.sector}${r.error ? `: ${r.error}` : ""}`);
  }

  const ok = results.filter((r) => r.success).length;
  console.log(`\nDone! ${ok}/${results.length} insights distilled.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
