import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockManagements } from "@/db/schema";
import { buildManagementData, type ManagementPayload } from "@/lib/sec-edgar/management";
import {
  generateManagementBrief,
  buildBriefContext,
  type ManagementBrief,
} from "@/lib/generate-management-brief";
import { getYahooCrumb } from "@/lib/stock-metrics";

// Cold path fetches ~120 Form 4 XMLs from EDGAR (throttled) or runs the LLM
export const maxDuration = 300;

const SEC_TTL_MS = 24 * 60 * 60 * 1000; // insider filings arrive continuously

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface YahooOfficer {
  name: string;
  title: string;
  age: number | null;
  totalPay: number | null;
}

export interface YahooManagement {
  officers: YahooOfficer[];
  insidersPercentHeld: number | null;
  /** Company reporting currency (officer pay is reported in it) */
  financialCurrency: string | null;
  netActivity: {
    period: string | null;
    buyShares: number | null;
    buyCount: number | null;
    sellShares: number | null;
    sellCount: number | null;
    netShares: number | null;
  } | null;
}

async function fetchYahooManagement(ticker: string): Promise<YahooManagement> {
  const empty: YahooManagement = { officers: [], insidersPercentHeld: null, financialCurrency: null, netActivity: null };
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,netSharePurchaseActivity,majorHoldersBreakdown,financialData&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } });
    if (!res.ok) return empty;
    const json = await res.json();
    const r = json.quoteSummary?.result?.[0];
    if (!r) return empty;

    const officers: YahooOfficer[] = (r.assetProfile?.companyOfficers ?? [])
      .map((o: { name?: string; title?: string; age?: number; totalPay?: { raw?: number } }) => ({
        name: o.name ?? "",
        title: o.title ?? "",
        age: o.age ?? null,
        totalPay: o.totalPay?.raw ?? null,
      }))
      .filter((o: YahooOfficer) => o.name);

    const net = r.netSharePurchaseActivity;
    return {
      officers,
      insidersPercentHeld: r.majorHoldersBreakdown?.insidersPercentHeld?.raw ?? null,
      financialCurrency: r.financialData?.financialCurrency ?? null,
      netActivity: net
        ? {
            period: net.period ?? null,
            buyShares: net.buyInfoShares?.raw ?? null,
            buyCount: net.buyInfoCount?.raw ?? null,
            sellShares: net.sellInfoShares?.raw ?? null,
            sellCount: net.sellInfoCount?.raw ?? null,
            netShares: net.netInfoShares?.raw ?? null,
          }
        : null,
    };
  } catch {
    return empty;
  }
}

async function getSecPayload(
  ticker: string,
  force: boolean
): Promise<{ payload: ManagementPayload; generatedAt: Date }> {
  const db = getDb();
  const [cached] = await db
    .select()
    .from(stockManagements)
    .where(eq(stockManagements.ticker, ticker))
    .limit(1);

  if (cached && !force && Date.now() - cached.generatedAt.getTime() < SEC_TTL_MS) {
    return { payload: cached.payload, generatedAt: cached.generatedAt };
  }

  let payload: ManagementPayload;
  try {
    payload = await buildManagementData(ticker);
  } catch (err) {
    if (cached) return { payload: cached.payload, generatedAt: cached.generatedAt };
    throw err;
  }

  const generatedAt = new Date();
  await db
    .insert(stockManagements)
    .values({ ticker, cik: payload.cik, payload, generatedAt })
    .onConflictDoUpdate({
      target: stockManagements.ticker,
      // Preserve any existing brief — it's generated independently
      set: { cik: payload.cik, payload, generatedAt },
    });

  return { payload, generatedAt };
}

// GET: officer roster + insider activity (Yahoo, fresh) merged with parsed
// Form 4 data (SEC, 24h DB cache) and the stored LLM brief if one exists.
// ?force=true rebuilds the SEC payload.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const [yahoo, sec] = await Promise.all([
    fetchYahooManagement(upperTicker),
    getSecPayload(upperTicker, force).catch(() => null),
  ]);

  const db = getDb();
  const [row] = await db
    .select({ brief: stockManagements.brief, briefGeneratedAt: stockManagements.briefGeneratedAt })
    .from(stockManagements)
    .where(eq(stockManagements.ticker, upperTicker))
    .limit(1);

  return NextResponse.json({
    ticker: upperTicker,
    yahoo,
    sec: sec?.payload ?? null,
    secGeneratedAt: sec?.generatedAt.toISOString() ?? null,
    brief: row?.brief ?? null,
    briefGeneratedAt: row?.briefGeneratedAt?.toISOString() ?? null,
  });
}

// POST: generate (or regenerate) the LLM management brief and store it
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const [yahoo, sec] = await Promise.all([
    fetchYahooManagement(upperTicker),
    getSecPayload(upperTicker, false).catch(() => null),
  ]);

  let brief: ManagementBrief;
  try {
    brief = await generateManagementBrief(
      buildBriefContext(
        upperTicker,
        sec?.payload.companyName ?? null,
        yahoo.officers.slice(0, 6),
        sec?.payload ?? null
      )
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Brief generation failed" },
      { status: 502 }
    );
  }

  const briefGeneratedAt = new Date();
  const db = getDb();
  // The SEC payload row may not exist yet (non-filer) — upsert a stub
  await db
    .insert(stockManagements)
    .values({
      ticker: upperTicker,
      cik: sec?.payload.cik ?? null,
      payload:
        sec?.payload ??
        ({
          ticker: upperTicker,
          companyName: null,
          cik: null,
          available: false,
          unavailableReason: "Not built yet",
          transactions: [],
          ceoOwnership: [],
          execChanges: [],
          ceoComp: [],
          proxyUrl: null,
          form4Available: 0,
          form4Parsed: 0,
        } satisfies ManagementPayload),
      brief,
      briefGeneratedAt,
    })
    .onConflictDoUpdate({
      target: stockManagements.ticker,
      set: { brief, briefGeneratedAt },
    });

  return NextResponse.json({ brief, briefGeneratedAt: briefGeneratedAt.toISOString() });
}
