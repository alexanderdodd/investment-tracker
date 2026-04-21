/**
 * Maps Yahoo Finance industry names to GICS industry codes.
 *
 * Yahoo uses ~150+ industry names; we map them to 76 GICS industries.
 * Unmapped industries return null — callers should log and skip.
 *
 * Source: observed Yahoo assetProfile.industry values for S&P 500 stocks.
 */

// Map Yahoo industry → GICS 6-digit industry code
const YAHOO_INDUSTRY_TO_GICS: Record<string, string> = {
  // ─── Technology ─────────────────────────────────────────────────────
  "Software - Infrastructure": "451030",
  "Software - Application": "451030",
  "Information Technology Services": "451020",
  "Communication Equipment": "452010",
  "Consumer Electronics": "452020",
  "Computer Hardware": "452020",
  "Electronic Components": "452030",
  "Scientific & Technical Instruments": "452030",
  "Electronics & Computer Distribution": "452030",
  "Semiconductors": "453010",
  "Semiconductor Equipment & Materials": "453010",

  // ─── Consumer Staples ──────────────────────────────────────────────
  "Discount Stores": "301010",
  "Grocery Stores": "301010",
  "Food Distribution": "301010",
  "Beverages - Non-Alcoholic": "302010",
  "Beverages - Brewers": "302010",
  "Beverages - Wineries & Distilleries": "302010",
  "Packaged Foods": "302020",
  "Confectioners": "302020",
  "Farm Products": "302020",
  "Tobacco": "302030",
  "Household & Personal Products": "303010",
  "Personal Care Products": "303020", // Note: PG maps to 303010, EL to 303020 via this

  // ─── Financials ────────────────────────────────────────────────────
  "Banks - Diversified": "401010",
  "Banks - Regional": "401020",
  "Credit Services": "402010", // Visa, Mastercard, PayPal
  "Financial Data & Stock Exchanges": "402030",
  "Capital Markets": "402030",
  "Asset Management": "402030",
  "Investment Brokerage - National": "402030", // Schwab
  "REIT - Mortgage": "402040",
  "Mortgage Finance": "402040",
  "Insurance - Property & Casualty": "403010",
  "Insurance - Life": "403010",
  "Insurance - Diversified": "403010",
  "Insurance - Specialty": "403010",
  "Insurance - Reinsurance": "403010",
  "Insurance Brokers": "403010",
  "Financial Conglomerates": "402010",

  // ─── Industrials ───────────────────────────────────────────────────
  "Aerospace & Defense": "201010",
  "Building Products & Equipment": "201020",
  "Building Materials": "201020", // VMC is Construction Materials but Yahoo calls it Building Materials
  "Engineering & Construction": "201030",
  "Electrical Equipment & Parts": "201040",
  "Specialty Industrial Machinery": "201040", // ETN maps here
  "Conglomerates": "201050",
  "Farm & Heavy Construction Machinery": "201060",
  "Specialty Industrial Machinery ": "201060", // some Yahoo duplicates with trailing space
  "Industrial Distribution": "201070",
  "Waste Management": "202010",
  "Security & Protection Services": "202010",
  "Staffing & Employment Services": "202010",
  "Consulting Services": "202020",
  "Staffing & Outsourcing Services": "202020",
  "Integrated Freight & Logistics": "203010",
  "Airlines": "203020",
  "Marine Shipping": "203030",
  "Railroads": "203040",
  "Trucking": "203040",
  "Rental & Leasing Services": "203050",

  // ─── Communication Services ────────────────────────────────────────
  "Telecom Services": "501010", // T, VZ, CMCSA
  "Internet Content & Information": "502030", // META, GOOGL
  "Entertainment": "502020",
  "Electronic Gaming & Multimedia": "502020",
  "Broadcasting": "502010",
  "Publishing": "502010",
  "Advertising Agencies": "502010",

  // ─── Energy ────────────────────────────────────────────────────────
  "Oil & Gas Integrated": "101010",
  "Oil & Gas E&P": "101010",
  "Oil & Gas Midstream": "101010",
  "Oil & Gas Refining & Marketing": "101010",
  "Oil & Gas Equipment & Services": "101020",
  "Oil & Gas Drilling": "101020",

  // ─── Materials ─────────────────────────────────────────────────────
  "Specialty Chemicals": "151010",
  "Chemicals": "151010",
  "Agricultural Inputs": "151010",
  "Construction Materials": "151020", // Note: VMC is "Building Materials" in Yahoo
  "Packaging & Containers": "151030",
  "Gold": "151040",
  "Copper": "151040",
  "Other Industrial Metals & Mining": "151040",
  "Steel": "151040",
  "Silver": "151040",
  "Coking Coal": "151040",
  "Aluminum": "151040",
  "Lumber & Wood Production": "151050",
  "Paper & Paper Products": "151050",

  // ─── Consumer Discretionary ────────────────────────────────────────
  "Auto Parts": "251010",
  "Auto Manufacturers": "251020",
  "Residential Construction": "252010",
  "Furnishings, Fixtures & Appliances": "252010",
  "Home Improvement Retail": "255040", // HD, LOW
  "Leisure": "252020",
  "Gambling": "253010",
  "Resorts & Casinos": "253010",
  "Restaurants": "253010",
  "Lodging": "253010",
  "Travel Services": "253010",
  "Personal Services": "253020",
  "Education & Training Services": "253020",
  "Specialty Retail": "255040",
  "Apparel Retail": "255040",
  "Luxury Goods": "252030",
  "Footwear & Accessories": "252030",
  "Apparel Manufacturing": "252030",
  "Textile Manufacturing": "252030",
  "Internet Retail": "255020",
  "Department Stores": "255030",

  // ─── Health Care ───────────────────────────────────────────────────
  "Medical Devices": "351010",
  "Medical Instruments & Supplies": "351010",
  "Medical Distribution": "351020",
  "Healthcare Plans": "351020",
  "Medical Care Facilities": "351020",
  "Health Information Services": "351030",
  "Biotechnology": "352010",
  "Drug Manufacturers - General": "352020",
  "Drug Manufacturers - Specialty & Generic": "352020",
  "Diagnostics & Research": "352030",
  "Life Sciences Tools & Services": "352030", // if Yahoo uses this name

  // ─── Utilities ─────────────────────────────────────────────────────
  "Utilities - Regulated Electric": "551010",
  "Utilities - Regulated Gas": "551020",
  "Utilities - Diversified": "551030",
  "Utilities - Regulated Water": "551040",
  "Utilities - Independent Power Producers": "551050",
  "Utilities - Renewable": "551050",
  "Solar": "551050",

  // ─── Real Estate ───────────────────────────────────────────────────
  "REIT - Diversified": "601010",
  "REIT - Industrial": "601025",
  "REIT - Hotel & Motel": "601030",
  "REIT - Office": "601040",
  "REIT - Healthcare Facilities": "601050",
  "REIT - Residential": "601060",
  "REIT - Retail": "601070",
  "REIT - Specialty": "601080",
  "Real Estate Services": "602010",
  "Real Estate - Development": "602010",
  "Real Estate - Diversified": "602010",
};

// Also handle Yahoo's "Building Materials" → could be 151020 (Construction Materials)
// or 201020 (Building Products). We default to Construction Materials.
// Override by manual curated_override if needed.

/**
 * Map a Yahoo Finance industry name to a GICS 6-digit industry code.
 * Returns null if unmapped.
 */
export function yahooIndustryToGics(yahooIndustry: string): string | null {
  return YAHOO_INDUSTRY_TO_GICS[yahooIndustry] ?? null;
}

/**
 * Map a Yahoo Finance sector name to our GICS sector code.
 */
const YAHOO_SECTOR_TO_GICS_CODE: Record<string, string> = {
  "Technology": "45",
  "Financial Services": "40",
  "Consumer Cyclical": "25",
  "Consumer Defensive": "30",
  "Healthcare": "35",
  "Communication Services": "50",
  "Industrials": "20",
  "Energy": "10",
  "Utilities": "55",
  "Basic Materials": "15",
  "Real Estate": "60",
};

export function yahooSectorToGicsCode(yahooSector: string): string | null {
  return YAHOO_SECTOR_TO_GICS_CODE[yahooSector] ?? null;
}
