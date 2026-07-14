/**
 * Big Five sweep core — deterministic except one capped LLM step (Meaning
 * tag extraction, qualifiers only, ~$0.001 each). Shared by the local batch
 * script (scripts/sweep-big-five.ts, full universe in one run) and the
 * Vercel cron route (hourly time-budgeted batches of the stalest tickers,
 * rolling through the whole universe roughly weekly).
 */

import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  bigFiveScreen,
  stockClassifications,
  gicsSectors,
  watchlistItems,
  stockGrowthHistories,
  europeanListings,
} from "../db/schema";
import { getOrBuildGrowthHistory } from "./sec-edgar/growth-history-cache";
import { buildStickerInputs } from "./sticker-inputs";
import { defaultGrowthRate, computeSticker, priceVerdict } from "./rule-one";
import { getYahooCrumb } from "./stock-metrics";
import { enrichMeaning } from "./enrich-meaning";
import { normalizeCurrency } from "./currency";

const QUOTE_BATCH = 90;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export async function loadUniverse(): Promise<{ ticker: string; name: string }[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": "InvestmentTracker support@investment-tracker.app" },
  });
  const data: Record<string, { cik_str: number; ticker: string; title: string }> =
    await res.json();
  // Multiple share classes share a CIK (GOOGL/GOOG) — one sweep per company
  const seenCik = new Set<number>();
  const universe: { ticker: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const entry of Object.values(data)) {
    if (seenCik.has(entry.cik_str)) continue;
    seenCik.add(entry.cik_str);
    const ticker = entry.ticker.toUpperCase();
    seen.add(ticker);
    universe.push({ ticker, name: entry.title });
  }

  // European (ESEF) tickers aren't in the SEC list. Seed them from two places:
  //  1. `european_listings` — proactively discovered via the region screener
  //     (npm run discover-european), giving the screener real EU coverage.
  //  2. the growth cache — any European ticker already viewed on its page.
  const db = getDb();
  const [euListed, cached] = await Promise.all([
    db
      .select({ ticker: europeanListings.ticker, name: europeanListings.companyName })
      .from(europeanListings),
    db.select({ ticker: stockGrowthHistories.ticker }).from(stockGrowthHistories),
  ]);
  for (const { ticker, name } of euListed) {
    const t = ticker.toUpperCase();
    if (!seen.has(t)) {
      seen.add(t);
      universe.push({ ticker: t, name: name ?? t });
    }
  }
  for (const { ticker } of cached) {
    if (!seen.has(ticker)) {
      seen.add(ticker);
      universe.push({ ticker, name: ticker });
    }
  }
  return universe;
}

export async function loadSectorMap(): Promise<Map<string, string>> {
  const db = getDb();
  const sectors = await db.select().from(gicsSectors);
  const sectorName = new Map(sectors.map((s) => [s.id, s.name]));
  const classifications = await db
    .select({ ticker: stockClassifications.ticker, sectorId: stockClassifications.sectorId })
    .from(stockClassifications);
  const map = new Map<string, string>();
  for (const c of classifications) {
    const name = c.sectorId ? sectorName.get(c.sectorId) : undefined;
    if (name) map.set(c.ticker.toUpperCase(), name);
  }
  return map;
}

/**
 * The next tickers to sweep, in priority order:
 *   1. never-swept universe members (complete the map first)
 *   2. stale rows that matter — Big Five qualifiers (score ≥3) and
 *      watchlisted tickers (what the user actually looks at)
 *   3. remaining stale rows, oldest first
 *
 * This makes any caller — script loop or cron batch — self-scheduling.
 * Priority ordering matters most on Vercel Hobby, where the cron fires only
 * once a day (~120 tickers/day): the interesting rows stay fresh while the
 * long tail rotates slowly (or via local bulk sweeps).
 */
