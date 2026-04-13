import { NextResponse } from "next/server";
import { generateAllReports } from "@/lib/generate-reports";
import { generateAllEmergingLeaders } from "@/lib/generate-emerging-leaders";
import { generateAllValueStocks } from "@/lib/generate-value-stocks";
import { generateAllSectorAnalyses } from "@/lib/generate-sector-analysis";
import { generateIndustryAnalytics } from "@/lib/generate-industry-analytics";
import { generateValueCandidates } from "@/lib/generate-value-candidates";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run sequentially to avoid rate limits
  const reportResults = await generateAllReports();
  const leaderResults = await generateAllEmergingLeaders();
  const valueResults = await generateAllValueStocks();
  const analysisResults = await generateAllSectorAnalyses();
  const industryResults = await generateIndustryAnalytics();
  const candidateResults = await generateValueCandidates();

  const reportOk = reportResults.filter((r) => r.success).length;
  const reportFail = reportResults.filter((r) => !r.success).length;
  const leaderOk = leaderResults.filter((r) => r.success).length;
  const leaderFail = leaderResults.filter((r) => !r.success).length;
  const valueOk = valueResults.filter((r) => r.success).length;
  const valueFail = valueResults.filter((r) => !r.success).length;
  const analysisOk = analysisResults.filter((r) => r.success).length;
  const analysisFail = analysisResults.filter((r) => !r.success).length;
  const industryOk = industryResults.filter((r) => r.success).length;
  const industryFail = industryResults.filter((r) => !r.success).length;

  return NextResponse.json({
    message: `Reports: ${reportOk}/${reportOk + reportFail}. Leaders: ${leaderOk}/${leaderOk + leaderFail}. Value: ${valueOk}/${valueOk + valueFail}. Analyses: ${analysisOk}/${analysisOk + analysisFail}. Industries: ${industryOk}/${industryOk + industryFail}. Candidates: ${candidateResults.length}.`,
    reports: reportResults,
    emergingLeaders: leaderResults,
    valueStocks: valueResults,
    analyses: analysisResults,
    industryAnalytics: industryResults,
    valueCandidates: candidateResults,
  });
}
