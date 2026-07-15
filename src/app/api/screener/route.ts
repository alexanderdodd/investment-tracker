import { NextResponse } from "next/server";
import { and, or, desc, asc, eq, gte, lte, sql, ilike, inArray, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { bigFiveScreen, companyMeaning } from "@/db/schema";
import { getProfile, relevanceExpr, textArray } from "@/lib/meaning-match";

const SORTS = {
  score: bigFiveScreen.score,
  roic: bigFiveScreen.roic10y,
  sales: bigFiveScreen.sales10y,
  eps: bigFiveScreen.eps10y,
  equity: bigFiveScreen.equity10y,
  fcf: bigFiveScreen.fcf10y,
  marketCap: bigFiveScreen.marketCap,
  discount: sql`(${bigFiveScreen.sticker} - ${bigFiveScreen.price}) / nullif(${bigFiveScreen.sticker}, 0)`,
} as const;

// Everything except company_meaning.description (large; never shipped)
const ROW_COLUMNS = {
  ticker: bigFiveScreen.ticker,
  companyName: bigFiveScreen.companyName,
  sector: bigFiveScreen.sector,
  currency: bigFiveScreen.currency,
  score: bigFiveScreen.score,
  roic10y: bigFiveScreen.roic10y,
  roic5y: bigFiveScreen.roic5y,
  roic1y: bigFiveScreen.roic1y,
  sales10y: bigFiveScreen.sales10y,
  sales5y: bigFiveScreen.sales5y,
  sales1y: bigFiveScreen.sales1y,
  eps10y: bigFiveScreen.eps10y,
  eps5y: bigFiveScreen.eps5y,
  eps1y: bigFiveScreen.eps1y,
  equity10y: bigFiveScreen.equity10y,
  equity5y: bigFiveScreen.equity5y,
  equity1y: bigFiveScreen.equity1y,
  fcf10y: bigFiveScreen.fcf10y,
  fcf5y: bigFiveScreen.fcf5y,
  fcf1y: bigFiveScreen.fcf1y,
  minSpanYears: bigFiveScreen.minSpanYears,
  marketCap: bigFiveScreen.marketCap,
  price: bigFiveScreen.price,
  sticker: bigFiveScreen.sticker,
  mos: bigFiveScreen.mos,
  verdict: bigFiveScreen.verdict,
  oneLiner: companyMeaning.oneLiner,
  tags: companyMeaning.tags,
};

// GET: query the Big Five sweep results
// ?minScore=3&sector=…&minMcap=…&maxMcap=…&tags=domain:coffee,domain:pets
// &keywords=espresso,barista&sort=score|relevance|…&dir=&limit=&offset=
export async function GET(request: Request) {
  const url = new URL(request.url);
  const minScore = parseInt(url.searchParams.get("minScore") ?? "3", 10);
  const sector = url.searchParams.get("sector");
  const region = url.searchParams.get("region"); // us | uk | eu (by trading currency)
  const minMcap = parseFloat(url.searchParams.get("minMcap") ?? "0");
  const maxMcap = parseFloat(url.searchParams.get("maxMcap") ?? "0");
  const tags = (url.searchParams.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const keywords = (url.searchParams.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .slice(0, 10);
  const sortKey = (url.searchParams.get("sort") ?? "score") as keyof typeof SORTS | "relevance";
  const dir = url.searchParams.get("dir") === "asc" ? asc : desc;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const db = getDb();

  // Region by trading currency: US filers quote USD; UK in GBP; continental
  // Europe (incl. Switzerland + Nordics) in these.
  const EU_CURRENCIES = ["EUR", "CHF", "SEK", "DKK", "NOK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN"];

  const conditions = [eq(bigFiveScreen.available, true), gte(bigFiveScreen.score, minScore)];
  if (sector) conditions.push(eq(bigFiveScreen.sector, sector));
  if (region === "us") {
    conditions.push(or(isNull(bigFiveScreen.currency), eq(bigFiveScreen.currency, "USD"))!);
  } else if (region === "uk") {
    conditions.push(eq(bigFiveScreen.currency, "GBP"));
  } else if (region === "eu") {
    conditions.push(inArray(bigFiveScreen.currency, EU_CURRENCIES));
  }
  if (minMcap > 0) conditions.push(gte(bigFiveScreen.marketCap, minMcap));
  if (maxMcap > 0) conditions.push(lte(bigFiveScreen.marketCap, maxMcap));
  if (tags.length > 0) {
    // GIN-accelerated array overlap: any of the requested tags
    conditions.push(sql`${companyMeaning.tags} && ${textArray(tags)}`);
  }
  for (const kw of keywords) {
    const pattern = `%${kw}%`;
    conditions.push(
      or(
        ilike(bigFiveScreen.companyName, pattern),
        ilike(companyMeaning.description, pattern),
        ilike(companyMeaning.oneLiner, pattern)
      )!
    );
  }

  // Relevance sort needs the signed-in user's interest tags
  let interestTags: string[] = [];
  let relevanceAvailable = false;
  if (sortKey === "relevance") {
    const session = await auth();
    if (session?.user?.id) {
      const profile = await getProfile(session.user.id);
      interestTags = profile?.interestTags ?? [];
      relevanceAvailable = interestTags.length > 0;
    }
  }

  // Collapse multi-exchange listings of the same company (e.g. a Polish name
  // cross-listed on Xetra/Frankfurt/Vienna, or a US name and its EU shadow) to
  // one row. Keep the best-ranked listing per company: highest score, then
  // market cap, then ticker (favours the primary/US line). Grouping is by the
  // company name, falling back to ticker when the name is missing.
  const dedupeKey = sql`lower(trim(coalesce(${bigFiveScreen.companyName}, ${bigFiveScreen.ticker})))`;
  const rnExpr = sql<number>`row_number() over (partition by ${dedupeKey} order by ${bigFiveScreen.score} desc, ${bigFiveScreen.marketCap} desc nulls last, ${bigFiveScreen.ticker} asc)`;
  const relevanceCol =
    sortKey === "relevance" && relevanceAvailable ? relevanceExpr(interestTags) : sql<number>`0`;

  const sq = db
    .select({ ...ROW_COLUMNS, relevance: relevanceCol.as("relevance"), rn: rnExpr.as("rn") })
    .from(bigFiveScreen)
    .leftJoin(companyMeaning, eq(companyMeaning.ticker, bigFiveScreen.ticker))
    .where(and(...conditions))
    .as("sq");

  const SORTS_SQ = {
    score: sq.score,
    roic: sq.roic10y,
    sales: sq.sales10y,
    eps: sq.eps10y,
    equity: sq.equity10y,
    fcf: sq.fcf10y,
    marketCap: sq.marketCap,
    discount: sql`(${sq.sticker} - ${sq.price}) / nullif(${sq.sticker}, 0)`,
  } as const;
  const orderBy =
    sortKey === "relevance" && relevanceAvailable
      ? [desc(sq.relevance), desc(sq.score), desc(sq.marketCap)]
      : [dir(SORTS_SQ[(sortKey === "relevance" ? "score" : sortKey) as keyof typeof SORTS_SQ] ?? SORTS_SQ.score), desc(sq.marketCap)];

  const [rows, stats, sectors] = await Promise.all([
    db.select().from(sq).where(eq(sq.rn, 1)).orderBy(...orderBy).limit(limit).offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
        available: sql<number>`count(*) filter (where ${bigFiveScreen.available})`,
        pass3: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} >= 3)`,
        pass4: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} >= 4)`,
        pass5: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} = 5)`,
        latest: sql<string>`max(${bigFiveScreen.generatedAt})`,
      })
      .from(bigFiveScreen),
    db
      .selectDistinct({ sector: bigFiveScreen.sector })
      .from(bigFiveScreen)
      .where(and(eq(bigFiveScreen.available, true), gte(bigFiveScreen.score, 3))),
  ]);

  // Distinct companies matching the filters (deduped, so it matches the rows)
  const [matching] = await db
    .select({ n: sql<number>`count(distinct ${dedupeKey})` })
    .from(bigFiveScreen)
    .leftJoin(companyMeaning, eq(companyMeaning.ticker, bigFiveScreen.ticker))
    .where(and(...conditions));

  const interestSet = new Set(interestTags);
  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      matchedTags: relevanceAvailable ? (r.tags ?? []).filter((t) => interestSet.has(t)) : [],
    })),
    stats: { ...stats[0], matching: matching.n },
    sectors: sectors.map((s) => s.sector).filter(Boolean).sort(),
    relevanceAvailable: sortKey === "relevance" ? relevanceAvailable : undefined,
  });
}
