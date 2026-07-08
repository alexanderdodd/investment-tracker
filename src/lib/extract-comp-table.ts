/**
 * Extracts the proxy statement's Summary Compensation Table.
 *
 * Unlike the Pay-versus-Performance disclosure, the SCT is not XBRL-tagged —
 * it's free-form HTML that varies by filer, so a cheap LLM converts the
 * relevant text section into structured rows. Runs once per ticker per
 * management-data cache cycle (24h).
 */

import { generateText } from "ai";
import { openrouter } from "./ai";

const EXTRACT_MODEL = "google/gemini-2.5-flash";
const MAX_CHUNK_CHARS = 28_000;

export interface OfficerComp {
  name: string;
  /** Fiscal year the row covers (latest year in the table) */
  fiscalYear: number | null;
  salary: number | null;
  /** Discretionary cash bonus (SCT "Bonus" column) */
  bonus: number | null;
  /** Performance-based cash (SCT "Non-Equity Incentive Plan Compensation") */
  nonEquityIncentive: number | null;
  stockAwards: number | null;
  optionAwards: number | null;
  otherComp: number | null;
  total: number | null;
}

export interface CompBreakdown {
  officers: OfficerComp[];
  /** One-sentence summary of what the annual bonus/incentive plan rewards */
  bonusPlanNote: string | null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slice the proxy text around the Summary Compensation Table section */
function sctChunk(proxyHtml: string): string | null {
  const text = htmlToText(proxyHtml);
  // "Summary Compensation Table" also appears in the table of contents —
  // pick the occurrence that is actually followed by a Salary column
  const re = /Summary Compensation Table/gi;
  let m: RegExpExecArray | null;
  let idx = -1;
  while ((m = re.exec(text)) !== null) {
    if (/salary/i.test(text.slice(m.index, m.index + 3_000))) {
      idx = m.index;
      break;
    }
  }
  if (idx === -1) return null;
  // Generous context after the heading (the table plus footnotes) and a
  // little before (occasionally CD&A incentive summary sits just above)
  const start = Math.max(0, idx - 3_000);
  return text.slice(start, idx + MAX_CHUNK_CHARS);
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const candidates: string[] = [text.trim()];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) ? v : null;

export async function extractCompBreakdown(proxyHtml: string): Promise<CompBreakdown | null> {
  const chunk = sctChunk(proxyHtml);
  if (!chunk) return null;

  const prompt = `Below is text extracted from an SEC proxy statement (DEF 14A) around the Summary Compensation Table.

For the MOST RECENT fiscal year only, extract each named executive officer's compensation in dollars (not thousands — expand if the table is in thousands). Also summarize in one sentence what the annual cash bonus / non-equity incentive plan rewards (the performance metrics), if the surrounding text says.

Respond with ONLY a JSON object:
{
  "fiscalYear": number | null,
  "officers": [
    {
      "name": string,               // as printed, without titles
      "salary": number | null,
      "bonus": number | null,               // "Bonus" column (discretionary cash)
      "nonEquityIncentive": number | null,  // "Non-Equity Incentive Plan Compensation"
      "stockAwards": number | null,
      "optionAwards": number | null,
      "otherComp": number | null,           // "All Other Compensation"
      "total": number | null
    }
  ],
  "bonusPlanNote": string | null
}

TEXT:
${chunk}`;

  try {
    const { text } = await generateText({ model: openrouter()(EXTRACT_MODEL), prompt });
    const parsed = tryParseJson(text);
    if (!parsed || !Array.isArray(parsed.officers)) return null;
    const fiscalYear = num(parsed.fiscalYear);
    const officers: OfficerComp[] = (parsed.officers as Record<string, unknown>[])
      .filter((o) => typeof o.name === "string" && (o.name as string).trim() !== "")
      .map((o) => ({
        name: (o.name as string).trim(),
        fiscalYear,
        salary: num(o.salary),
        bonus: num(o.bonus),
        nonEquityIncentive: num(o.nonEquityIncentive),
        stockAwards: num(o.stockAwards),
        optionAwards: num(o.optionAwards),
        otherComp: num(o.otherComp),
        total: num(o.total),
      }));
    if (officers.length === 0) return null;
    return {
      officers,
      bonusPlanNote:
        typeof parsed.bonusPlanNote === "string" && parsed.bonusPlanNote.trim() !== ""
          ? parsed.bonusPlanNote.trim()
          : null,
    };
  } catch {
    return null;
  }
}
