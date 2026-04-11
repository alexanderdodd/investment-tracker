import { config } from "dotenv";
config({ path: ".env.local" });

import { generateStockValuation } from "../src/lib/generate-stock-valuation";

async function main() {
  const tickerIdx = process.argv.indexOf("--ticker");
  if (tickerIdx === -1 || tickerIdx + 1 >= process.argv.length) {
    console.error("Usage: npx tsx scripts/value-stock.ts --ticker AAPL");
    process.exit(1);
  }

  const ticker = process.argv[tickerIdx + 1].toUpperCase();
  console.log(`Generating valuation for ${ticker}...\n`);

  const result = await generateStockValuation(ticker);

  if (result.success) {
    console.log(`\n  ✓ ${ticker} valuation complete.`);
  } else {
    console.error(`\n  ✗ ${ticker}: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
