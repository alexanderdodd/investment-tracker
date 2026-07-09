/**
 * Big Five sweep core — deterministic, no LLM. Shared by the local batch
 * script (scripts/sweep-big-five.ts, full universe in one run) and the
 * Vercel cron route (hourly time-budgeted batches of the stalest tickers,
 * rolling through the whole universe roughly weekly).
 */

import { eq, asc } from "drizzle-orm";
import { getDb } from "../db/index";
import { bigFiveScreen, stockClassifications, gicsSectors } from "../db/schema";
import { getOrBuildGrowthHistory } from "./sec-edgar/growth-history-cache";
import { buildStickerInputs } from "./sticker-inputs";
import { defaultGrowthRate, computeSticker, priceVerdict } from "./rule-one";
import { getYahooCrumb } from "./stock-metrics";

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
  for (const entry of Object.values(data)) {
    if (seenCik.has(entry.cik_str)) continue;
    seenCik.add(entry.cik_str);
    universe.push({ ticker: entry.ticker.toUpperCase(), name: entry.title });
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
 * The next tickers to sweep: never-swept universe members first, then the
 * stalest existing rows. This makes any caller — script loop or cron batch —
 * self-scheduling: repeated invocations roll through the whole universe.
 */
export async function selectStalest(
  universe: { ticker: string; name: string }[],
  count: number,
  freshDays: number
): Promise<{ ticker: string; name: string }[]> {
  const db = getDb();
  const existing = await db
    .select({ ticker: bigFiveScreen.ticker, generatedAt: bigFiveScreen.generatedAt })
    .from(bigFiveScreen)
    .orderBy(asc(bigFiveScreen.generatedAt));
  const byTicker = new Map(existing.map((r) => [r.ticker, r.generatedAt.getTime()]));
  const nameOf = new Map(universe.map((u) => [u.ticker, u.name]));

  const neverSwept = universe.filter((u) => !byTicker.has(u.ticker));
  const freshCutoff = Date.now() - freshDays * 24 * 60 * 60 * 1000;
  const stale = existing
    .filter((r) => r.generatedAt.getTime() <= freshCutoff && nameOf.has(r.ticker))
    .map((r) => ({ ticker: r.ticker, name: nameOf.get(r.ticker)! }));

  return [...neverSwept, ...stale].slice(0, count);
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
export async function sweepTickers(
  tickers: { ticker: string; name: string }[],
  sectorMap: Map<string, string>,
  deadline?: number,
  onProgress?: (done: number, total: number, stats: SweepStats) => void
): Promise<SweepStats> {
  const db = getDb();
  const stats: SweepStats = { swept: 0, qualifiers: 0, unavailable: 0, errors: 0 };
  const sweptTickers: string[] = [];

  for (const { ticker, name } of tickers) {
    if (deadline && Date.now() > deadline) break;
    try {
      const { payload } = await getOrBuildGrowthHistory(ticker);
      const s = payload.available ? payload.summary : null;
      const values = {
        roic10y: s?.roic.tenYear.value ?? null,
        sales10y: s?.salesGrowth.tenYear.value ?? null,
        eps10y: s?.epsGrowth.tenYear.value ?? null,
        equity10y: s?.equityGrowth.tenYear.value ?? null,
        fcf10y: s?.fcfGrowth.tenYear.value ?? null,
      };
      const score = Object.values(values).filter((v) => v !== null && v >= 0.1).length;
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
  }

  await enrichQuotes(sweptTickers);
  await enrichStickers(sweptTickers, deadline);
  return stats;
}

/** Batch price + market cap from Yahoo (90 symbols per call) */
async function enrichQuotes(tickers: string[]): Promise<void> {
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
        await db
          .update(bigFiveScreen)
          .set({
            price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null,
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
async function enrichStickers(tickers: string[], deadline?: number): Promise<void> {
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
  const targets = rows.filter(
    (r) => inBatch.has(r.ticker) && r.score >= 3 && (r.currency ?? "USD") === "USD"
  );
  for (const { ticker } of targets) {
    if (deadline && Date.now() > deadline) break;
    try {
      const inputs = await buildStickerInputs(ticker);
      const growth = defaultGrowthRate(inputs.equityGrowth?.value, inputs.analystGrowth);
      const calc = computeSticker(inputs.eps, growth, inputs.historicalHighPe);
      await db
        .update(bigFiveScreen)
        .set({
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
