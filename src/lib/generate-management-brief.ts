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
  /** Markdown: comp structure — salary/bonus/equity mix and what the
   *  incentive plan actually rewards (from the proxy CD&A) */
  compensation: string;
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
  compSummary: string;
}

function summarizeComp(payload: ManagementPayload | null): string {
  const comp = payload?.ceoComp ?? [];
  if (comp.length === 0) return "No proxy compensation data extracted.";
  return (
    "CEO total compensation per the proxy statement's Summary Compensation Table:\n" +
    comp
      .map((c) => `- FY${c.fiscalYear}: $${(c.totalComp / 1e6).toFixed(1)}M total comp` +
        (c.compActuallyPaid !== null ? ` ($${(c.compActuallyPaid / 1e6).toFixed(1)}M "actually paid" with equity marked to market)` : ""))
      .join("\n")
  );
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
    compSummary: summarizeComp(managementPayload),
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

CEO COMPENSATION (extracted from the SEC proxy statement — authoritative; the Yahoo pay figures above exclude equity awards):
${ctx.compSummary}

Research and answer:
1. Who is the CEO, since when, and are they a founder or owner-operator? What is their background and track record?
2. Capital allocation record: buybacks, dividends, acquisitions — value-creating or empire-building?
3. Compensation structure: actively search the web for the company's latest proxy statement (DEF 14A) CD&A summary — what is the CEO's base salary vs cash incentive vs stock awards mix, and what metrics does the annual bonus actually reward (revenue, operating income, TSR, strategic/operational goals)? Use the authoritative SCT totals provided above, not the Yahoo pay figure. Any recent say-on-pay controversy?
4. Candor: do they own mistakes in shareholder letters / earnings calls, or spin?
5. Notable recent public statements, guidance, or strategic commitments (last ~12 months) — quote or paraphrase with dates where possible.
6. Red flags: excessive compensation vs performance, heavy insider selling, accounting concerns, turnover in the C-suite.
7. Positives: skin in the game, long tenure with compounding results, disciplined capital allocation.

Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these fields:
{
  "ceoName": string | null,
  "ceoSince": string | null,        // e.g. "February 2014"
  "founderLed": boolean | null,
  "assessment": string,             // 2-4 paragraph markdown assessment in Rule #1 terms
  "compensation": string,           // markdown: salary/bonus/equity mix and what the incentive metrics reward
  "recentStatements": string,       // markdown bullet list of notable recent statements with dates
  "positives": string[],            // short bullet phrases
  "redFlags": string[]              // short bullet phrases; empty array if none
}`;

  const { text } = await generateText({
    model: openrouter()(RESEARCH_MODEL),
    prompt,
  });

  // Models occasionally return markdown fields as string arrays — coerce
  const toMarkdown = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((x) => `- ${String(x)}`).join("\n");
    return "";
  };

  const cleaned = stripJsonFences(text);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      ceoName: typeof parsed.ceoName === "string" ? parsed.ceoName : null,
      ceoSince: typeof parsed.ceoSince === "string" ? parsed.ceoSince : null,
      founderLed: typeof parsed.founderLed === "boolean" ? parsed.founderLed : null,
      assessment: toMarkdown(parsed.assessment),
      compensation: toMarkdown(parsed.compensation),
      recentStatements: toMarkdown(parsed.recentStatements),
      positives: Array.isArray(parsed.positives) ? parsed.positives.map(String) : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
    };
  } catch {
    // Model ignored the JSON instruction — keep the raw text as the assessment
    return {
      ceoName: null,
      ceoSince: null,
      founderLed: null,
      assessment: text,
      compensation: "",
      recentStatements: "",
      positives: [],
      redFlags: [],
    };
  }
}
