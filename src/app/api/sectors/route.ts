import { NextResponse } from "next/server";
import { fetchAllSectorData } from "@/lib/sector-data";

export async function GET() {
  const results = await fetchAllSectorData();
  return NextResponse.json(results);
}
