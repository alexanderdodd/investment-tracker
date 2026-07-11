import { sql } from "drizzle-orm";
import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  jsonb,
  real,
  boolean,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { GrowthHistoryPayload } from "@/lib/sec-edgar/growth-history";
import type { ManagementPayload } from "@/lib/sec-edgar/management";
import type { ManagementBrief } from "@/lib/generate-management-brief";
import type { RuleOneScreenResult } from "@/lib/rule-one-screen";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ─── GICS Taxonomy ─────────────────────────────────────────────────────────

export const gicsSectors = pgTable("gics_sector", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  etfTicker: text("etf_ticker"),
  description: text("description"),
});

export const gicsIndustryGroups = pgTable("gics_industry_group", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
});

export const gicsIndustries = pgTable("gics_industry", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
  industryGroupId: text("industry_group_id")
    .notNull()
    .references(() => gicsIndustryGroups.id),
  description: text("description"),
  valueFrameworkId: text("value_framework_id"),
  cyclicalityClass: text("cyclicality_class")
    .$type<"defensive" | "mixed" | "cyclical" | "hyper_cyclical">()
    .notNull()
    .default("mixed"),
});

export const gicsSubIndustries = pgTable("gics_sub_industry", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  industryId: text("industry_id")
    .notNull()
    .references(() => gicsIndustries.id),
});

export const stockClassifications = pgTable("stock_classification", {
  ticker: text("ticker").primaryKey(),
  companyName: text("company_name").notNull(),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
  industryGroupId: text("industry_group_id")
    .notNull()
    .references(() => gicsIndustryGroups.id),
  industryId: text("industry_id")
    .notNull()
    .references(() => gicsIndustries.id),
  subIndustryId: text("sub_industry_id")
    .references(() => gicsSubIndustries.id),
  source: text("source")
    .$type<"gics_feed" | "curated_override" | "etf_discovery" | "yahoo_screener">()
    .notNull()
    .default("curated_override"),
  asOf: timestamp("as_of", { mode: "date" }).notNull().defaultNow(),
});

// ─── Industry Analytics ────────────────────────────────────────────────────

