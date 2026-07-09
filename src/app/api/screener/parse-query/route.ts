import { NextResponse } from "next/server";
import { generateText } from "ai";
import { auth } from "@/auth";
import { openrouter } from "@/lib/ai";
import { tryParseJson } from "@/lib/json-utils";
import { normalizeTags, vocabularyPromptBlock } from "@/lib/meaning-tags";
import { SECTORS } from "@/lib/sectors";

const PARSE_MODEL = "google/gemini-2.5-flash";

// POST { query }: one cheap LLM call converting a natural-language screen
// request into structured filter params. Auth-required — it's the only
// user-triggerable LLM call; chip edits afterwards are LLM-free.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = String(body?.query ?? "").slice(0, 300).trim();
  if (!query) return NextResponse.json({ error: "Empty query" }, { status: 400 });

  const fallback = () => ({
    tags: [] as string[],
    keywords: query
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((w) => w.length >= 3)
      .slice(0, 6),
    minScore: null,
    minMcap: null,
    maxMcap: null,
    sector: null,
    fallback: true,
  });

  const prompt = `Convert this stock-screen request into a JSON filter.

Tags MUST come from this vocabulary (exact "group:tag" form):
${vocabularyPromptBlock()}

Known sectors: ${SECTORS.join(", ")}.
Market caps as plain USD numbers (e.g. "under 10B" → maxMcap 10000000000).
minScore is the Big Five score 0-5 ("profitable"/"quality" → 3, "wonderful" → 4).
Keywords: short lowercase terms for anything the vocabulary can't express
(brand names, niches). Leave fields null when not implied.

Request: "${query}"

Output ONLY strict JSON:
{"tags": [], "keywords": [], "minScore": null, "minMcap": null, "maxMcap": null, "sector": null}`;

  try {
    const { text } = await generateText({ model: openrouter()(PARSE_MODEL), prompt });
    const parsed = tryParseJson(text);
    if (!parsed) return NextResponse.json(fallback());

    const { tags } = normalizeTags(Array.isArray(parsed.tags) ? parsed.tags.map(String) : []);
    const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [])
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length >= 2 && k.length <= 40)
      .slice(0, 6);
    const num = (v: unknown, min: number, max: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(Math.max(v, min), max) : null;
    const sector =
      typeof parsed.sector === "string" && (SECTORS as readonly string[]).includes(parsed.sector)
        ? parsed.sector
        : null;

    if (tags.length === 0 && keywords.length === 0 && !sector && parsed.minScore == null && parsed.minMcap == null && parsed.maxMcap == null) {
      return NextResponse.json(fallback());
    }

    return NextResponse.json({
      tags,
      keywords,
      minScore: num(parsed.minScore, 0, 5),
      minMcap: num(parsed.minMcap, 0, 1e13),
      maxMcap: num(parsed.maxMcap, 0, 1e13),
      sector,
      fallback: false,
    });
  } catch {
    return NextResponse.json(fallback());
  }
}
