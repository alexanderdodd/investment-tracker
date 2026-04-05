export const SECTORS = [
  "Technology",
  "Financials",
  "Utilities",
  "Consumer Staples",
  "Consumer Discretionary",
  "Industrials",
  "Health Care",
  "Energy",
  "Materials",
  "Communication Services",
  "Real Estate",
] as const;

export type SectorName = (typeof SECTORS)[number];

export const SECTOR_ETFS: Record<SectorName, string> = {
  Technology: "XLK",
  Financials: "XLF",
  Utilities: "XLU",
  "Consumer Staples": "XLP",
  "Consumer Discretionary": "XLY",
  Industrials: "XLI",
  "Health Care": "XLV",
  Energy: "XLE",
  Materials: "XLB",
  "Communication Services": "XLC",
  "Real Estate": "XLRE",
};

export function sectorToSlug(sector: string): string {
  return sector.toLowerCase().replace(/\s+/g, "-");
}

export function slugToSector(slug: string): SectorName | null {
  const found = SECTORS.find((s) => sectorToSlug(s) === slug);
  return found ?? null;
}