export const industryAnalytics = pgTable("industry_analytics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  industryId: text("industry_id")
    .notNull()
    .references(() => gicsIndustries.id),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
  universeSize: integer("universe_size").notNull().default(0),
  medianForwardPe: real("median_forward_pe"),
  medianEvEbitda: real("median_ev_ebitda"),
  medianPriceToBook: real("median_price_to_book"),
  medianOperatingMargin: real("median_operating_margin"),
  medianRoic: real("median_roic"),
  medianRoe: real("median_roe"),
  medianFcfYield: real("median_fcf_yield"),
  valuationState: text("valuation_state")
    .$type<"cheap" | "fair" | "expensive" | "withheld">()
    .notNull()
    .default("withheld"),
  industryState: text("industry_state")
    .$type<"ATTRACTIVE_HUNTING_GROUND" | "MIXED" | "OVERHEATED" | "LOW_VISIBILITY" | "WITHHELD">()
    .notNull()
    .default("WITHHELD"),
  candidateCountValidated: integer("candidate_count_validated").notNull().default(0),
  candidateCountPossible: integer("candidate_count_possible").notNull().default(0),
  candidateCountTrapRisk: integer("candidate_count_trap_risk").notNull().default(0),
  confidence: real("confidence").notNull().default(0),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Value Candidates ──────────────────────────────────────────────────────

export const valueCandidates = pgTable("value_candidate", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
  industryId: text("industry_id")
    .notNull()
    .references(() => gicsIndustries.id),
  candidateClass: text("candidate_class")
    .$type<"validated_value" | "possible_value" | "value_trap_risk" | "not_attractive">()
    .notNull(),
  valuationLabel: text("valuation_label")
    .$type<"cheap" | "fair" | "expensive" | "withheld">()
    .notNull(),
  valuationConfidence: real("valuation_confidence"),
  peerQuality: text("peer_quality")
    .$type<"strong" | "medium" | "weak" | "unknown">()
    .notNull()
    .default("unknown"),
  trapRisk: text("trap_risk")
    .$type<"LOW" | "MEDIUM" | "HIGH">()
    .notNull()
    .default("MEDIUM"),
  score: real("score").notNull().default(0),
  reasonsFor: jsonb("reasons_for").$type<string[]>().notNull().default([]),
  reasonsAgainst: jsonb("reasons_against").$type<string[]>().notNull().default([]),
  hasValuationArtifact: integer("has_valuation_artifact").notNull().default(0),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Industry Screen Results ──────────────────────────────────────────────

export const industryScreenResults = pgTable("industry_screen_result", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  industryId: text("industry_id")
    .notNull()
    .references(() => gicsIndustries.id),
  sectorId: text("sector_id")
    .notNull()
    .references(() => gicsSectors.id),
  snapshotAt: timestamp("snapshot_at", { mode: "date" }).notNull().defaultNow(),
  screenState: text("screen_state")
    .$type<
      | "SCREEN_PASS"
      | "NEEDS_DEEP_WORK"
      | "PUBLISHED_VALUE_CANDIDATE"
      | "WATCHLIST_ONLY"
      | "EXCLUDED_VALUE_TRAP_RISK"
    >()
    .notNull(),
  // Stage C — cheapness signals (industry-relative)
  cheapnessSignalCount: integer("cheapness_signal_count").notNull().default(0),
  cheapnessSignals: jsonb("cheapness_signals")
    .$type<{
      fwdPeVsMedian: number | null;   // ratio vs industry median (e.g., 0.82 = 82% of median)
      evEbitdaVsMedian: number | null;
      evEbitdaVs5yPctl: number | null; // percentile within own 5Y history
      pbVsMedian: number | null;
      fcfYieldVsMedian: number | null; // spread vs median in pp
    }>()
    .notNull()
    .default({ fwdPeVsMedian: null, evEbitdaVsMedian: null, evEbitdaVs5yPctl: null, pbVsMedian: null, fcfYieldVsMedian: null }),
  cheapnessPass: integer("cheapness_pass").notNull().default(0),
  // Stage D — quality signals
  qualityScore: real("quality_score"), // 0-100 weighted composite
  qualitySignals: jsonb("quality_signals")
    .$type<{
      leverageOk: boolean;
      marginStabilityOk: boolean;
      dilutionOk: boolean;
      cashConversionOk: boolean;
      returnsOk: boolean;
      liquidityOk: boolean;
    }>()
    .notNull()
    .default({ leverageOk: true, marginStabilityOk: true, dilutionOk: true, cashConversionOk: true, returnsOk: true, liquidityOk: true }),
  qualityPass: integer("quality_pass").notNull().default(0),
  // Trap flags
  trapFlags: jsonb("trap_flags").$type<string[]>().notNull().default([]),
  // Artifact linkage
  hasValuationArtifact: integer("has_valuation_artifact").notNull().default(0),
  hasPeerArtifact: integer("has_peer_artifact").notNull().default(0),
  artifactPublished: integer("artifact_published").notNull().default(0),
  // Candidate gate fields
  valuationLabel: text("valuation_label")
    .$type<"cheap" | "fair" | "expensive" | "withheld">(),
  valuationConfidence: real("valuation_confidence"),
  candidatePublishable: integer("candidate_publishable").notNull().default(0),
  // Composite score for ranking
  compositeScore: real("composite_score").notNull().default(0),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Simulation Portfolios ────────────────────────────────────────────────

export const simPortfolios = pgTable("sim_portfolio", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  startingCash: real("starting_cash").notNull(),
  feeModel: text("fee_model")
    .$type<"ibkr_pro" | "saxo_classic" | "commission_free">()
    .notNull()
    .default("ibkr_pro"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const simTrades = pgTable("sim_trade", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  portfolioId: text("portfolio_id")
    .notNull()
    .references(() => simPortfolios.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  tradeType: text("trade_type")
    .$type<"buy" | "sell">()
    .notNull()
    .default("buy"),
  shares: real("shares").notNull(),
  pricePerShare: real("price_per_share").notNull(),
  fees: real("fees").notNull().default(0),
  totalCost: real("total_cost").notNull(),
  // Benchmark prices at time of trade (for comparison)
  spyPriceAtTrade: real("spy_price_at_trade"),
  sectorEtfTicker: text("sector_etf_ticker"),
  sectorEtfPriceAtTrade: real("sector_etf_price_at_trade"),
  notes: text("notes"),
  executedAt: timestamp("executed_at", { mode: "date" }).notNull().defaultNow(),
});

export const simDividends = pgTable("sim_dividend", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  portfolioId: text("portfolio_id")
    .notNull()
    .references(() => simPortfolios.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  exDate: text("ex_date").notNull(),
  amountPerShare: real("amount_per_share").notNull(),
  sharesHeld: real("shares_held").notNull(),
  totalAmount: real("total_amount").notNull(),
  recordedAt: timestamp("recorded_at", { mode: "date" }).notNull().defaultNow(),
});

// ─── Existing tables ───────────────────────────────────────────────────────

export const sectorEmergingLeaders = pgTable("sector_emerging_leader", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  rationale: text("rationale").notNull(),
  metricLabel: text("metric_label").notNull(),
  metricValue: text("metric_value").notNull(),
  rank: integer("rank").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const watchlistItems = pgTable("watchlist_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name"),
  sector: text("sector"),
  /** Triage status: watching | to-research | to-buy | own | pass */
  status: text("status").notNull().default("watching"),
  addedAt: timestamp("added_at", { mode: "date" }).notNull().defaultNow(),
});

export const sectorValueStocks = pgTable("sector_value_stock", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  rationale: text("rationale").notNull(),
  metricLabel: text("metric_label").notNull(),
  metricValue: text("metric_value").notNull(),
  rank: integer("rank").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const sectorReports = pgTable("sector_report", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  summary: text("summary").notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const sectorAnalyses = pgTable("sector_analysis", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sector: text("sector").notNull(),
  researchDocument: text("research_document").notNull(),
  userSummary: text("user_summary").notNull(),
  structuredInsights: jsonb("structured_insights"),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const stockValuations = pgTable("stock_valuation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  cik: text("cik"),
  status: text("status").notNull().default("published"),
  frameworkType: text("framework_type"),
  canonicalFacts: jsonb("canonical_facts"),
  financialModel: jsonb("financial_model"),
  valuationOutputs: jsonb("valuation_outputs"),
  qualityReport: jsonb("quality_report"),
  researchDocument: text("research_document").notNull(),
  structuredInsights: jsonb("structured_insights"),
  sourceAccessions: text("source_accessions"),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// Cached Big Five growth history (SEC EDGAR XBRL, deterministic).
// One row per ticker — computed payload is small (~5-15 KB); the raw
// EDGAR companyfacts source it derives from is 5-20 MB, hence the cache.
export const stockGrowthHistories = pgTable("stock_growth_history", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik"),
  payload: jsonb("payload").$type<GrowthHistoryPayload>().notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// Cached insider/management data (SEC Form 4 parse — expensive: ~120 archive
// fetches per build) plus the LLM-generated management brief.
// All-stocks Big Five sweep (deterministic, no LLM): one row per SEC filer
// with real columns so the /screener UI can sort and filter in SQL.
export const bigFiveScreen = pgTable("big_five_screen", {
  ticker: text("ticker").primaryKey(),
  companyName: text("company_name"),
  sector: text("sector"),
  currency: text("currency"),
  available: boolean("available").notNull().default(false),
  /** Metrics passing ≥10%/yr on ALL of 10y, 5y AND 1y (across the board) */
  score: integer("score").notNull().default(0),
  roic10y: real("roic_10y"),
  roic5y: real("roic_5y"),
  roic1y: real("roic_1y"),
  sales10y: real("sales_10y"),
  sales5y: real("sales_5y"),
  sales1y: real("sales_1y"),
  eps10y: real("eps_10y"),
  eps5y: real("eps_5y"),
  eps1y: real("eps_1y"),
  equity10y: real("equity_10y"),
  equity5y: real("equity_5y"),
  equity1y: real("equity_1y"),
  fcf10y: real("fcf_10y"),
  fcf5y: real("fcf_5y"),
  fcf1y: real("fcf_1y"),
  /** Shortest actual span among the available growth figures (honesty label) */
  minSpanYears: integer("min_span_years"),
  marketCap: doublePrecision("market_cap"),
  price: real("price"),
  sticker: real("sticker"),
  mos: real("mos"),
  verdict: text("verdict"),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

// LLM-extracted "Meaning" layer for Big Five qualifiers: one cheap call per
// company at screening time, then pure SQL at query time. Side table so the
// ~2KB descriptions stay out of hot screener queries.
export const companyMeaning = pgTable(
  "company_meaning",
  {
    ticker: text("ticker")
      .primaryKey()
      .references(() => bigFiveScreen.ticker, { onDelete: "cascade" }),
    /** Namespaced controlled-vocabulary tags ("domain:coffee") */
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    /** Free-form escape valve — stored, not matched */
    extraTags: text("extra_tags").array().notNull().default(sql`ARRAY[]::text[]`),
    oneLiner: text("one_liner"),
    description: text("description"),
    /** Set on every attempt (retry throttle); enrichedAt only on success */
    attemptedAt: timestamp("attempted_at", { mode: "date" }),
    enrichedAt: timestamp("enriched_at", { mode: "date" }),
  },
  (t) => [index("company_meaning_tags_gin").using("gin", t.tags)]
);

// One row per user: Rule #1 "Meaning" — talents, passions, spending
export const investorProfiles = pgTable("investor_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  talents: text("talents"),
  passions: text("passions"),
  spending: text("spending"),
  interestTags: text("interest_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  keywords: text("keywords").array().notNull().default(sql`ARRAY[]::text[]`),
  tagsGeneratedAt: timestamp("tags_generated_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// Latest Rule #1 screen result per industry (Big Five → sticker → moat/mgmt)
export const ruleOneScreens = pgTable("rule_one_screen", {
  industrySlug: text("industry_slug").primaryKey(),
  payload: jsonb("payload").$type<RuleOneScreenResult>().notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
});

export const stockManagements = pgTable("stock_management", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik"),
  payload: jsonb("payload").$type<ManagementPayload>().notNull(),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
  brief: jsonb("brief").$type<ManagementBrief>(),
  briefGeneratedAt: timestamp("brief_generated_at", { mode: "date" }),
});
