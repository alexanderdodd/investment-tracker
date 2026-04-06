import { NextResponse } from "next/server";
import { generateAllReports } from "@/lib/generate-reports";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await generateAllReports();

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    message: `Generated ${succeeded} reports, ${failed} failed`,
    results,
  });
}
