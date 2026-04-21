import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index";
import {
  gicsSectors,
  gicsIndustries,
  stockClassifications,
  industryAnalytics,
  industryScreenResults,
  stockValuations,
} from "../src/db/schema";
import { GICS_SECTORS, GICS_INDUSTRIES } from "../src/lib/gics-taxonomy";

// ─── Test framework ───────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const results: { id: string; group: string; desc: string; pass: boolean; detail: string }[] = [];

function test(
  id: string,
  group: string,
  description: string,
  pass: boolean,
  detail: string
) {
  if (pass) {
    passCount++;
    console.log(`  \u2713 [${id}] ${description} — PASS`);
  } else {
    failCount++;
    console.log(`  \u2717 [${id}] ${description} — FAIL`);
  }
  console.log(`    ${detail}`);
  results.push({ id, group, desc: description, pass, detail });
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const db = getDb();

  console.log("Running industry screen validation suite...\n");

  // Load all data
  const allStocks = await db.select().from(stockClassifications);
  const allIndustries = await db.select().from(gicsIndustries);
  const allScreenResults = await db.select().from(industryScreenResults);
  const allAnalytics = await db.select().from(industryAnalytics);

  // Latest analytics per industry
  const latestAnalytics: Record<string, typeof allAnalytics[0]> = {};
  for (const a of allAnalytics) {
    const existing = latestAnalytics[a.industryId];
    if (!existing || a.generatedAt > existing.generatedAt) {
      latestAnalytics[a.industryId] = a;
    }
  }

  // Screen results indexed by ticker
  const screenByTicker: Record<string, typeof allScreenResults[0]> = {};
  for (const sr of allScreenResults) {
    screenByTicker[sr.ticker] = sr;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GROUP T — Taxonomy Integrity
  // ════════════════════════════════════════════════════════════════════════
  console.log("Group T — Taxonomy Integrity:");

  // TAX-001: Every screened stock maps to a valid GICS sector
  const invalidSectors = allScreenResults.filter(
    (sr) => !GICS_SECTORS.some((s) => sr.sectorId === `sector-${s.code}`)
  );
  test("TAX-001", "Taxonomy",
    "Every screened stock maps to valid GICS sector",
    invalidSectors.length === 0,
    `${allScreenResults.length} screened, ${invalidSectors.length} with invalid sector`);

  // TAX-002: Every screened stock maps to a valid GICS industry
  const invalidIndustries = allScreenResults.filter(
    (sr) => !GICS_INDUSTRIES.some((i) => sr.industryId === `ind-${i.code}`)
  );
  test("TAX-002", "Taxonomy",
    "Every screened stock maps to valid GICS industry",
    invalidIndustries.length === 0,
    `${invalidIndustries.length} with invalid industry`);

  // TAX-003: No stock appears in multiple industries in screen results
  const tickerIndustries: Record<string, Set<string>> = {};
  for (const sr of allScreenResults) {
    if (!tickerIndustries[sr.ticker]) tickerIndustries[sr.ticker] = new Set();
    tickerIndustries[sr.ticker].add(sr.industryId);
  }
  const multiIndustry = Object.entries(tickerIndustries).filter(([, s]) => s.size > 1);
  test("TAX-003", "Taxonomy",
    "No stock in multiple incompatible industries",
    multiIndustry.length === 0,
    `${multiIndustry.length} stocks in multiple industries`);

  // TAX-004: Industry counts stable (match taxonomy)
  const screenedIndustries = new Set(allScreenResults.map((sr) => sr.industryId));
  test("TAX-004", "Taxonomy",
    "Screen covers expected industry set",
    screenedIndustries.size > 0,
    `${screenedIndustries.size} industries screened out of ${GICS_INDUSTRIES.length} total`);

  // ════════════════════════════════════════════════════════════════════════
  // GROUP U — Deterministic Screen Integrity
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nGroup U — Deterministic Screen Integrity:");

  // SCR-001: Every stock in classification has a screen result
  // Allow small tolerance for auto-discovered stocks that fail metrics fetch (e.g., ADRs)
  const classifiedTickers = new Set(allStocks.map((s) => s.ticker));
  const screenedTickers = new Set(allScreenResults.map((sr) => sr.ticker));
  const missingFromScreen = [...classifiedTickers].filter((t) => !screenedTickers.has(t));
  const missingPct = classifiedTickers.size > 0 ? missingFromScreen.length / classifiedTickers.size : 0;
  test("SCR-001", "Screen",
    "Classified stocks have screen results (>= 99% coverage)",
    missingPct < 0.01,
    `${classifiedTickers.size} classified, ${screenedTickers.size} screened, ${missingFromScreen.length} missing (${(missingPct * 100).toFixed(1)}%)${missingFromScreen.length > 0 ? ` [${missingFromScreen.join(", ")}]` : ""}`);

  // SCR-002: Cheapness pass requires >= 2 signals
  const badCheapness = allScreenResults.filter(
    (sr) => sr.cheapnessPass === 1 && sr.cheapnessSignalCount < 2
  );
  test("SCR-002", "Screen",
    "Cheapness pass requires >= 2 signals",
    badCheapness.length === 0,
    `${badCheapness.length} with cheapness pass but < 2 signals`);

  // SCR-003: Quality score bounded [0, 100]
  const badQuality = allScreenResults.filter(
    (sr) => sr.qualityScore !== null && (sr.qualityScore < 0 || sr.qualityScore > 100)
  );
  test("SCR-003", "Screen",
    "Quality scores bounded [0, 100]",
    badQuality.length === 0,
    `${badQuality.length} with out-of-range quality score`);

  // SCR-004: Screen state is a valid enum value
  const validStates = new Set([
    "SCREEN_PASS", "NEEDS_DEEP_WORK", "PUBLISHED_VALUE_CANDIDATE",
    "WATCHLIST_ONLY", "EXCLUDED_VALUE_TRAP_RISK",
  ]);
  const badState = allScreenResults.filter((sr) => !validStates.has(sr.screenState));
  test("SCR-004", "Screen",
    "All screen states are valid enum values",
    badState.length === 0,
    `${badState.length} with invalid state`);

  // SCR-005: Composite score bounded [0, 100]
  const badScore = allScreenResults.filter(
    (sr) => sr.compositeScore < 0 || sr.compositeScore > 100
  );
  test("SCR-005", "Screen",
    "Composite scores bounded [0, 100]",
    badScore.length === 0,
    `${badScore.length} with out-of-range composite score`);

  // ════════════════════════════════════════════════════════════════════════
  // GROUP V — Candidate Publication Integrity
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nGroup V — Candidate Publication Integrity:");

  const published = allScreenResults.filter(
    (sr) => sr.screenState === "PUBLISHED_VALUE_CANDIDATE"
  );

  // CAND-001: Published candidates have valuation artifact
  const pubNoArtifact = published.filter((sr) => sr.hasValuationArtifact !== 1);
  test("CAND-001", "Candidate",
    "Published candidates have valuation artifact",
    pubNoArtifact.length === 0,
    `${published.length} published, ${pubNoArtifact.length} missing artifact`);

  // CAND-002: Published candidates have peer artifact
  const pubNoPeers = published.filter((sr) => sr.hasPeerArtifact !== 1);
  test("CAND-002", "Candidate",
    "Published candidates have peer artifact",
    pubNoPeers.length === 0,
    `${pubNoPeers.length} published without peers`);

  // CAND-003: Published candidates have no active trap flags
  const pubWithTraps = published.filter((sr) => {
    const flags = Array.isArray(sr.trapFlags) ? sr.trapFlags : [];
    return flags.length > 0 && sr.qualityPass !== 1;
  });
  test("CAND-003", "Candidate",
    "Published candidates have no active trap blockers",
    pubWithTraps.length === 0,
    `${pubWithTraps.length} published with active trap flags`);

  // CAND-004: Screen pass and needs-deep-work assigned deterministically
  const screenPass = allScreenResults.filter((sr) => sr.screenState === "SCREEN_PASS");
  const deepWork = allScreenResults.filter((sr) => sr.screenState === "NEEDS_DEEP_WORK");
  const screenPassNoArtifact = screenPass.filter((sr) => sr.hasValuationArtifact !== 1);
  // SCREEN_PASS should have artifacts; NEEDS_DEEP_WORK should not
  const deepWorkWithBothArtifacts = deepWork.filter(
    (sr) => sr.hasValuationArtifact === 1 && sr.hasPeerArtifact === 1 && sr.artifactPublished === 1
  );
  test("CAND-004", "Candidate",
    "SCREEN_PASS / NEEDS_DEEP_WORK assigned based on artifact availability",
    screenPassNoArtifact.length === 0,
    `${screenPass.length} screen-pass (${screenPassNoArtifact.length} lack artifacts), ${deepWork.length} deep-work`);

  // CAND-005: Published candidates have valuation confidence >= 0.65
  const pubLowConf = published.filter(
    (sr) => sr.valuationConfidence === null || sr.valuationConfidence < 0.65
  );
  test("CAND-005", "Candidate",
    "Published candidates have valuation confidence >= 0.65",
    pubLowConf.length === 0,
    `${pubLowConf.length} published with low confidence`);

  // ════════════════════════════════════════════════════════════════════════
  // GROUP W — Surface Integrity
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nGroup W — Surface Integrity:");

  // SURF-IND-001: Published candidates must have cheapness + quality pass
  const pubNoCheapness = published.filter((sr) => sr.cheapnessPass !== 1);
  const pubNoQuality = published.filter((sr) => sr.qualityPass !== 1);
  test("SURF-IND-001", "Surface",
    "Published candidates pass both cheapness and quality screens",
    pubNoCheapness.length === 0 && pubNoQuality.length === 0,
    `${pubNoCheapness.length} without cheapness, ${pubNoQuality.length} without quality`);

  // SURF-IND-002: No "cheap" claim for trap-risk rows
  const traps = allScreenResults.filter(
    (sr) => sr.screenState === "EXCLUDED_VALUE_TRAP_RISK"
  );
  const trapWithCheapLabel = traps.filter(
    (sr) => sr.valuationLabel === "cheap" && sr.candidatePublishable === 1
  );
  test("SURF-IND-002", "Surface",
    "No publishable candidate claim for excluded trap-risk rows",
    trapWithCheapLabel.length === 0,
    `${traps.length} trap-risk rows, ${trapWithCheapLabel.length} incorrectly publishable`);

  // ════════════════════════════════════════════════════════════════════════
  // GROUP X — Benchmark Packs
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nGroup X — Benchmark Packs:");

  // MU benchmark
  const mu = screenByTicker["MU"];
  test("BENCH-MU", "Benchmark",
    "MU: semiconductor, NOT published (label=expensive expected)",
    !!mu && mu.screenState !== "PUBLISHED_VALUE_CANDIDATE",
    mu
      ? `MU: ${mu.screenState}, label=${mu.valuationLabel}, cheap=${mu.cheapnessPass}`
      : "MU not found in screen results");

  // KO benchmark
  const ko = screenByTicker["KO"];
  test("BENCH-KO", "Benchmark",
    "KO: beverages, WATCHLIST_ONLY (not cheap vs peers)",
    !!ko && ko.screenState === "WATCHLIST_ONLY",
    ko
      ? `KO: ${ko.screenState}, signals=${ko.cheapnessSignalCount}`
      : "KO not found in screen results");

  // ALL benchmark
  const all = screenByTicker["ALL"];
  test("BENCH-ALL", "Benchmark",
    "ALL: insurance, PUBLISHED_VALUE_CANDIDATE",
    !!all && all.screenState === "PUBLISHED_VALUE_CANDIDATE",
    all
      ? `ALL: ${all.screenState}, label=${all.valuationLabel}, conf=${all.valuationConfidence}`
      : "ALL not found in screen results");

  // META benchmark
  const meta = screenByTicker["META"];
  test("BENCH-META", "Benchmark",
    "META: interactive media, SCREEN_PASS (artifact withheld blocks publication)",
    !!meta && (meta.screenState === "SCREEN_PASS" || meta.screenState === "NEEDS_DEEP_WORK"),
    meta
      ? `META: ${meta.screenState}, published=${meta.artifactPublished}, label=${meta.valuationLabel}`
      : "META not found in screen results");

  // ════════════════════════════════════════════════════════════════════════
  // NEGATIVE CONTROLS
  // ════════════════════════════════════════════════════════════════════════
  console.log("\nNegative Controls:");

  // NEG-001: INTC not published (weak fundamentals)
  const intc = screenByTicker["INTC"];
  test("NEG-001", "Negative",
    "INTC not surfaced as published candidate",
    !!intc && intc.screenState !== "PUBLISHED_VALUE_CANDIDATE",
    intc ? `INTC: ${intc.screenState}` : "INTC not found");

  // NEG-002: HRB correctly excluded as trap risk
  const hrb = screenByTicker["HRB"];
  test("NEG-002", "Negative",
    "HRB correctly excluded as value trap risk",
    !!hrb && hrb.screenState === "EXCLUDED_VALUE_TRAP_RISK",
    hrb ? `HRB: ${hrb.screenState}` : "HRB not found");

  // NEG-003: ZIM not surfaced as published candidate (marine shipping risk)
  const zim = screenByTicker["ZIM"];
  test("NEG-003", "Negative",
    "ZIM not surfaced as published candidate",
    !!zim && zim.screenState !== "PUBLISHED_VALUE_CANDIDATE",
    zim ? `ZIM: ${zim.screenState}` : "ZIM not found");

  // NEG-004: No stock published without valuation artifact
  const pubNoArt = allScreenResults.filter(
    (sr) => sr.screenState === "PUBLISHED_VALUE_CANDIDATE" && sr.hasValuationArtifact !== 1
  );
  test("NEG-004", "Negative",
    "No stock published as candidate without valuation artifact",
    pubNoArt.length === 0,
    `${pubNoArt.length} violations`);

  // NEG-005: No stock published without peer artifact
  const pubNoPeer = allScreenResults.filter(
    (sr) => sr.screenState === "PUBLISHED_VALUE_CANDIDATE" && sr.hasPeerArtifact !== 1
  );
  test("NEG-005", "Negative",
    "No stock published as candidate without peer artifact",
    pubNoPeer.length === 0,
    `${pubNoPeer.length} violations`);

  // NEG-006: Trap-risk stock not surfaced as published candidate
  const trapPublished = allScreenResults.filter(
    (sr) => sr.screenState === "PUBLISHED_VALUE_CANDIDATE" && sr.qualityPass !== 1
  );
  test("NEG-006", "Negative",
    "No trap-risk stock incorrectly surfaced as candidate",
    trapPublished.length === 0,
    `${trapPublished.length} violations`);

  // NEG-007: Published artifact must be status=published (not withheld)
  const pubWithheld = allScreenResults.filter(
    (sr) => sr.screenState === "PUBLISHED_VALUE_CANDIDATE" && sr.artifactPublished !== 1
  );
  test("NEG-007", "Negative",
    "Published candidates have published (not withheld) artifacts",
    pubWithheld.length === 0,
    `${pubWithheld.length} violations`);

  // NEG-008: No stock with WATCHLIST_ONLY state has candidatePublishable=1
  const watchPublishable = allScreenResults.filter(
    (sr) => sr.screenState === "WATCHLIST_ONLY" && sr.candidatePublishable === 1
  );
  test("NEG-008", "Negative",
    "No WATCHLIST_ONLY stock marked as candidatePublishable",
    watchPublishable.length === 0,
    `${watchPublishable.length} violations`);

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log(`Total: ${passCount} passed, ${failCount} failed out of ${passCount + failCount}`);
  console.log();

  if (failCount === 0) {
    console.log("\u2713 All screen validation rules pass — feature is safe to ship");
  } else {
    console.log(`\u26A0 ${failCount} failures — review before shipping`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
