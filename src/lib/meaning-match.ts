/**
 * Relevance matching between an investor's profile and screened companies —
 * pure SQL (weighted tag overlap), zero LLM at query time.
 */

import { sql, eq, and, gte, desc, type SQL } from "drizzle-orm";
import { getDb } from "../db/index";
import { bigFiveScreen, companyMeaning, investorProfiles } from "../db/schema";

/** Build a Postgres text[] literal with each element as its own parameter
 *  (the neon-http driver flattens JS arrays passed as a single param) */
export function textArray(values: string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}

/**
 * Weighted overlap between a company's tags and the user's interest tags:
 * domain matches count 3, theme 2, model/customer 1.
 */
export function relevanceExpr(interestTags: string[]) {
  return sql<number>`(
    select coalesce(sum(case
      when t like 'domain:%' then 3
      when t like 'theme:%'  then 2
      else 1 end), 0)::int
    from unnest(${companyMeaning.tags}) as t
    where t = any(${textArray(interestTags)})
  )`;
}

export interface CircleCompany {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  score: number;
  oneLiner: string | null;
  tags: string[];
  matchedTags: string[];
  relevance: number;
  marketCap: number | null;
}

/** The user's investor profile, or null when none/empty */
export async function getProfile(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Top Big Five qualifiers inside the user's circle of competence, ranked by
 * weighted tag overlap. Empty when the profile has no derived tags.
 */
export async function topCircleCompanies(
  userId: string,
  limit = 8
): Promise<CircleCompany[]> {
  const profile = await getProfile(userId);
  const interestTags = profile?.interestTags ?? [];
  if (interestTags.length === 0) return [];

  const db = getDb();
  const relevance = relevanceExpr(interestTags);
  const rows = await db
    .select({
      ticker: bigFiveScreen.ticker,
      companyName: bigFiveScreen.companyName,
      sector: bigFiveScreen.sector,
      score: bigFiveScreen.score,
      marketCap: bigFiveScreen.marketCap,
      oneLiner: companyMeaning.oneLiner,
      tags: companyMeaning.tags,
      relevance,
    })
    .from(bigFiveScreen)
    .innerJoin(companyMeaning, eq(companyMeaning.ticker, bigFiveScreen.ticker))
    .where(and(eq(bigFiveScreen.available, true), gte(bigFiveScreen.score, 3)))
    .orderBy(desc(relevance), desc(bigFiveScreen.score), desc(bigFiveScreen.marketCap))
    .limit(limit * 2);

  const interestSet = new Set(interestTags);
  return rows
    .filter((r) => r.relevance > 0)
    .slice(0, limit)
    .map((r) => ({
      ticker: r.ticker,
      companyName: r.companyName,
      sector: r.sector,
      score: r.score,
      oneLiner: r.oneLiner,
      tags: r.tags ?? [],
      matchedTags: (r.tags ?? []).filter((t) => interestSet.has(t)),
      relevance: r.relevance,
      marketCap: r.marketCap,
    }));
}
