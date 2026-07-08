import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/index";
import { ruleOneScreens } from "@/db/schema";
import { runRuleOneScreen, type RuleOneProgress } from "@/lib/rule-one-screen";

// Cold industries need many EDGAR builds plus LLM calls for finalists
export const maxDuration = 300;

// GET: latest stored screen result for this industry
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = getDb();
  const [row] = await db
    .select()
    .from(ruleOneScreens)
    .where(eq(ruleOneScreens.industrySlug, slug))
    .limit(1);

  if (!row) return NextResponse.json({ result: null });
  return NextResponse.json({
    result: row.payload,
    generatedAt: row.generatedAt.toISOString(),
  });
}

// POST: run the screen, streaming progress via SSE
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await runRuleOneScreen(slug, (p: RuleOneProgress) =>
          send({ type: "progress", ...p })
        );
        if (!result) {
          send({ type: "error", error: "Industry not found" });
          controller.close();
          return;
        }

        const generatedAt = new Date();
        const db = getDb();
        await db
          .insert(ruleOneScreens)
          .values({ industrySlug: slug, payload: result, generatedAt })
          .onConflictDoUpdate({
            target: ruleOneScreens.industrySlug,
            set: { payload: result, generatedAt },
          });

        send({ type: "complete", result, generatedAt: generatedAt.toISOString() });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
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
