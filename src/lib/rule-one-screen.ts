/**
 * Rule #1 industry screen — Phil Town's methodology as a staged funnel:
 *
 *   Stage 1  Big Five: ROIC + the four growth rates (10y) must clear 10%/yr
 *   Stage 2  Moat & management: LLM-researched moat (Town's five moat types)
 *            and management sentiment for every Big Five passer
 *   Stage 3  Sticker price last: is it trading below fair value / MOS?
 *
 * This follows the Four Ms order — judge the business quality first, look
 * at the price last. Stages 1 and 3 are fully deterministic (SEC EDGAR +
 * Yahoo). Stage 2 is the only LLM step, capped at MAX_ASSESSED stocks.
 */

import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { getDb } from "../db/index";
import { gicsIndustries, stockClassifications } from "../db/schema";
import { getOrBuildGrowthHistory } from "./sec-edgar/growth-history-cache";
import { buildStickerInputs } from "./sticker-inputs";
import { defaultGrowthRate, computeSticker, priceVerdict } from "./rule-one";
import { openrouter } from "./ai";

const RESEARCH_MODEL = "google/gemini-2.5-flash:online";

const MAX_STOCKS = 25;
const MAX_ASSESSED = 5;
const BIG_FIVE_PASS_SCORE = 3;

export interface RuleOneBigFive {
  roic: number | null;
  sales: number | null;
  eps: number | null;
  equity: number | null;
  fcf: number | null;
}

export interface RuleOneMoat {
  type: "brand" | "secret" | "toll_bridge" | "switching" | "price" | "none";
  strength: "wide" | "narrow" | "none";
  rationale: string;
}

export interface RuleOneManagementSentiment {
  sentiment: "positive" | "neutral" | "negative";
  notes: string;
}

export interface RuleOneStockResult {
  ticker: string;
  companyName: string | null;
  bigFive: RuleOneBigFive;
  bigFiveScore: number;
  passedBigFive: boolean;
  dataAvailable: boolean;
  // Stage 2 (Big Five passers only)
  currentPrice: number | null;
  sticker: number | null;
  mos: number | null;
  /** 1 − price/sticker: positive = trading below fair value */
  discountToSticker: number | null;
  verdict: "mos" | "sticker" | "above" | null;
  // Stage 3 (finalists only)
  moat: RuleOneMoat | null;
  management: RuleOneManagementSentiment | null;
}

export interface RuleOneScreenResult {
  industrySlug: string;
  industryName: string;
  totalStocks: number;
  evaluated: number;
  passedBigFive: number;
  belowSticker: number;
  stocks: RuleOneStockResult[];
}

export type RuleOneProgress = {
  stage: 1 | 2 | 3;
  message: string;
  done: number;
  total: number;
};

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

async function assessMoatAndManagement(
  ticker: string,
  companyName: string | null,
  bigFive: RuleOneBigFive
): Promise<{ moat: RuleOneMoat; management: RuleOneManagementSentiment } | null> {
  const fmt = (v: number | null) => (v !== null ? `${(v * 100).toFixed(1)}%` : "n/a");
  const prompt = `You are assessing ${companyName ?? ticker} (ticker ${ticker}) for Phil Town's Rule #1 "Moat" and "Management" checks. Use current web information.

Its Big Five numbers (10-year): ROIC ${fmt(bigFive.roic)}, sales growth ${fmt(bigFive.sales)}, EPS growth ${fmt(bigFive.eps)}, equity growth ${fmt(bigFive.equity)}, FCF growth ${fmt(bigFive.fcf)}.

1. MOAT — which of Town's five moat types best fits, if any?
   - brand (consumers pay up for the name)
   - secret (patents, trade secrets)
   - toll_bridge (monopoly-like position customers must pass through)
   - switching (too painful/costly to leave)
   - price (structural lowest-cost producer)
   Judge whether the moat is wide, narrow, or none, and justify briefly with evidence (market share, pricing power, competitive dynamics).

2. MANAGEMENT — overall sentiment on the CEO/leadership right now: owner-oriented and candid (positive), mixed (neutral), or concerning (negative)? One short paragraph of justification citing anything recent (tenure, insider activity, controversies, execution).

Respond with ONLY a JSON object:
{
  "moatType": "brand" | "secret" | "toll_bridge" | "switching" | "price" | "none",
  "moatStrength": "wide" | "narrow" | "none",
  "moatRationale": string,
  "managementSentiment": "positive" | "neutral" | "negative",
  "managementNotes": string
}`;

  try {
    const { text } = await generateText({ model: openrouter()(RESEARCH_MODEL), prompt });
    const parsed = tryParseJson(text);
    if (!parsed) return null;
    const moatTypes = ["brand", "secret", "toll_bridge", "switching", "price", "none"];
    const strengths = ["wide", "narrow", "none"];
    const sentiments = ["positive", "neutral", "negative"];
    return {
      moat: {
        type: moatTypes.includes(String(parsed.moatType))
          ? (parsed.moatType as RuleOneMoat["type"])
          : "none",
        strength: strengths.includes(String(parsed.moatStrength))
          ? (parsed.moatStrength as RuleOneMoat["strength"])
          : "none",
        rationale: typeof parsed.moatRationale === "string" ? parsed.moatRationale : "",
      },
      management: {
        sentiment: sentiments.includes(String(parsed.managementSentiment))
          ? (parsed.managementSentiment as RuleOneManagementSentiment["sentiment"])
          : "neutral",
        notes: typeof parsed.managementNotes === "string" ? parsed.managementNotes : "",
      },
    };
  } catch {
    return null;
  }
}

