/**
 * Extract a JSON object from LLM output. Models wrap JSON in markdown
 * fences, prepend commentary, or leave trailing text — try progressively
 * more aggressive candidates and return the first that parses.
 */
export function tryParseJson(text: string): Record<string, unknown> | null {
  const candidates: string[] = [text.trim()];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}
