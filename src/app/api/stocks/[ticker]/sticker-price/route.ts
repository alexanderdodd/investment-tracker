import { NextResponse } from "next/server";
import { buildStickerInputs } from "@/lib/sticker-inputs";

export const maxDuration = 60;

// GET: inputs for the Rule #1 sticker price calculation
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  return NextResponse.json(await buildStickerInputs(ticker));
}
