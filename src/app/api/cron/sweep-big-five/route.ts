import { NextResponse } from "next/server";
import {
  loadUniverse,
  loadSectorMap,
  selectStalest,
  sweepTickers,
} from "@/lib/sweep-big-five";

// Each invocation sweeps the stalest slice of the universe within a time
// budget; hourly runs roll through all ~10k filers in ~3-4 days, keeping every
// row fresher than a week. Deterministic — no LLM.
//
// Triggered hourly by the GitHub Actions workflow (.github/workflows/
// sweep-big-five.yml), NOT the Vercel cron — the Hobby plan caps built-in cron
// at once/day, far too slow for the universe. maxDuration is 60 (the Hobby
// function ceiling); the internal budget exits cleanly just under it.
export const maxDuration = 60;

const TIME_BUDGET_MS = 55_000; // stay under the 60s function ceiling
const BATCH_SIZE = 120;
const FRESH_DAYS = 6;

export async function GET(request: Request) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" when the env var is set
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional overrides for manual runs (?batch=10&budgetMs=30000)
  const url = new URL(request.url);
  const batchSize = Math.min(
    parseInt(url.searchParams.get("batch") ?? String(BATCH_SIZE), 10) || BATCH_SIZE,
    500
  );
  const budgetMs = Math.min(
    parseInt(url.searchParams.get("budgetMs") ?? String(TIME_BUDGET_MS), 10) || TIME_BUDGET_MS,
    TIME_BUDGET_MS
  );

  const started = Date.now();
  const deadline = started + budgetMs;

  const [universe, sectorMap] = await Promise.all([loadUniverse(), loadSectorMap()]);
  const batch = await selectStalest(universe, batchSize, FRESH_DAYS);

  if (batch.length === 0) {
    return NextResponse.json({ status: "fresh", universe: universe.length });
  }

  const stats = await sweepTickers(batch, sectorMap, deadline);

  return NextResponse.json({
    status: "ok",
    universe: universe.length,
    batchSelected: batch.length,
    ...stats,
    elapsedMs: Date.now() - started,
  });
}
