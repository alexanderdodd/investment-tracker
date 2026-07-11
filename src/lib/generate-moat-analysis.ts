/**
 * LLM-researched moat analysis — the "Moat" M of Rule #1's Four Ms.
 *
 * Web-grounded research into the consensus view of a company's competitive
 * moats (Town's five types), how wide they are, and what threatens them.
 * Generated on demand per stock and cached in the stock_moat table.
 */

import { generateText } from "ai";
import { openrouter } from "./ai";
import { tryParseJson } from "./json-utils";

// Online model for web-grounded research (matches generate-management-brief.ts)
const RESEARCH_MODEL = "google/gemini-2.5-flash:online";
// Cheap non-web model for the JSON repair fallback
const REPAIR_MODEL = "google/gemini-2.5-flash";

export type MoatType = "brand" | "secret" | "toll_bridge" | "switching" | "price";
export type MoatStrength = "wide" | "narrow" | "none";

export const MOAT_TYPE_LABELS: Record<MoatType, string> = {
  brand: "Brand",
  secret: "Secret (patents / trade secrets)",
  toll_bridge: "Toll bridge",
  switching: "Switching costs",
  price: "Price (low-cost producer)",
};

export interface MoatItem {
  type: MoatType;
  strength: Exclude<MoatStrength, "none">;
  /** Markdown: what the moat is and the evidence for it */
  description: string;
}

export interface MoatRisk {
  title: string;
  severity: "high" | "medium" | "low";
  /** Markdown: how this could erode the moat(s) */
  description: string;
}

export interface MoatAnalysis {
  overallStrength: MoatStrength;
  /** Markdown: the general consensus view (analysts, Morningstar-style
   *  ratings, commentators) on whether this company has a moat */
  consensus: string;
  moats: MoatItem[];
  risks: MoatRisk[];
  /** Markdown: is the moat widening or eroding, and how durable is it
   *  over a 10-year Rule #1 holding period */
  durability: string;
}

export async function generateMoatAnalysis(
  ticker: string,
  companyName: string | null,
  description: string | null
): Promise<MoatAnalysis> {
  const prompt = `You are researching the competitive moat of ${companyName ?? ticker} (ticker ${ticker}) for a Rule #1 (Phil Town) style "Moat" assessment. Use current web information: analyst commentary, Morningstar economic-moat ratings if published, competitive analyses, market-share data.

${description ? `BUSINESS DESCRIPTION:\n${description.slice(0, 1500)}\n` : ""}
Town's five moat types:
- brand: customers pay up for the name (Coca-Cola, Apple)
- secret: patents or trade secrets competitors can't copy (pharma, semis IP)
- toll_bridge: customers have little choice but to pass through them (utilities, exchanges, rating agencies, networks)
- switching: too costly or painful to switch away (enterprise software, banks)
- price: structurally lowest-cost producer (Costco, GEICO)

Research and answer:
1. CONSENSUS — what is the general consensus on this company's moat? Cite who says what where possible (e.g. Morningstar's published moat rating, notable analyst or commentator views). Note disagreement if it exists.
2. MOATS — which of the five types apply (often more than one)? For each: is it wide or narrow, and what is the concrete evidence (market share, pricing power, retention, margins vs peers)? Only include moats that actually exist.
3. RISKS — what are the main threats to each moat (competition, technology shifts, regulation, brand erosion, patent cliffs)? Rate each high/medium/low severity.
4. DURABILITY — over a 10-year holding period, is the moat widening, stable, or eroding? Why?
5. OVERALL — wide, narrow, or none, judged conservatively the way a Rule #1 investor would.

Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "overallStrength": "wide" | "narrow" | "none",
  "consensus": string,       // 1-2 paragraph markdown: the consensus view and who holds it
  "moats": [                 // empty array if none
    {
      "type": "brand" | "secret" | "toll_bridge" | "switching" | "price",
      "strength": "wide" | "narrow",
      "description": string  // markdown: the moat and its evidence
    }
  ],
  "risks": [                 // empty array if none identified
    {
      "title": string,       // short phrase
      "severity": "high" | "medium" | "low",
      "description": string  // markdown: how it erodes the moat
    }
  ],
  "durability": string       // markdown: widening/stable/eroding over 10 years and why
}`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });

  let parsed = tryParseJson(text);

  // Repair pass: the research model sometimes emits almost-JSON
  if (!parsed) {
    try {
      const { text: repaired } = await generateText({
        model: openrouter()(REPAIR_MODEL),
        prompt: `Convert the following into a single STRICT valid JSON object with exactly these fields: overallStrength ("wide"|"narrow"|"none"), consensus (string), moats (array of {type, strength, description}), risks (array of {title, severity, description}), durability (string). Preserve the content; fix only the formatting. Output ONLY the JSON object.\n\n${text}`,
      });
      parsed = tryParseJson(repaired);
    } catch {
      // fall through to raw-text fallback
    }
  }

  const toMarkdown = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((x) => `- ${String(x)}`).join("\n");
    return "";
  };

  if (parsed) {
    const moatTypes: MoatType[] = ["brand", "secret", "toll_bridge", "switching", "price"];
    const strengths: MoatStrength[] = ["wide", "narrow", "none"];
    const severities = ["high", "medium", "low"];

    const moats: MoatItem[] = (Array.isArray(parsed.moats) ? parsed.moats : [])
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .filter((m) => moatTypes.includes(m.type as MoatType))
      .map((m) => ({
        type: m.type as MoatType,
        strength: m.strength === "wide" ? ("wide" as const) : ("narrow" as const),
        description: toMarkdown(m.description),
      }));

    const risks: MoatRisk[] = (Array.isArray(parsed.risks) ? parsed.risks : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        title: typeof r.title === "string" ? r.title : "Risk",
        severity: severities.includes(String(r.severity))
          ? (r.severity as MoatRisk["severity"])
          : ("medium" as const),
        description: toMarkdown(r.description),
      }));

    return {
      overallStrength: strengths.includes(String(parsed.overallStrength) as MoatStrength)
        ? (parsed.overallStrength as MoatStrength)
        : moats.length > 0
          ? "narrow"
          : "none",
      consensus: toMarkdown(parsed.consensus),
      moats,
      risks,
      durability: toMarkdown(parsed.durability),
    };
  }

  // Last resort — keep the raw text as the consensus so it reads as prose
  return {
    overallStrength: "none",
    consensus: text.replace(/```(?:json)?/g, "").trim(),
    moats: [],
    risks: [],
    durability: "",
  };
}
