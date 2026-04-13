import { config } from "dotenv";
config({ path: ".env.local" });

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

  console.log(`Generating value candidates for ${label}...\n`);

  const results = await generateValueCandidates(sector);

  // Group by industry
  const byIndustry: Record<string, typeof results> = {};
  for (const r of results) {
    (byIndustry[r.industry] ??= []).push(r);
  }

  for (const [industry, stocks] of Object.entries(byIndustry)) {
    console.log(`  ${industry}:`);
    for (const s of stocks) {
      const icon = s.candidateClass === "validated_value" ? "★"
        : s.candidateClass === "possible_value" ? "◎"
        : s.candidateClass === "value_trap_risk" ? "⚠"
        : "·";
      console.log(`    ${icon} ${s.ticker} → ${s.candidateClass}`);
    }
  }

  const validated = results.filter((r) => r.candidateClass === "validated_value").length;
  const possible = results.filter((r) => r.candidateClass === "possible_value").length;
  const trap = results.filter((r) => r.candidateClass === "value_trap_risk").length;
  const notAttractive = results.filter((r) => r.candidateClass === "not_attractive").length;

  console.log(`\nDone! ${results.length} stocks evaluated.`);
  console.log(`  ★ Validated: ${validated}`);
  console.log(`  ◎ Possible: ${possible}`);
  console.log(`  ⚠ Trap risk: ${trap}`);
  console.log(`  · Not attractive: ${notAttractive}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
