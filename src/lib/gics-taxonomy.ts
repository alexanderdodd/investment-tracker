// Deterministic GICS taxonomy data.
// Source: S&P/MSCI GICS classification standard.
// This file is the single source of truth for sector/industry/sub-industry mappings.
// LLMs must NOT generate or modify these values.

export interface GicsSectorDef {
  code: string;
  name: string;
  etfTicker: string;
}

export interface GicsIndustryGroupDef {
  code: string;
  name: string;
  sectorCode: string;
}

export interface GicsIndustryDef {
  code: string;
  name: string;
  slug: string;
  industryGroupCode: string;
  sectorCode: string;
  cyclicalityClass: "defensive" | "mixed" | "cyclical" | "hyper_cyclical";
  valueFrameworkId?: string;
}

export interface GicsSubIndustryDef {
  code: string;
  name: string;
  industryCode: string;
}

// ─── Sectors ───────────────────────────────────────────────────────────────

export const GICS_SECTORS: GicsSectorDef[] = [
  { code: "10", name: "Energy", etfTicker: "XLE" },
  { code: "15", name: "Materials", etfTicker: "XLB" },
  { code: "20", name: "Industrials", etfTicker: "XLI" },
  { code: "25", name: "Consumer Discretionary", etfTicker: "XLY" },
  { code: "30", name: "Consumer Staples", etfTicker: "XLP" },
  { code: "35", name: "Health Care", etfTicker: "XLV" },
  { code: "40", name: "Financials", etfTicker: "XLF" },
  { code: "45", name: "Technology", etfTicker: "XLK" },
  { code: "50", name: "Communication Services", etfTicker: "XLC" },
  { code: "55", name: "Utilities", etfTicker: "XLU" },
  { code: "60", name: "Real Estate", etfTicker: "XLRE" },
];

// ─── Industry Groups ───────────────────────────────────────────────────────

export const GICS_INDUSTRY_GROUPS: GicsIndustryGroupDef[] = [
  // Energy
  { code: "1010", name: "Energy", sectorCode: "10" },
  // Materials
  { code: "1510", name: "Materials", sectorCode: "15" },
  // Industrials
  { code: "2010", name: "Capital Goods", sectorCode: "20" },
  { code: "2020", name: "Commercial & Professional Services", sectorCode: "20" },
  { code: "2030", name: "Transportation", sectorCode: "20" },
  // Consumer Discretionary
  { code: "2510", name: "Automobiles & Components", sectorCode: "25" },
  { code: "2520", name: "Consumer Durables & Apparel", sectorCode: "25" },
  { code: "2530", name: "Consumer Services", sectorCode: "25" },
  { code: "2550", name: "Retailing", sectorCode: "25" },
  // Consumer Staples
  { code: "3010", name: "Food & Staples Retailing", sectorCode: "30" },
  { code: "3020", name: "Food, Beverage & Tobacco", sectorCode: "30" },
  { code: "3030", name: "Household & Personal Products", sectorCode: "30" },
  // Health Care
  { code: "3510", name: "Health Care Equipment & Services", sectorCode: "35" },
  { code: "3520", name: "Pharmaceuticals, Biotechnology & Life Sciences", sectorCode: "35" },
  // Financials
  { code: "4010", name: "Banks", sectorCode: "40" },
  { code: "4020", name: "Financial Services", sectorCode: "40" },
  { code: "4030", name: "Insurance", sectorCode: "40" },
  // Technology
  { code: "4510", name: "Software & Services", sectorCode: "45" },
  { code: "4520", name: "Technology Hardware & Equipment", sectorCode: "45" },
  { code: "4530", name: "Semiconductors & Semiconductor Equipment", sectorCode: "45" },
  // Communication Services
  { code: "5010", name: "Telecommunication Services", sectorCode: "50" },
  { code: "5020", name: "Media & Entertainment", sectorCode: "50" },
  // Utilities
  { code: "5510", name: "Utilities", sectorCode: "55" },
  // Real Estate
  { code: "6010", name: "Equity Real Estate Investment Trusts (REITs)", sectorCode: "60" },
  { code: "6020", name: "Real Estate Management & Development", sectorCode: "60" },
];

// ─── Industries (benchmark sectors: Technology, Consumer Staples, Financials, Industrials + others) ─