export async function selectStalest(
  universe: { ticker: string; name: string }[],
  count: number,
  freshDays: number
): Promise<{ ticker: string; name: string }[]> {
  const db = getDb();
  const [existing, watchlist] = await Promise.all([
    db
      .select({
        ticker: bigFiveScreen.ticker,
        generatedAt: bigFiveScreen.generatedAt,
        score: bigFiveScreen.score,
        available: bigFiveScreen.available,
      })
      .from(bigFiveScreen)
      .orderBy(asc(bigFiveScreen.generatedAt)),
    db.selectDistinct({ ticker: watchlistItems.ticker }).from(watchlistItems),
  ]);
  const watched = new Set(watchlist.map((w) => w.ticker.toUpperCase()));
  const byTicker = new Set(existing.map((r) => r.ticker));
  const nameOf = new Map(universe.map((u) => [u.ticker, u.name]));

  const neverSwept = universe.filter((u) => !byTicker.has(u.ticker));

  const freshCutoff = Date.now() - freshDays * 24 * 60 * 60 * 1000;
  const stale = existing.filter(
    (r) => r.generatedAt.getTime() <= freshCutoff && nameOf.has(r.ticker)
  );
  const isPriority = (r: (typeof stale)[number]) =>
    watched.has(r.ticker) || (r.available && r.score >= 3);
  const stalePriority = stale.filter(isPriority);
  const staleRest = stale.filter((r) => !isPriority(r));

  return [...neverSwept, ...stalePriority, ...staleRest]
    .slice(0, count)
    .map((r) => ({ ticker: r.ticker, name: nameOf.get(r.ticker)! }));
}

export interface SweepStats {
  swept: number;
  qualifiers: number;
  unavailable: number;
  errors: number;
}

/**
 * Sweep a list of tickers: growth history → Big Five score → row upsert,
 * then quotes and sticker/MOS for the batch. `deadline` (ms epoch) stops the
 * scoring loop early so serverless callers stay inside maxDuration.
 */
// Enrich in chunks during long sweeps so new rows appear on /screener with
// market cap + sticker immediately, not hours later at the end of the run
const ENRICH_EVERY = 150;

export async function sweepTickers(
  tickers: { ticker: string; name: string }[],
  sectorMap: Map<string, string>,
  deadline?: number,
  onProgress?: (done: number, total: number, stats: SweepStats) => void
): Promise<SweepStats> {
  const db = getDb();
  const stats: SweepStats = { swept: 0, qualifiers: 0, unavailable: 0, errors: 0 };
  const sweptTickers: string[] = [];
  let enrichedUpTo = 0;

  for (const { ticker, name } of tickers) {
    if (deadline && Date.now() > deadline) break;
    try {
      const { payload } = await getOrBuildGrowthHistory(ticker);
      const s = payload.available ? payload.summary : null;
      const metrics = [s?.roic, s?.salesGrowth, s?.epsGrowth, s?.equityGrowth, s?.fcfGrowth];
      const values = {
        roic10y: s?.roic.tenYear.value ?? null,
        roic5y: s?.roic.fiveYear.value ?? null,
        roic1y: s?.roic.oneYear.value ?? null,
        sales10y: s?.salesGrowth.tenYear.value ?? null,
        sales5y: s?.salesGrowth.fiveYear.value ?? null,
        sales1y: s?.salesGrowth.oneYear.value ?? null,
        eps10y: s?.epsGrowth.tenYear.value ?? null,
        eps5y: s?.epsGrowth.fiveYear.value ?? null,
        eps1y: s?.epsGrowth.oneYear.value ?? null,
        equity10y: s?.equityGrowth.tenYear.value ?? null,
        equity5y: s?.equityGrowth.fiveYear.value ?? null,
        equity1y: s?.equityGrowth.oneYear.value ?? null,
        fcf10y: s?.fcfGrowth.tenYear.value ?? null,
        fcf5y: s?.fcfGrowth.fiveYear.value ?? null,
        fcf1y: s?.fcfGrowth.oneYear.value ?? null,
      };
      // Rule #1 is "≥10%/yr on all five, CONSISTENTLY" — a metric only
      // counts when 10y AND 5y AND 1y all clear 10% (nulls fail)
      const score = metrics.filter(
        (m) =>
          m &&
          [m.tenYear.value, m.fiveYear.value, m.oneYear.value].every(
            (v) => v !== null && v >= 0.1
          )
      ).length;
      const spans = s
        ? [s.roic.tenYear, s.salesGrowth.tenYear, s.epsGrowth.tenYear, s.equityGrowth.tenYear, s.fcfGrowth.tenYear]
            .map((p) => p.spanYears)
            .filter((v): v is number => v !== null)
        : [];

      if (!payload.available) stats.unavailable++;
      if (payload.available && score >= 3) stats.qualifiers++;

      const row = {
        companyName: payload.companyName ?? name,
        sector: sectorMap.get(ticker) ?? null,
        currency: payload.currency ?? null,
        available: payload.available,
        score,
        ...values,
        minSpanYears: spans.length > 0 ? Math.min(...spans) : null,
        generatedAt: new Date(),
      };
      await db
        .insert(bigFiveScreen)
        .values({ ticker, ...row })
        .onConflictDoUpdate({ target: bigFiveScreen.ticker, set: row });
      sweptTickers.push(ticker);
      stats.swept++;
    } catch {
      stats.errors++;
      // Record the failure as an unavailable row — otherwise never-swept
      // tickers that 404 (no XBRL filings) would head the stale queue forever
      try {
        const row = {
          companyName: name,
          available: false,
          score: 0,
          generatedAt: new Date(),
        };
        await db
          .insert(bigFiveScreen)
          .values({ ticker, ...row })
          .onConflictDoUpdate({ target: bigFiveScreen.ticker, set: row });
      } catch {
        // DB unavailable — nothing more to do
      }
    }
    onProgress?.(stats.swept + stats.errors, tickers.length, stats);

    if (sweptTickers.length - enrichedUpTo >= ENRICH_EVERY) {
      const chunk = sweptTickers.slice(enrichedUpTo);
      enrichedUpTo = sweptTickers.length;
      await enrichQuotes(chunk);
      await enrichStickers(chunk, deadline);
      await enrichMeaning(chunk, deadline);
    }
  }

  const finalChunk = sweptTickers.slice(enrichedUpTo);
  await enrichQuotes(finalChunk);
  await enrichStickers(finalChunk, deadline);
  // Meaning tags: the sweep's one capped LLM step — new qualifiers only
  // (a handful per day in steady state), always after the deterministic data
  await enrichMeaning(finalChunk, deadline);
  return stats;
}

