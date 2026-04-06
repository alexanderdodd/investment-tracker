import { generateText } from "ai";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { sectorReports } from "../db/schema";
import { SECTORS, SECTOR_ETFS } from "./sectors";
import { fetchAllSectorData } from "./sector-data";

export async function generateAllReports() {
  const allData = await fetchAllSectorData();
  const db = getDb();
  const results: { sector: string; success: boolean; error?: string }[] = [];

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

    try {
      const { text } = await generateText({
        model: openrouter()("google/gemini-2.5-flash:online"),
        prompt,
      });

      await db.insert(sectorReports).values({
        sector,
        summary: text,
      });

      results.push({ sector, success: true });
    } catch (err) {
      results.push({
        sector,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
