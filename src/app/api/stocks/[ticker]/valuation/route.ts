import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { stockValuations } from "@/db/schema";
import {
  getExistingValuation,
  generateStockValuation,
  type ProgressEvent,
} from "@/lib/generate-stock-valuation";

export const maxDuration = 300;

// GET: retrieve the latest valuation for a ticker
// ?history=true returns all valuations (summary only)
// ?id=<uuid> returns a specific valuation by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const url = new URL(request.url);
  const wantHistory = url.searchParams.get("history") === "true";
  const specificId = url.searchParams.get("id");

  const db = getDb();

  // Return a specific valuation by ID
  if (specificId) {
    const [row] = await db
      .select()
      .from(stockValuations)
      .where(eq(stockValuations.id, specificId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ valuation: null });
    }

    return NextResponse.json({
      valuation: {
        id: row.id,
        ticker: row.ticker,
        companyName: row.companyName,
        status: row.status,
        researchDocument: row.researchDocument,
        structuredInsights: row.structuredInsights ?? null,
        generatedAt: row.generatedAt.toISOString(),
      },
    });
  }

  // Return valuation history (summary list)
  if (wantHistory) {
    const rows = await db
      .select({
        id: stockValuations.id,
        ticker: stockValuations.ticker,
        companyName: stockValuations.companyName,
        status: stockValuations.status,
        generatedAt: stockValuations.generatedAt,
        structuredInsights: stockValuations.structuredInsights,
      })
      .from(stockValuations)
      .where(eq(stockValuations.ticker, upperTicker))
      .orderBy(desc(stockValuations.generatedAt))
      .limit(20);

    return NextResponse.json({
      history: rows.map(r => ({
        id: r.id,
        ticker: r.ticker,
        companyName: r.companyName,
        status: r.status,
        generatedAt: r.generatedAt.toISOString(),
        verdict: (r.structuredInsights as Record<string, unknown> | null)?.verdict ?? null,
        confidence: (r.structuredInsights as Record<string, unknown> | null)?.confidence ?? null,
        intrinsicValue: (r.structuredInsights as Record<string, unknown> | null)?.intrinsicValue ?? null,
      })),
    });
  }

  // Default: return latest valuation
  const [latest] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.ticker, upperTicker))
    .orderBy(desc(stockValuations.generatedAt))
    .limit(1);

  if (!latest) {
    return NextResponse.json({ valuation: null });
  }

  return NextResponse.json({
    valuation: {
      id: latest.id,
      ticker: latest.ticker,
      companyName: latest.companyName,
      status: latest.status,
      researchDocument: latest.researchDocument,
      structuredInsights: latest.structuredInsights ?? null,
      generatedAt: latest.generatedAt.toISOString(),
    },
  });
}

// POST: trigger a new valuation with Server-Sent Events for progress
// ?force=true skips the cache check and always regenerates
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  // Check for a recent valuation from this quarter (skip if force=true)
  if (!force) {
    const existing = await getExistingValuation(upperTicker);
    if (existing) {
      return NextResponse.json({
        status: "existing",
        valuation: {
          id: existing.id,
          ticker: existing.ticker,
          companyName: existing.companyName,
          researchDocument: existing.researchDocument,
          structuredInsights: existing.structuredInsights ?? null,
          generatedAt: existing.generatedAt.toISOString(),
        },
      });
    }
  }

  // Stream progress via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      const onProgress = (event: ProgressEvent) => {
        sendEvent({ type: "progress", ...event });
      };

      try {
        const result = await generateStockValuation(upperTicker, onProgress);

        if (!result.success) {
          sendEvent({ type: "error", error: result.error });
          controller.close();
          return;
        }

        // Fetch the created valuation
        const db = getDb();
        const [created] = await db
          .select()
          .from(stockValuations)
          .where(eq(stockValuations.ticker, upperTicker))
          .orderBy(desc(stockValuations.generatedAt))
          .limit(1);

        sendEvent({
          type: "complete",
          valuation: {
            ticker: created.ticker,
            companyName: created.companyName,
            researchDocument: created.researchDocument,
            structuredInsights: created.structuredInsights ?? null,
            generatedAt: created.generatedAt.toISOString(),
          },
        });
      } catch (err) {
        sendEvent({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
