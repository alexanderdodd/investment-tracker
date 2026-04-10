import { NextResponse } from "next/server";
import { generateAllReports } from "@/lib/generate-reports";
import { generateAllEmergingLeaders } from "@/lib/generate-emerging-leaders";
import { generateAllSectorAnalyses } from "@/lib/generate-sector-analysis";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run sequentially to avoid rate limits
  const reportResults = await generateAllReports();
  const leaderResults = await generateAllEmergingLeaders();
  const analysisResults = await generateAllSectorAnalyses();

  const reportOk = reportResults.filter((r) => r.success).length;
  const reportFail = reportResults.filter((r) => !r.success).length;
  const leaderOk = leaderResults.filter((r) => r.success).length;
  const leaderFail = leaderResults.filter((r) => !r.success).length;
  const analysisOk = analysisResults.filter((r) => r.success).length;
  const analysisFail = analysisResults.filter((r) => !r.success).length;

  return NextResponse.json({
    message: `Reports: ${reportOk}/${reportOk + reportFail}. Leaders: ${leaderOk}/${leaderOk + leaderFail}. Analyses: ${analysisOk}/${analysisOk + analysisFail}.`,
    reports: reportResults,
    emergingLeaders: leaderResults,
    analyses: analysisResults,
  });
}
