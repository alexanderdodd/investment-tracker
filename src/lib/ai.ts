import { createOpenAI } from "@ai-sdk/openai";

let _openrouter: ReturnType<typeof createOpenAI> | null = null;

export function openrouter() {
  if (!_openrouter) {
    _openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _openrouter;
}
