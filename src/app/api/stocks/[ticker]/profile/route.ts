import { NextResponse } from "next/server";
import { fetchCompanyProfile } from "@/lib/company-profile";

// GET: company profile (name, business description) from Yahoo Finance
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  return NextResponse.json(await fetchCompanyProfile(ticker));
}
