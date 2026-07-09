import { NextResponse } from "next/server";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { investorProfiles } from "@/db/schema";
import { openrouter } from "@/lib/ai";
import { tryParseJson } from "@/lib/json-utils";
import { normalizeTags, vocabularyPromptBlock } from "@/lib/meaning-tags";

const TAG_MODEL = "google/gemini-2.5-flash";

interface ProfileInput {
  talents: string;
  passions: string;
  spending: string;
}

/** ONE LLM call: profile free text → interest tags + keywords */
async function deriveInterests(input: ProfileInput): Promise<{
  interestTags: string[];
  keywords: string[];
} | null> {
  const prompt = `An investor described their Rule #1 "circle of competence". Map it to the
tags of companies they would UNDERSTAND and CARE ABOUT.

What they're good at (work/skills): """${input.talents.slice(0, 800)}"""
What they love (passions/hobbies): """${input.passions.slice(0, 800)}"""
Where their money goes (spending): """${input.spending.slice(0, 800)}"""

Choose 5-15 tags ONLY from this vocabulary (exact "group:tag" form):
${vocabularyPromptBlock()}

Also give up to 10 short lowercase keywords (brands, products, niches they
mentioned) for free-text matching.

Output ONLY strict JSON: {"tags": ["domain:...", ...], "keywords": ["...", ...]}`;

  try {
    const { text } = await generateText({ model: openrouter()(TAG_MODEL), prompt });
    const parsed = tryParseJson(text);
    if (!parsed) return null;
    const { tags } = normalizeTags(Array.isArray(parsed.tags) ? parsed.tags.map(String) : []);
    const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [])
      .map((k) => k.toLowerCase().trim())
      .filter((k) => k.length >= 2 && k.length <= 40)
      .slice(0, 10);
    if (tags.length === 0 && keywords.length === 0) return null;
    return { interestTags: tags, keywords };
  } catch {
    return null;
  }
}

// GET: the signed-in user's investor profile
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, session.user.id))
    .limit(1);
  return NextResponse.json({ profile: row ?? null });
}

// PUT: save the profile text, then derive interest tags (one LLM call).
// The text always persists even if tag derivation fails.
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as Partial<ProfileInput>;
  const input: ProfileInput = {
    talents: String(body.talents ?? "").slice(0, 2000),
    passions: String(body.passions ?? "").slice(0, 2000),
    spending: String(body.spending ?? "").slice(0, 2000),
  };

  const db = getDb();
  await db
    .insert(investorProfiles)
    .values({ userId: session.user.id, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: investorProfiles.userId,
      set: { ...input, updatedAt: new Date() },
    });

  const hasText = [input.talents, input.passions, input.spending].some((t) => t.trim() !== "");
  let derived: { interestTags: string[]; keywords: string[] } | null = null;
  if (hasText) {
    derived = await deriveInterests(input);
    if (derived) {
      await db
        .update(investorProfiles)
        .set({ ...derived, tagsGeneratedAt: new Date() })
        .where(eq(investorProfiles.userId, session.user.id));
    }
  } else {
    // Cleared profile → clear derived interests too
    await db
      .update(investorProfiles)
      .set({ interestTags: [], keywords: [], tagsGeneratedAt: new Date() })
      .where(eq(investorProfiles.userId, session.user.id));
  }

  const [row] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, session.user.id))
    .limit(1);
  return NextResponse.json({
    profile: row,
    tagsGenerated: !hasText || derived !== null,
  });
}
