/**
 * LLM-generated management brief — the "Management" M of Rule #1's Four Ms.
 *
 * Uses the web-grounded OpenRouter model (same as the sector research
 * pipeline) to assess the CEO in Rule #1 terms: owner-orientation, tenure,
 * capital-allocation record, candor, recent statements, red flags.
 */

import { generateText } from "ai";
import { openrouter } from "./ai";
import type { ManagementPayload } from "./sec-edgar/management";

// Online model for web-grounded research (matches generate-sector-analysis.ts)
const RESEARCH_MODEL = "google/gemini-2.5-flash:online";

export interface ManagementBrief {
  ceoName: string | null;
  ceoSince: string | null;
  founderLed: boolean | null;
  /** Markdown: overall Rule #1 management assessment */
  assessment: string;
  /** Markdown: notable recent public statements / guidance with context */
  recentStatements: string;
  positives: string[];
  redFlags: string[];
}

interface OfficerContext {
  name: string;
  title: string;
  age: number | null;
  totalPay: number | null;
}

export interface BriefContext {
  ticker: string;
  companyName: string | null;
  officers: OfficerContext[];
  insiderSummary: string;
}

function summarizeInsiders(payload: ManagementPayload | null): string {
  if (!payload || !payload.available) return "No SEC insider transaction data available.";
  const recent = payload.transactions.slice(0, 40);
  const buys = recent.filter((t) => t.code === "P");
  const sells = recent.filter((t) => t.code === "S");
  const ceoTx = recent.filter((t) => t.isCeo);
  return [
    `Last ${recent.length} insider transactions from SEC Form 4 filings:`,
    `- Open-market purchases: ${buys.length}`,
    `- Sales: ${sells.length}`,
    `- CEO transactions: ${ceoTx.length > 0 ? ceoTx.map((t) => `${t.date} ${t.codeLabel} ${t.shares ?? "?"} shares`).slice(0, 6).join("; ") : "none"}`,
  ].join("\n");
}

export function buildBriefContext(
  ticker: string,
  companyName: string | null,
  officers: OfficerContext[],
  managementPayload: ManagementPayload | null
): BriefContext {
  return {
    ticker,
    companyName,
    officers,
    insiderSummary: summarizeInsiders(managementPayload),
  };
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^[\s\S]*?```(?:json)?\s*/m, (m) => (m.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/m, "")
    .trim();
}

export async function generateManagementBrief(ctx: BriefContext): Promise<ManagementBrief> {
  const officersText =
    ctx.officers.length > 0
      ? ctx.officers
          .map(
            (o) =>
              `- ${o.name} — ${o.title}${o.age ? `, age ${o.age}` : ""}${o.totalPay ? `, latest reported pay $${(o.totalPay / 1e6).toFixed(2)}M` : ""}`
          )
          .join("\n")
      : "Officer roster unavailable.";

  const prompt = `You are researching the management of ${ctx.companyName ?? ctx.ticker} (ticker ${ctx.ticker}) for a Rule #1 (Phil Town) style "Management" assessment. Use current web information.

KNOWN OFFICER ROSTER (from Yahoo Finance):
${officersText}

SEC INSIDER ACTIVITY SUMMARY:
${ctx.insiderSummary}

Research and answer:
1. Who is the CEO, since when, and are they a founder or owner-operator? What is their background and track record?
2. Capital allocation record: buybacks, dividends, acquisitions — value-creating or empire-building?
3. Candor: do they own mistakes in shareholder letters / earnings calls, or spin?
4. Notable recent public statements, guidance, or strategic commitments (last ~12 months) — quote or paraphrase with dates where possible.
5. Red flags: excessive compensation vs performance, heavy insider selling, accounting concerns, turnover in the C-suite.
6. Positives: skin in the game, long tenure with compounding results, disciplined capital allocation.

Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "ceoName": string | null,
  "ceoSince": string | null,        // e.g. "February 2014"
  "founderLed": boolean | null,
  "assessment": string,             // 2-4 paragraph markdown assessment in Rule #1 terms
  "recentStatements": string,       // markdown bullet list of notable recent statements with dates
  "positives": string[],            // short bullet phrases
  "redFlags": string[]              // short bullet phrases; empty array if none
}`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });

  const cleaned = stripJsonFences(text);
  try {
    const parsed = JSON.parse(cleaned) as ManagementBrief;
    return {
      ceoName: parsed.ceoName ?? null,
      ceoSince: parsed.ceoSince ?? null,
      founderLed: parsed.founderLed ?? null,
      assessment: parsed.assessment ?? "",
      recentStatements: parsed.recentStatements ?? "",
      positives: Array.isArray(parsed.positives) ? parsed.positives : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    };
  } catch {
    // Model ignored the JSON instruction — keep the raw text as the assessment
    return {
      ceoName: null,
      ceoSince: null,
      founderLed: null,
      assessment: text,
      recentStatements: "",
      positives: [],
      redFlags: [],
    };
  }
}
