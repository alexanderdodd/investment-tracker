/**
 * "Meaning" extraction — one cheap LLM call per Big Five qualifier, at
 * screening time only. Converts the Yahoo business description into
 * controlled-vocabulary tags + a plain-English one-liner so screening by
 * interests is pure SQL afterwards. Never runs at query time.
 */

import { generateText } from "ai";
import { eq, inArray } from "drizzle-orm";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { bigFiveScreen, companyMeaning } from "../db/schema";
import { fetchCompanyProfile } from "./company-profile";
import { tryParseJson } from "./json-utils";
import { normalizeTags, vocabularyPromptBlock } from "./meaning-tags";

const EXTRACT_MODEL = "google/gemini-2.5-flash";
const RETRY_FAILED_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // no-description retries
const REFRESH_AFTER_MS = 180 * 24 * 60 * 60 * 1000; // periodic re-extraction

export interface MeaningExtraction {
  tags: string[];
  extraTags: string[];
  oneLiner: string | null;
}

export async function extractMeaning(input: {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  description: string;
}): Promise<MeaningExtraction | null> {
  const prompt = `You classify a public company for an investor's "circle of competence".
Company: ${input.companyName ?? input.ticker} (${input.ticker})${input.sector ? `, sector: ${input.sector}` : ""}.
Business description:
"""${input.description.slice(0, 2500)}"""

Choose tags ONLY from this vocabulary (use the exact "group:tag" form):
${vocabularyPromptBlock()}

Rules: 1-3 domain tags, 1-2 customer tags, 1-3 model tags, 0-3 theme tags.
If something essential is missing from the vocabulary, put up to 3 short
lowercase-kebab terms in extraTags instead — never invent vocabulary tags.

Output ONLY strict JSON:
{"tags": ["domain:...", "customer:...", "model:..."], "extraTags": [], "oneLiner": "<plain-English what-they-do, max 110 chars>"}`;

  try {
    const { text } = await generateText({ model: openrouter()(EXTRACT_MODEL), prompt });
    const parsed = tryParseJson(text);
    if (!parsed) return null;
    const rawTags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
    const rawExtra = Array.isArray(parsed.extraTags) ? parsed.extraTags.map(String) : [];
    const { tags, extra } = normalizeTags(rawTags);
    const { extra: extraNormalized } = normalizeTags(rawExtra);
    return {
      tags,
      extraTags: Array.from(new Set([...extra, ...extraNormalized])).slice(0, 6),
      oneLiner:
        typeof parsed.oneLiner === "string" && parsed.oneLiner.trim() !== ""
          ? parsed.oneLiner.trim().slice(0, 140)
          : null,
    };
  } catch {
    return null;
  }
}

export interface MeaningStats {
  enriched: number;
  skipped: number;
  failed: number;
}

/**
 * Enrich a batch of tickers, self-filtering to Big Five qualifiers
 * (score ≥3) that lack a fresh meaning row. Deadline-aware for serverless
 * callers; no-ops without an OpenRouter key.
 */
export async function enrichMeaning(
  tickers: string[],
  deadline?: number,
  onProgress?: (done: number, total: number) => void
): Promise<MeaningStats> {
  const stats: MeaningStats = { enriched: 0, skipped: 0, failed: 0 };
  if (tickers.length === 0 || !process.env.OPENROUTER_API_KEY) return stats;

  const db = getDb();
  const [rows, existing] = await Promise.all([
    db
      .select({
        ticker: bigFiveScreen.ticker,
        companyName: bigFiveScreen.companyName,
        sector: bigFiveScreen.sector,
        available: bigFiveScreen.available,
        score: bigFiveScreen.score,
      })
      .from(bigFiveScreen)
      .where(inArray(bigFiveScreen.ticker, tickers)),
    db
      .select({
        ticker: companyMeaning.ticker,
        attemptedAt: companyMeaning.attemptedAt,
        enrichedAt: companyMeaning.enrichedAt,
      })
      .from(companyMeaning)
      .where(inArray(companyMeaning.ticker, tickers)),
  ]);
  const meaningByTicker = new Map(existing.map((r) => [r.ticker, r]));

  const now = Date.now();
  const targets = rows.filter((r) => {
    if (!r.available || r.score < 3) return false;
    const m = meaningByTicker.get(r.ticker);
    if (!m) return true;
    if (m.enrichedAt) return now - m.enrichedAt.getTime() > REFRESH_AFTER_MS;
    return !m.attemptedAt || now - m.attemptedAt.getTime() > RETRY_FAILED_AFTER_MS;
  });
  stats.skipped = tickers.length - targets.length;

  let done = 0;
  for (const target of targets) {
    if (deadline && Date.now() > deadline) break;
    try {
      const profile = await fetchCompanyProfile(target.ticker);
      if (!profile.description) {
        // No description available — record the attempt, retry next week
        await db
          .insert(companyMeaning)
          .values({ ticker: target.ticker, attemptedAt: new Date() })
          .onConflictDoUpdate({
            target: companyMeaning.ticker,
            set: { attemptedAt: new Date() },
          });
        stats.failed++;
        continue;
      }

      const extraction = await extractMeaning({
        ticker: target.ticker,
        companyName: target.companyName,
        sector: target.sector ?? profile.sector,
        description: profile.description,
      });
      if (!extraction || extraction.tags.length === 0) {
        await db
          .insert(companyMeaning)
          .values({ ticker: target.ticker, description: profile.description, attemptedAt: new Date() })
          .onConflictDoUpdate({
            target: companyMeaning.ticker,
            set: { description: profile.description, attemptedAt: new Date() },
          });
        stats.failed++;
        continue;
      }

      const row = {
        tags: extraction.tags,
        extraTags: extraction.extraTags,
        oneLiner: extraction.oneLiner,
        description: profile.description,
        attemptedAt: new Date(),
        enrichedAt: new Date(),
      };
      await db
        .insert(companyMeaning)
        .values({ ticker: target.ticker, ...row })
        .onConflictDoUpdate({ target: companyMeaning.ticker, set: row });
      stats.enriched++;
    } catch {
      stats.failed++;
    }
    done++;
    onProgress?.(done, targets.length);
  }
  return stats;
}

/** All qualifier tickers still missing meaning enrichment (for backfill) */
export async function findUnenrichedQualifiers(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ ticker: bigFiveScreen.ticker, enrichedAt: companyMeaning.enrichedAt })
    .from(bigFiveScreen)
    .leftJoin(companyMeaning, eq(companyMeaning.ticker, bigFiveScreen.ticker))
    .where(eq(bigFiveScreen.available, true));
  // score filter applied by enrichMeaning itself; pre-filter to reduce batch
  return rows.filter((r) => !r.enrichedAt).map((r) => r.ticker);
}
