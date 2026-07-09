/**
 * All-stocks Big Five sweep — pure deterministic number crunching, no LLM.
 *
 * Walks every SEC filer (company_tickers.json, ~10k tickers, deduped by CIK),
 * builds/reuses the cached growth history, scores the Big Five, and upserts
 * one row per ticker into big_five_screen for the /screener page.
 *
 * Resumable and incremental: rows fresher than FRESH_DAYS are skipped, and
 * the underlying growth cache means re-runs only pay for stale tickers.
 *
 * Usage:
 *   npm run sweep-big-five                  # full universe (first run ~3-4h)
 *   npm run sweep-big-five -- --limit 50    # test run
 *   npm run sweep-big-five -- --force       # ignore row freshness
 *   npm run sweep-big-five -- --tickers AAPL,MSFT
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { bigFiveScreen, stockClassifications, gicsSectors } from "../src/db/schema";
import { getOrBuildGrowthHistory } from "../src/lib/sec-edgar/growth-history-cache";
import { buildStickerInputs } from "../src/lib/sticker-inputs";
import { defaultGrowthRate, computeSticker, priceVerdict } from "../src/lib/rule-one";
import { getYahooCrumb } from "../src/lib/stock-metrics";

const FRESH_DAYS = 6;
const QUOTE_BATCH = 90;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface Args {
  limit: number | null;
  force: boolean;
  tickers: string[] | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { limit: null, force: false, tickers: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--tickers") args.tickers = argv[++i].split(",").map((t) => t.trim().toUpperCase());
  }
  return args;
}

async function loadUniverse(): Promise<{ ticker: string; name: string }[]> {
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

async function loadSectorMap(): Promise<Map<string, string>> {
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

/** Batch price + market cap from Yahoo (90 symbols per call) */
async function fetchQuotes(tickers: string[]): Promise<Map<string, { price: number | null; marketCap: number | null }>> {
  const out = new Map<string, { price: number | null; marketCap: number | null }>();
  if (tickers.length === 0) return out;
  let crumb: string, cookie: string;
  try {
    ({ crumb, cookie } = await getYahooCrumb());
  } catch {
    return out;
  }
  for (let i = 0; i < tickers.length; i += QUOTE_BATCH) {
    const batch = tickers.slice(i, i + QUOTE_BATCH);
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(",")}&crumb=${encodeURIComponent(crumb)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
      if (!res.ok) continue;
      const json = await res.json();
      for (const q of json?.quoteResponse?.result ?? []) {
        out.set(String(q.symbol).toUpperCase(), {
          price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null,
          marketCap: typeof q.marketCap === "number" ? q.marketCap : null,
        });
      }
    } catch {
      // batch failed — skip
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const db = getDb();

  console.log("Loading universe from SEC…");
  let universe = await loadUniverse();
  if (args.tickers) universe = universe.filter((u) => args.tickers!.includes(u.ticker));
  console.log(`Universe: ${universe.length} companies`);

  const sectorMap = await loadSectorMap();

  // Skip rows swept recently (resumability + incremental re-runs)
  const existing = await db
    .select({ ticker: bigFiveScreen.ticker, generatedAt: bigFiveScreen.generatedAt })
    .from(bigFiveScreen);
  const freshCutoff = Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000;
  const fresh = new Set(
    existing.filter((r) => r.generatedAt.getTime() > freshCutoff).map((r) => r.ticker)
  );

  let todo = universe.filter((u) => args.force || !fresh.has(u.ticker));
  if (args.limit !== null) todo = todo.slice(0, args.limit);
  console.log(`To sweep: ${todo.length} (${fresh.size} fresh rows skipped)`);

  let done = 0;
  let qualifiers = 0;
  let unavailable = 0;
  const sweptTickers: string[] = [];

  for (const { ticker, name } of todo) {
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

      if (!payload.available) unavailable++;
      if (payload.available && score >= 3) qualifiers++;

      await db
        .insert(bigFiveScreen)
        .values({
          ticker,
          companyName: payload.companyName ?? name,
          sector: sectorMap.get(ticker) ?? null,
          currency: payload.currency ?? null,
          available: payload.available,
          score,
          ...values,
          minSpanYears: spans.length > 0 ? Math.min(...spans) : null,
          generatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: bigFiveScreen.ticker,
          set: {
            companyName: payload.companyName ?? name,
            sector: sectorMap.get(ticker) ?? null,
            currency: payload.currency ?? null,
            available: payload.available,
            score,
            ...values,
            minSpanYears: spans.length > 0 ? Math.min(...spans) : null,
            generatedAt: new Date(),
          },
        });
      sweptTickers.push(ticker);
    } catch (err) {
      console.log(`  ! ${ticker}: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
    }
    done++;
    if (done % 25 === 0) {
      console.log(`[${done}/${todo.length}] swept — ${qualifiers} qualifiers, ${unavailable} unavailable`);
    }
  }

  // Enrich swept rows with price + market cap (batched, cheap)
  console.log("Fetching quotes for market cap / price…");
  const quotes = await fetchQuotes(sweptTickers);
  for (const [ticker, q] of quotes) {
    await db
      .update(bigFiveScreen)
      .set({ price: q.price, marketCap: q.marketCap })
      .where(eq(bigFiveScreen.ticker, ticker));
  }

  // Sticker + MOS for qualifiers only (needs one extra price-history call
  // each; skip non-USD filers — their EPS can't be priced against USD quotes)
  const qualifierRows = await db
    .select({ ticker: bigFiveScreen.ticker, currency: bigFiveScreen.currency, score: bigFiveScreen.score })
    .from(bigFiveScreen)
    .where(inArray(bigFiveScreen.ticker, sweptTickers));
  const stickerTargets = qualifierRows.filter(
    (r) => r.score >= 3 && (r.currency ?? "USD") === "USD"
  );
  console.log(`Computing sticker prices for ${stickerTargets.length} qualifiers…`);
  let stickerDone = 0;
  for (const { ticker } of stickerTargets) {
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
    stickerDone++;
    if (stickerDone % 25 === 0) console.log(`  sticker ${stickerDone}/${stickerTargets.length}`);
  }

  console.log(
    `Done. Swept ${sweptTickers.length}, qualifiers (≥3/5): ${qualifiers}, unavailable: ${unavailable}.`
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
