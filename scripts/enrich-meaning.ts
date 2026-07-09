/**
 * Backfill "Meaning" extraction for Big Five qualifiers (score ≥3) that
 * don't have tags yet. One cheap LLM call per company (~$0.001); the full
 * backfill over ~500 qualifiers costs well under a dollar.
 *
 * Usage:
 *   npm run enrich-meaning                     # all unenriched qualifiers
 *   npm run enrich-meaning -- --limit 5        # smoke test
 *   npm run enrich-meaning -- --tickers AAPL,SBUX
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { enrichMeaning, findUnenrichedQualifiers } from "../src/lib/enrich-meaning";

interface Args {
  limit: number | null;
  tickers: string[] | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { limit: null, tickers: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--tickers")
      args.tickers = argv[++i].split(",").map((t) => t.trim().toUpperCase());
  }
  return args;
}

async function main() {
  const args = parseArgs();
  let tickers = args.tickers ?? (await findUnenrichedQualifiers());
  if (args.limit !== null) tickers = tickers.slice(0, args.limit);
  console.log(`Candidates: ${tickers.length}`);

  const stats = await enrichMeaning(tickers, undefined, (done, total) => {
    if (done % 20 === 0) console.log(`[${done}/${total}]`);
  });
  console.log(`Done. Enriched ${stats.enriched}, skipped ${stats.skipped}, failed ${stats.failed}.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
