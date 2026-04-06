import { generateText } from "ai";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { sectorEmergingLeaders } from "../db/schema";
import { SECTORS, SECTOR_ETFS } from "./sectors";
import { SECTOR_HOLDINGS } from "./sector-holdings";

interface LeaderEntry {
  ticker: string;
  companyName: string;
  rationale: string;
  metricLabel: string;
  metricValue: string;
}

function parseJsonFromAI(text: string): LeaderEntry[] {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed.slice(0, 10).map((item: Record<string, unknown>) => ({
    ticker: String(item.ticker ?? ""),
    companyName: String(item.companyName ?? ""),
    rationale: String(item.rationale ?? ""),
    metricLabel: String(item.metricLabel ?? ""),
    metricValue: String(item.metricValue ?? ""),
  }));
}

export async function generateAllEmergingLeaders() {
  const db = getDb();
  const results: { sector: string; success: boolean; error?: string }[] = [];

  for (const sector of SECTORS) {
    const ticker = SECTOR_ETFS[sector];
    const holdings = SECTOR_HOLDINGS[ticker] ?? [];
    const excludeList = holdings.map((h) => h.symbol).join(", ");

    const prompt = `You are a financial analyst identifying emerging growth opportunities. For the ${sector} sector (tracked by the ${ticker} ETF), identify 10 emerging leader companies that are NOT among these top holdings: ${excludeList}.

Criteria:
- Mid-cap or rising companies with strong recent momentum
- Strong revenue growth, earnings beats, or disruptive business models
- Must be publicly traded on US exchanges
- Prefer companies that are gaining market share or have a clear competitive advantage

Return ONLY a JSON array with exactly 10 objects in this format:
[{"ticker": "SYMBOL", "companyName": "Full Company Name", "rationale": "1-2 sentence explanation of why this company is an emerging leader", "metricLabel": "Key Metric Name (e.g. YTD Return, Revenue Growth)", "metricValue": "The metric value (e.g. +45.2%, 32% YoY)"}]

Use current market data. Be specific with numbers. Return ONLY the JSON array, no other text.`;

    try {
      const { text } = await generateText({
        model: openrouter()("google/gemini-2.5-flash:online"),
        prompt,
      });

      const leaders = parseJsonFromAI(text);

      if (leaders.length === 0) {
        throw new Error("AI returned no valid entries");
      }

      const batchTime = new Date();
      await db.insert(sectorEmergingLeaders).values(
        leaders.map((leader, i) => ({
          sector,
          ticker: leader.ticker,
          companyName: leader.companyName,
          rationale: leader.rationale,
          metricLabel: leader.metricLabel,
          metricValue: leader.metricValue,
          rank: i + 1,
          generatedAt: batchTime,
        }))
      );

      results.push({ sector, success: true });
    } catch (err) {
      results.push({
        sector,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
