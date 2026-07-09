/**
 * All-stocks Big Five sweep — pure deterministic number crunching, no LLM.
 *
 * Local batch runner over the shared sweep core (src/lib/sweep-big-five.ts);
 * the Vercel cron route runs the same core in hourly time-budgeted slices.
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

import {
  loadUniverse,
  loadSectorMap,
  selectStalest,
  sweepTickers,
} from "../src/lib/sweep-big-five";

const FRESH_DAYS = 6;

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

async function main() {
  const args = parseArgs();

  console.log("Loading universe from SEC…");
  let universe = await loadUniverse();
  if (args.tickers) universe = universe.filter((u) => args.tickers!.includes(u.ticker));
  console.log(`Universe: ${universe.length} companies`);

  const sectorMap = await loadSectorMap();

  let todo = args.force
    ? universe
    : await selectStalest(universe, universe.length, FRESH_DAYS);
  if (args.limit !== null) todo = todo.slice(0, args.limit);
  console.log(`To sweep: ${todo.length}`);

  const stats = await sweepTickers(todo, sectorMap, undefined, (done, total, s) => {
    if (done % 25 === 0) {
      console.log(`[${done}/${total}] — ${s.qualifiers} qualifiers, ${s.unavailable} unavailable, ${s.errors} errors`);
    }
  });

  console.log(
    `Done. Swept ${stats.swept}, qualifiers (≥3/5): ${stats.qualifiers}, unavailable: ${stats.unavailable}, errors: ${stats.errors}.`
  );
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
