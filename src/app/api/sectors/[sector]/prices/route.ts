import { NextResponse } from "next/server";
import { slugToSector, SECTOR_ETFS } from "@/lib/sectors";
import { fetchSectorAndBenchmark } from "@/lib/sector-data";

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
  const { sector: sectorData, benchmark } = await fetchSectorAndBenchmark(ticker);

  return NextResponse.json({
    sector: {
      ticker: sectorData.ticker,
      prices: sectorData.prices,
      changes: sectorData.changes,
    },
    benchmark: {
      ticker: benchmark.ticker,
      prices: benchmark.prices,
      changes: benchmark.changes,
    },
  });
}
