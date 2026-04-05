import { config } from "dotenv";
config({ path: ".env.local" });

import { generateText } from "ai";
import { openrouter } from "../src/lib/ai";
import { getDb } from "../src/db/index";
import { sectorReports } from "../src/db/schema";
import { SECTORS, SECTOR_ETFS } from "../src/lib/sectors";
import { fetchAllSectorData } from "../src/lib/sector-data";

async function main() {
  console.log("Fetching sector data from Yahoo Finance...");
  const allData = await fetchAllSectorData();

  const db = getDb();

  for (const sector of SECTORS) {
    const ticker = SECTOR_ETFS[sector];
    const data = allData[sector];

    let changesContext = "Performance data unavailable.";
    if (data?.changes) {
      const c = data.changes;
      changesContext = [
        `Current performance data for ${ticker}:`,
        `- 1 Day change: ${c.day !== null ? `${c.day}%` : "N/A"}`,
        `- 1 Month change: ${c.month !== null ? `${c.month}%` : "N/A"}`,
        `- 1 Year change: ${c.year !== null ? `${c.year}%` : "N/A"}`,
        `- 5 Year change: ${c.fiveYear !== null ? `${c.fiveYear}%` : "N/A"}`,
      ].join("\n");
    }

    const prompt = `You are a concise financial analyst. Write a brief summary (3-4 sentences) of how the ${sector} sector (tracked by the ${ticker} ETF) is currently performing. Cover the short-term and long-term trends.

${changesContext}

Be factual and measured in tone. Do not give investment advice. Do not use markdown formatting.`;

    console.log(`Generating report for ${sector} (${ticker})...`);

    try {
      const { text } = await generateText({
        model: openrouter()("google/gemini-2.0-flash-001"),
        prompt,
      });

      await db.insert(sectorReports).values({
        sector,
        summary: text,
      });

      console.log(`  ✓ ${sector}`);
    } catch (err) {
      console.error(`  ✗ ${sector}: ${err}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\nDone! All sector reports generated.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
