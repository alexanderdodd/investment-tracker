import { generateText } from "ai";
import { openrouter } from "./ai";
import type { SectorInsights } from "./sector-insights";

const DATA_MODEL = "google/gemini-2.5-flash";

export async function distillStructuredInsights(
  sector: string,
  researchDocument: string
): Promise<SectorInsights> {
  const prompt = `You are a financial analyst converting a detailed sector research document into structured JSON for a sector dashboard.

SECTOR: ${sector}

FULL RESEARCH DOCUMENT:
${researchDocument}

Produce a JSON object with EXACTLY this schema. Every field is required.

{
  "stanceShortTerm": "Positive" | "Neutral" | "Cautious",
  "stanceLongTerm": "Positive" | "Neutral" | "Cautious",
  "valuation": "Cheap" | "Fair" | "Expensive",
  "confidence": "High" | "Medium" | "Low",
  "forwardPE": <number or null if unknown>,

  "performanceSummary": "<1-2 sentences: how the sector performed vs S&P 500, with specific numbers>",

  "topDrivers": [
    { "label": "<short 2-4 word label>", "detail": "<1 sentence with specific data>" },
    ... (2-3 items)
  ],
  "topRisks": [
    { "label": "<short 2-4 word label>", "detail": "<1 sentence with specific data>" },
    ... (2-3 items)
  ],
  "watchItems": [
    { "label": "<short 2-4 word label>", "detail": "<1 sentence: what to monitor in next 30-90 days>" },
    ... (2-3 items)
  ],

  "whatHappened": "<2-3 sentences explaining performance across timeframes, referencing specific return numbers vs SPY>",
  "sectorComposition": "<2-3 sentences describing sub-industry mix, what types of companies dominate, and how concentrated it is>",
  "whyItHappened": {
    "macro": ["<factor 1>", "<factor 2>"],
    "fundamentals": ["<factor 1>", "<factor 2>"],
    "sentiment": ["<factor 1>", "<factor 2>"]
  },
  "valuationAssessment": "<2-3 sentences on whether the sector looks cheap, fair, or expensive vs history and vs the market, with specific P/E or other multiples>",
  "whatNext": {
    "opportunities": ["<opportunity 1 with data>", "<opportunity 2 with data>"],
    "risks": ["<risk 1 with data>", "<risk 2 with data>"]
  },

  "thesis": "<2-3 sentence investment thesis synthesizing performance, drivers, and outlook>",
  "evidenceFor": ["<point 1>", "<point 2>", "<point 3>"],
  "evidenceAgainst": ["<point 1>", "<point 2>", "<point 3>"],
  "scenarios": {
    "bull": "<1-2 sentences describing the bull case>",
    "base": "<1-2 sentences describing the base case>",
    "bear": "<1-2 sentences describing the bear case>"
  },
  "triggers": ["<trigger 1: what would change the thesis>", "<trigger 2>", "<trigger 3>"]
}

Rules:
- Use plain language, no jargon
- Include specific numbers and data from the research document
- Labels should be short (2-4 words), details should be 1 sentence
- Do not give investment advice or recommendations
- Return ONLY valid JSON, no markdown fences, no other text`;

  const { text } = await generateText({
    model: openrouter()(DATA_MODEL),
    prompt,
  });

  // Strip markdown fences if present
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as SectorInsights;
  return parsed;
}
