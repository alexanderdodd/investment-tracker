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
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const db = getDb();
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
      ticker: latest.ticker,
      companyName: latest.companyName,
      researchDocument: latest.researchDocument,
      structuredInsights: latest.structuredInsights ?? null,
      generatedAt: latest.generatedAt.toISOString(),
    },
  });
}

// POST: trigger a new valuation with Server-Sent Events for progress
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Check for a recent valuation from this quarter
  const existing = await getExistingValuation(upperTicker);
  if (existing) {
    return NextResponse.json({
      status: "existing",
      valuation: {
        ticker: existing.ticker,
        companyName: existing.companyName,
        researchDocument: existing.researchDocument,
        structuredInsights: existing.structuredInsights ?? null,
        generatedAt: existing.generatedAt.toISOString(),
      },
    });
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
