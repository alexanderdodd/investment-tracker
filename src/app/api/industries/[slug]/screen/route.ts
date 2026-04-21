import { NextResponse } from "next/server";
import { screenSingleIndustry } from "@/lib/industry-screen";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const result = await screenSingleIndustry(slug);
    if (!result) {
      return NextResponse.json({ error: "Industry not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Screen error:", err);
    return NextResponse.json(
      { error: "Screen failed", detail: String(err) },
      { status: 500 }
    );
  }
}
