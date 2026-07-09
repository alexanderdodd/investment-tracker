import { NextResponse } from "next/server";
import { and, desc, asc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/index";
import { bigFiveScreen } from "@/db/schema";

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

// GET: query the Big Five sweep results
// ?minScore=3&sector=Technology&minMcap=1000000000&sort=score&dir=desc&limit=100&offset=0
export async function GET(request: Request) {
  const url = new URL(request.url);
  const minScore = parseInt(url.searchParams.get("minScore") ?? "3", 10);
  const sector = url.searchParams.get("sector");
  const minMcap = parseFloat(url.searchParams.get("minMcap") ?? "0");
  const sortKey = (url.searchParams.get("sort") ?? "score") as keyof typeof SORTS;
  const dir = url.searchParams.get("dir") === "asc" ? asc : desc;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const db = getDb();

  const conditions = [eq(bigFiveScreen.available, true), gte(bigFiveScreen.score, minScore)];
  if (sector) conditions.push(eq(bigFiveScreen.sector, sector));
  if (minMcap > 0) conditions.push(gte(bigFiveScreen.marketCap, minMcap));

  const sortCol = SORTS[sortKey] ?? SORTS.score;

  const [rows, stats, sectors] = await Promise.all([
    db
      .select()
      .from(bigFiveScreen)
      .where(and(...conditions))
      .orderBy(dir(sortCol), desc(bigFiveScreen.marketCap))
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
        available: sql<number>`count(*) filter (where ${bigFiveScreen.available})`,
        pass3: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} >= 3)`,
        pass4: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} >= 4)`,
        pass5: sql<number>`count(*) filter (where ${bigFiveScreen.available} and ${bigFiveScreen.score} = 5)`,
        matching: sql<number>`count(*) filter (where ${and(...conditions)})`,
        latest: sql<string>`max(${bigFiveScreen.generatedAt})`,
      })
      .from(bigFiveScreen),
    db
      .selectDistinct({ sector: bigFiveScreen.sector })
      .from(bigFiveScreen)
      .where(and(eq(bigFiveScreen.available, true), gte(bigFiveScreen.score, 3))),
  ]);

  return NextResponse.json({
    rows,
    stats: stats[0],
    sectors: sectors.map((s) => s.sector).filter(Boolean).sort(),
  });
}