/** Batch price + market cap from Yahoo (90 symbols per call) */
export async function enrichQuotes(tickers: string[]): Promise<void> {
  if (tickers.length === 0) return;
  const db = getDb();
  let crumb: string, cookie: string;
  try {
    ({ crumb, cookie } = await getYahooCrumb());
  } catch {
    return;
  }
  for (let i = 0; i < tickers.length; i += QUOTE_BATCH) {
    const batch = tickers.slice(i, i + QUOTE_BATCH);
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(",")}&crumb=${encodeURIComponent(crumb)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
      if (!res.ok) continue;
      const json = await res.json();
      for (const q of json?.quoteResponse?.result ?? []) {
        // Normalise minor-unit quotes (UK pence etc.) to the major unit. The
        // money columns (price/sticker/mos) are all in the QUOTE currency, so
        // store that as the row's currency — not the filing currency, which
        // differs for e.g. AstraZeneca (files USD, trades in GBP).
        const { currency, divisor } = normalizeCurrency(q.currency);
        await db
          .update(bigFiveScreen)
          .set({
            currency: currency ?? undefined,
            price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice / divisor : null,
            marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
          })
          .where(eq(bigFiveScreen.ticker, String(q.symbol).toUpperCase()));
      }
    } catch {
      // batch failed — skip
    }
  }
}

/** Sticker + MOS for USD-filing qualifiers in the batch */
export async function enrichStickers(tickers: string[], deadline?: number): Promise<void> {
  if (tickers.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({
      ticker: bigFiveScreen.ticker,
      currency: bigFiveScreen.currency,
      score: bigFiveScreen.score,
    })
    .from(bigFiveScreen);
  const inBatch = new Set(tickers);
  // buildStickerInputs self-gates on filing-vs-quote currency match, so
  // native European (EUR/EUR) qualifiers get stickers too; mismatched ADRs
  // come back null and stay blank
  const targets = rows.filter((r) => inBatch.has(r.ticker) && r.score >= 3);
  for (const { ticker } of targets) {
    if (deadline && Date.now() > deadline) break;
    try {
      const inputs = await buildStickerInputs(ticker);
      const growth = defaultGrowthRate(inputs.equityGrowth?.value, inputs.analystGrowth);
      const calc = computeSticker(inputs.eps, growth, inputs.historicalHighPe);
      await db
        .update(bigFiveScreen)
        .set({
          currency: inputs.quoteCurrency ?? undefined,
          price: inputs.currentPrice ?? undefined,
          sticker: calc?.sticker ?? null,
          mos: calc?.mos ?? null,
          verdict: priceVerdict(inputs.currentPrice, calc),
        })
        .where(eq(bigFiveScreen.ticker, ticker));
    } catch {
      // leave nulls
    }
  }
}
