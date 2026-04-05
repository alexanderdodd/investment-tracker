"use client";

import { useEffect, useState } from "react";
import { SectorCard, type Timeframe } from "@/components/sector-card";

interface SectorData {
  ticker: string;
  prices: { ts: number; close: number }[];
  changes: { day: number | null; month: number | null; year: number | null; fiveYear: number | null };
}

const SECTOR_ORDER = [
  "Technology",
  "Financials",
  "Health Care",
  "Energy",
  "Consumer Discretionary",
  "Industrials",
  "Communication Services",
  "Consumer Staples",
  "Utilities",
  "Materials",
  "Real Estate",
];

export function SectorGrid() {
  const [sectors, setSectors] = useState<Record<string, SectorData> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");

  useEffect(() => {
    fetch("/api/sectors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch sector data");
        return res.json();
      })
      .then(setSectors)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        Failed to load sector data. Please try again later.
      </div>
    );
  }

  if (!sectors) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SECTOR_ORDER.map((sector) => (
          <div
            key={sector}
            className="h-56 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SECTOR_ORDER.map((sector) => {
        const sectorData = sectors[sector];
        if (!sectorData) return null;
        return (
          <SectorCard key={sector} sector={sector} sectorData={sectorData} timeframe={timeframe} onTimeframeChange={setTimeframe} />
        );
      })}
    </div>
  );
}