export async function runRuleOneScreen(
  industrySlug: string,
  onProgress?: (p: RuleOneProgress) => void
): Promise<RuleOneScreenResult | null> {
  const db = getDb();

  const industries = await db
    .select()
    .from(gicsIndustries)
    .where(eq(gicsIndustries.slug, industrySlug));
  if (industries.length === 0) return null;
  const industry = industries[0];

  const classifications = await db
    .select()
    .from(stockClassifications)
    .where(eq(stockClassifications.industryId, industry.id));

  const universe = classifications.slice(0, MAX_STOCKS);
  const results: RuleOneStockResult[] = [];

  // Stage 1: Big Five
  let done = 0;
  for (const stock of universe) {
    onProgress?.({
      stage: 1,
      message: `Big Five: ${stock.ticker}`,
      done,
      total: universe.length,
    });
    let bigFive: RuleOneBigFive = { roic: null, sales: null, eps: null, equity: null, fcf: null };
    let dataAvailable = false;
    try {
      const { payload } = await getOrBuildGrowthHistory(stock.ticker);
      if (payload.available && payload.summary) {
        dataAvailable = true;
        bigFive = {
          roic: payload.summary.roic.tenYear.value,
          sales: payload.summary.salesGrowth.tenYear.value,
          eps: payload.summary.epsGrowth.tenYear.value,
          equity: payload.summary.equityGrowth.tenYear.value,
          fcf: payload.summary.fcfGrowth.tenYear.value,
        };
      }
    } catch {
      // leave unavailable
    }
    const score = Object.values(bigFive).filter((v) => v !== null && v >= 0.1).length;
    results.push({
      ticker: stock.ticker,
      companyName: stock.companyName,
      bigFive,
      bigFiveScore: score,
      passedBigFive: dataAvailable && score >= BIG_FIVE_PASS_SCORE,
      dataAvailable,
      currentPrice: null,
      sticker: null,
      mos: null,
      discountToSticker: null,
      verdict: null,
      moat: null,
      management: null,
    });
    done++;
  }

  // Stage 2: moat + management for EVERY Big Five passer (best scores first
  // when the cap bites) — judge the business before looking at the price
  const passers = results.filter((r) => r.passedBigFive);
  const assessed = [...passers]
    .sort((a, b) => b.bigFiveScore - a.bigFiveScore)
    .slice(0, MAX_ASSESSED);
  done = 0;
  for (const r of assessed) {
    onProgress?.({
      stage: 2,
      message: `Moat & management: ${r.ticker}`,
      done,
      total: assessed.length,
    });
    const assessment = await assessMoatAndManagement(r.ticker, r.companyName, r.bigFive);
    if (assessment) {
      r.moat = assessment.moat;
      r.management = assessment.management;
    }
    done++;
  }

  // Stage 3: sticker price last — only now does the price enter the picture
  done = 0;
  for (const r of passers) {
    onProgress?.({
      stage: 3,
      message: `Sticker price: ${r.ticker}`,
      done,
      total: passers.length,
    });
    try {
      const inputs = await buildStickerInputs(r.ticker);
      const growth = defaultGrowthRate(inputs.equityGrowth?.value, inputs.analystGrowth);
      const calc = computeSticker(inputs.eps, growth, inputs.historicalHighPe);
      r.currentPrice = inputs.currentPrice;
      if (calc && inputs.currentPrice !== null) {
        r.sticker = calc.sticker;
        r.mos = calc.mos;
        r.discountToSticker = 1 - inputs.currentPrice / calc.sticker;
        r.verdict = priceVerdict(inputs.currentPrice, calc);
      }
    } catch {
      // leave nulls
    }
    done++;
  }

  const belowSticker = passers.filter(
    (r) => r.verdict === "mos" || r.verdict === "sticker"
  ).length;

  // Order: finalists by discount, then remaining passers, then the rest by score
  results.sort((a, b) => {
    const aFinal = a.moat !== null ? 1 : 0;
    const bFinal = b.moat !== null ? 1 : 0;
    if (aFinal !== bFinal) return bFinal - aFinal;
    if (a.passedBigFive !== b.passedBigFive) return a.passedBigFive ? -1 : 1;
    if (a.passedBigFive && b.passedBigFive) {
      return (b.discountToSticker ?? -Infinity) - (a.discountToSticker ?? -Infinity);
    }
    return b.bigFiveScore - a.bigFiveScore;
  });

  return {
    industrySlug,
    industryName: industry.name,
    totalStocks: classifications.length,
    evaluated: universe.length,
    passedBigFive: passers.length,
    belowSticker,
    stocks: results,
  };
}