export const GICS_INDUSTRIES: GicsIndustryDef[] = [
  // Technology — Software & Services
  { code: "451020", name: "IT Services", slug: "it-services", industryGroupCode: "4510", sectorCode: "45", cyclicalityClass: "mixed" },
  { code: "451030", name: "Software", slug: "software", industryGroupCode: "4510", sectorCode: "45", cyclicalityClass: "mixed", valueFrameworkId: "software_platforms_v1" },
  // Technology — Hardware
  { code: "452010", name: "Communications Equipment", slug: "communications-equipment", industryGroupCode: "4520", sectorCode: "45", cyclicalityClass: "cyclical" },
  { code: "452020", name: "Technology Hardware, Storage & Peripherals", slug: "technology-hardware", industryGroupCode: "4520", sectorCode: "45", cyclicalityClass: "cyclical" },
  { code: "452030", name: "Electronic Equipment, Instruments & Components", slug: "electronic-equipment", industryGroupCode: "4520", sectorCode: "45", cyclicalityClass: "cyclical" },
  // Technology — Semiconductors
  { code: "453010", name: "Semiconductors & Semiconductor Equipment", slug: "semiconductors", industryGroupCode: "4530", sectorCode: "45", cyclicalityClass: "hyper_cyclical", valueFrameworkId: "cyclical_semiconductor_memory_v1" },

  // Consumer Staples — Food & Staples Retailing
  { code: "301010", name: "Consumer Staples Distribution & Retail", slug: "consumer-staples-retail", industryGroupCode: "3010", sectorCode: "30", cyclicalityClass: "defensive" },
  // Consumer Staples — Food, Beverage & Tobacco
  { code: "302010", name: "Beverages", slug: "beverages", industryGroupCode: "3020", sectorCode: "30", cyclicalityClass: "defensive", valueFrameworkId: "consumer_beverages_v1" },
  { code: "302020", name: "Food Products", slug: "food-products", industryGroupCode: "3020", sectorCode: "30", cyclicalityClass: "defensive" },
  { code: "302030", name: "Tobacco", slug: "tobacco", industryGroupCode: "3020", sectorCode: "30", cyclicalityClass: "defensive" },
  // Consumer Staples — Household & Personal Products
  { code: "303010", name: "Household Products", slug: "household-products", industryGroupCode: "3030", sectorCode: "30", cyclicalityClass: "defensive" },
  { code: "303020", name: "Personal Care Products", slug: "personal-care-products", industryGroupCode: "3030", sectorCode: "30", cyclicalityClass: "defensive" },

  // Financials — Banks
  { code: "401010", name: "Diversified Banks", slug: "diversified-banks", industryGroupCode: "4010", sectorCode: "40", cyclicalityClass: "cyclical" },
  { code: "401020", name: "Regional Banks", slug: "regional-banks", industryGroupCode: "4010", sectorCode: "40", cyclicalityClass: "cyclical" },
  // Financials — Financial Services
  { code: "402010", name: "Diversified Financial Services", slug: "diversified-financial-services", industryGroupCode: "4020", sectorCode: "40", cyclicalityClass: "mixed" },
  { code: "402020", name: "Consumer Finance", slug: "consumer-finance", industryGroupCode: "4020", sectorCode: "40", cyclicalityClass: "cyclical" },
  { code: "402030", name: "Capital Markets", slug: "capital-markets", industryGroupCode: "4020", sectorCode: "40", cyclicalityClass: "cyclical" },
  { code: "402040", name: "Mortgage Real Estate Investment Trusts (REITs)", slug: "mortgage-reits", industryGroupCode: "4020", sectorCode: "40", cyclicalityClass: "cyclical" },
  // Financials — Insurance
  { code: "403010", name: "Insurance", slug: "insurance", industryGroupCode: "4030", sectorCode: "40", cyclicalityClass: "mixed", valueFrameworkId: "property_casualty_insurance_v1" },

  // Industrials — Capital Goods
  { code: "201010", name: "Aerospace & Defense", slug: "aerospace-defense", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "mixed" },
  { code: "201020", name: "Building Products", slug: "building-products", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "cyclical" },
  { code: "201030", name: "Construction & Engineering", slug: "construction-engineering", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "cyclical" },
  { code: "201040", name: "Electrical Equipment", slug: "electrical-equipment", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "cyclical" },
  { code: "201050", name: "Industrial Conglomerates", slug: "industrial-conglomerates", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "mixed" },
  { code: "201060", name: "Machinery", slug: "machinery", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "cyclical", valueFrameworkId: "industrial_machinery_v1" },
  { code: "201070", name: "Trading Companies & Distributors", slug: "trading-companies", industryGroupCode: "2010", sectorCode: "20", cyclicalityClass: "cyclical" },
  // Industrials — Commercial & Professional Services
  { code: "202010", name: "Commercial Services & Supplies", slug: "commercial-services", industryGroupCode: "2020", sectorCode: "20", cyclicalityClass: "mixed" },
  { code: "202020", name: "Professional Services", slug: "professional-services", industryGroupCode: "2020", sectorCode: "20", cyclicalityClass: "defensive" },
  // Industrials — Transportation
  { code: "203010", name: "Air Freight & Logistics", slug: "air-freight-logistics", industryGroupCode: "2030", sectorCode: "20", cyclicalityClass: "cyclical" },
  { code: "203020", name: "Passenger Airlines", slug: "passenger-airlines", industryGroupCode: "2030", sectorCode: "20", cyclicalityClass: "hyper_cyclical" },
  { code: "203030", name: "Marine Transportation", slug: "marine-transportation", industryGroupCode: "2030", sectorCode: "20", cyclicalityClass: "hyper_cyclical" },
  { code: "203040", name: "Ground Transportation", slug: "ground-transportation", industryGroupCode: "2030", sectorCode: "20", cyclicalityClass: "mixed" },
  { code: "203050", name: "Transportation Infrastructure", slug: "transportation-infrastructure", industryGroupCode: "2030", sectorCode: "20", cyclicalityClass: "mixed" },

  // Energy
  { code: "101010", name: "Oil, Gas & Consumable Fuels", slug: "oil-gas-fuels", industryGroupCode: "1010", sectorCode: "10", cyclicalityClass: "hyper_cyclical" },
  { code: "101020", name: "Energy Equipment & Services", slug: "energy-equipment-services", industryGroupCode: "1010", sectorCode: "10", cyclicalityClass: "hyper_cyclical" },

  // Materials
  { code: "151010", name: "Chemicals", slug: "chemicals", industryGroupCode: "1510", sectorCode: "15", cyclicalityClass: "cyclical" },
  { code: "151020", name: "Construction Materials", slug: "construction-materials", industryGroupCode: "1510", sectorCode: "15", cyclicalityClass: "cyclical" },
  { code: "151030", name: "Containers & Packaging", slug: "containers-packaging", industryGroupCode: "1510", sectorCode: "15", cyclicalityClass: "mixed" },
  { code: "151040", name: "Metals & Mining", slug: "metals-mining", industryGroupCode: "1510", sectorCode: "15", cyclicalityClass: "hyper_cyclical" },
  { code: "151050", name: "Paper & Forest Products", slug: "paper-forest-products", industryGroupCode: "1510", sectorCode: "15", cyclicalityClass: "cyclical" },

  // Consumer Discretionary
  { code: "251010", name: "Automobile Components", slug: "automobile-components", industryGroupCode: "2510", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "251020", name: "Automobiles", slug: "automobiles", industryGroupCode: "2510", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "252010", name: "Household Durables", slug: "household-durables", industryGroupCode: "2520", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "252020", name: "Leisure Products", slug: "leisure-products", industryGroupCode: "2520", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "252030", name: "Textiles, Apparel & Luxury Goods", slug: "textiles-apparel", industryGroupCode: "2520", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "253010", name: "Hotels, Restaurants & Leisure", slug: "hotels-restaurants-leisure", industryGroupCode: "2530", sectorCode: "25", cyclicalityClass: "cyclical" },
  { code: "253020", name: "Diversified Consumer Services", slug: "diversified-consumer-services", industryGroupCode: "2530", sectorCode: "25", cyclicalityClass: "mixed" },
  { code: "255010", name: "Distributors", slug: "distributors", industryGroupCode: "2550", sectorCode: "25", cyclicalityClass: "mixed" },
  { code: "255020", name: "Internet & Direct Marketing Retail", slug: "internet-retail", industryGroupCode: "2550", sectorCode: "25", cyclicalityClass: "mixed" },
  { code: "255030", name: "Broadline Retail", slug: "broadline-retail", industryGroupCode: "2550", sectorCode: "25", cyclicalityClass: "mixed" },
  { code: "255040", name: "Specialty Retail", slug: "specialty-retail", industryGroupCode: "2550", sectorCode: "25", cyclicalityClass: "cyclical" },

  // Health Care
  { code: "351010", name: "Health Care Equipment & Supplies", slug: "health-care-equipment", industryGroupCode: "3510", sectorCode: "35", cyclicalityClass: "defensive" },
  { code: "351020", name: "Health Care Providers & Services", slug: "health-care-providers", industryGroupCode: "3510", sectorCode: "35", cyclicalityClass: "defensive" },
  { code: "351030", name: "Health Care Technology", slug: "health-care-technology", industryGroupCode: "3510", sectorCode: "35", cyclicalityClass: "mixed" },
  { code: "352010", name: "Biotechnology", slug: "biotechnology", industryGroupCode: "3520", sectorCode: "35", cyclicalityClass: "mixed" },
  { code: "352020", name: "Pharmaceuticals", slug: "pharmaceuticals", industryGroupCode: "3520", sectorCode: "35", cyclicalityClass: "defensive" },
  { code: "352030", name: "Life Sciences Tools & Services", slug: "life-sciences-tools", industryGroupCode: "3520", sectorCode: "35", cyclicalityClass: "mixed" },

  // Communication Services
  { code: "501010", name: "Diversified Telecommunication Services", slug: "diversified-telecom", industryGroupCode: "5010", sectorCode: "50", cyclicalityClass: "defensive" },
  { code: "501020", name: "Wireless Telecommunication Services", slug: "wireless-telecom", industryGroupCode: "5010", sectorCode: "50", cyclicalityClass: "defensive" },
  { code: "502010", name: "Media", slug: "media", industryGroupCode: "5020", sectorCode: "50", cyclicalityClass: "cyclical" },
  { code: "502020", name: "Entertainment", slug: "entertainment", industryGroupCode: "5020", sectorCode: "50", cyclicalityClass: "cyclical" },
  { code: "502030", name: "Interactive Media & Services", slug: "interactive-media", industryGroupCode: "5020", sectorCode: "50", cyclicalityClass: "mixed", valueFrameworkId: "interactive_media_v1" },

  // Utilities
  { code: "551010", name: "Electric Utilities", slug: "electric-utilities", industryGroupCode: "5510", sectorCode: "55", cyclicalityClass: "defensive" },
  { code: "551020", name: "Gas Utilities", slug: "gas-utilities", industryGroupCode: "5510", sectorCode: "55", cyclicalityClass: "defensive" },
  { code: "551030", name: "Multi-Utilities", slug: "multi-utilities", industryGroupCode: "5510", sectorCode: "55", cyclicalityClass: "defensive" },
  { code: "551040", name: "Water Utilities", slug: "water-utilities", industryGroupCode: "5510", sectorCode: "55", cyclicalityClass: "defensive" },
  { code: "551050", name: "Independent Power and Renewable Electricity Producers", slug: "independent-power", industryGroupCode: "5510", sectorCode: "55", cyclicalityClass: "mixed" },

  // Real Estate
  { code: "601010", name: "Diversified REITs", slug: "diversified-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "mixed" },
  { code: "601025", name: "Industrial REITs", slug: "industrial-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "mixed" },
  { code: "601030", name: "Hotel & Resort REITs", slug: "hotel-resort-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "cyclical" },
  { code: "601040", name: "Office REITs", slug: "office-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "cyclical" },
  { code: "601050", name: "Health Care REITs", slug: "health-care-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "defensive" },
  { code: "601060", name: "Residential REITs", slug: "residential-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "mixed" },
  { code: "601070", name: "Retail REITs", slug: "retail-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "cyclical" },
  { code: "601080", name: "Specialized REITs", slug: "specialized-reits", industryGroupCode: "6010", sectorCode: "60", cyclicalityClass: "mixed" },
  { code: "602010", name: "Real Estate Management & Development", slug: "real-estate-management", industryGroupCode: "6020", sectorCode: "60", cyclicalityClass: "cyclical" },
];

// Helper to find a sector by name
export function gicsSectorByName(name: string): GicsSectorDef | undefined {
  return GICS_SECTORS.find((s) => s.name === name);
}

// Helper to find industries by sector code
export function gicsIndustriesBySector(sectorCode: string): GicsIndustryDef[] {
  return GICS_INDUSTRIES.filter((i) => i.sectorCode === sectorCode);
}

// Helper to find an industry by slug
export function gicsIndustryBySlug(slug: string): GicsIndustryDef | undefined {
  return GICS_INDUSTRIES.find((i) => i.slug === slug);
}
