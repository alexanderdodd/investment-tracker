import { NextResponse } from "next/server";
import { slugToSector, SECTOR_ETFS } from "@/lib/sectors";
import { SECTOR_HOLDINGS } from "@/lib/sector-holdings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: slug } = await params;
  const sector = slugToSector(slug);

  if (!sector) {
    return NextResponse.json({ error: "Unknown sector" }, { status: 404 });
  }

  const ticker = SECTOR_ETFS[sector];
  const holdings = SECTOR_HOLDINGS[ticker] ?? [];

  return NextResponse.json({ sector, ticker, holdings });
}
