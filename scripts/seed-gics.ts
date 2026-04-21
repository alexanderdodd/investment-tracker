import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/db/index";
import {
  gicsSectors,
  gicsIndustryGroups,
  gicsIndustries,
  gicsSubIndustries,
  stockClassifications,
} from "../src/db/schema";
import {
  GICS_SECTORS,
  GICS_INDUSTRY_GROUPS,
  GICS_INDUSTRIES,
} from "../src/lib/gics-taxonomy";

async function main() {
  const db = getDb();

  console.log("Seeding GICS sectors...");
  for (const s of GICS_SECTORS) {
    await db
      .insert(gicsSectors)
      .values({
        id: `sector-${s.code}`,
        code: s.code,
        name: s.name,
        etfTicker: s.etfTicker,
      })
      .onConflictDoUpdate({
        target: gicsSectors.id,
        set: { name: s.name, etfTicker: s.etfTicker },
      });
  }
  console.log(`  ✓ ${GICS_SECTORS.length} sectors`);

  console.log("Seeding GICS industry groups...");
  for (const ig of GICS_INDUSTRY_GROUPS) {
    await db
      .insert(gicsIndustryGroups)
      .values({
        id: `ig-${ig.code}`,
        code: ig.code,
        name: ig.name,
        sectorId: `sector-${ig.sectorCode}`,
      })
      .onConflictDoUpdate({
        target: gicsIndustryGroups.id,
        set: { name: ig.name },
      });
  }
  console.log(`  ✓ ${GICS_INDUSTRY_GROUPS.length} industry groups`);

  console.log("Seeding GICS industries...");
  for (const ind of GICS_INDUSTRIES) {
    await db
      .insert(gicsIndustries)
      .values({
        id: `ind-${ind.code}`,
        code: ind.code,
        name: ind.name,
        slug: ind.slug,
        sectorId: `sector-${ind.sectorCode}`,
        industryGroupId: `ig-${ind.industryGroupCode}`,
        cyclicalityClass: ind.cyclicalityClass,
        valueFrameworkId: ind.valueFrameworkId ?? null,
      })
      .onConflictDoUpdate({
        target: gicsIndustries.id,
        set: {
          name: ind.name,
          slug: ind.slug,
          cyclicalityClass: ind.cyclicalityClass,
          valueFrameworkId: ind.valueFrameworkId ?? null,
        },
      });
  }
  console.log(`  ✓ ${GICS_INDUSTRIES.length} industries`);

  // Seed benchmark stock classifications
  const benchmarkStocks = [
    // ═══ Technology ══════════════════════════════════════════════════════════
    // Semiconductors (453010)
    { ticker: "MU", companyName: "Micron Technology, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "NVDA", companyName: "NVIDIA Corporation", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "AMD", companyName: "Advanced Micro Devices, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "INTC", companyName: "Intel Corporation", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "AVGO", companyName: "Broadcom Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "QCOM", companyName: "Qualcomm Incorporated", sectorCode: "45", igCode: "4530", indCode: "453010" },
    // Software (451030)
    { ticker: "MSFT", companyName: "Microsoft Corporation", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "ORCL", companyName: "Oracle Corporation", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "CRM", companyName: "Salesforce, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "ADBE", companyName: "Adobe Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "NOW", companyName: "ServiceNow, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    // Technology Hardware, Storage & Peripherals (452020)
    { ticker: "AAPL", companyName: "Apple Inc.", sectorCode: "45", igCode: "4520", indCode: "452020" },
    { ticker: "HPQ", companyName: "HP Inc.", sectorCode: "45", igCode: "4520", indCode: "452020" },
    { ticker: "DELL", companyName: "Dell Technologies Inc.", sectorCode: "45", igCode: "4520", indCode: "452020" },
    // IT Services (451020)
    { ticker: "ACN", companyName: "Accenture plc", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "IBM", companyName: "International Business Machines Corporation", sectorCode: "45", igCode: "4510", indCode: "451020" },
    // Communications Equipment (452010)
    { ticker: "CSCO", companyName: "Cisco Systems, Inc.", sectorCode: "45", igCode: "4520", indCode: "452010" },
    { ticker: "JNPR", companyName: "Juniper Networks, Inc.", sectorCode: "45", igCode: "4520", indCode: "452010" },
    { ticker: "MSI", companyName: "Motorola Solutions, Inc.", sectorCode: "45", igCode: "4520", indCode: "452010" },
    // Electronic Equipment, Instruments & Components (452030)
    { ticker: "TEL", companyName: "TE Connectivity Ltd.", sectorCode: "45", igCode: "4520", indCode: "452030" },
    { ticker: "GLW", companyName: "Corning Incorporated", sectorCode: "45", igCode: "4520", indCode: "452030" },
    { ticker: "APH", companyName: "Amphenol Corporation", sectorCode: "45", igCode: "4520", indCode: "452030" },

    // ═══ Consumer Staples ════════════════════════════════════════════════════
    // Beverages (302010)
    { ticker: "KO", companyName: "The Coca-Cola Company", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "PEP", companyName: "PepsiCo, Inc.", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "KDP", companyName: "Keurig Dr Pepper Inc.", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "MNST", companyName: "Monster Beverage Corporation", sectorCode: "30", igCode: "3020", indCode: "302010" },
    // Food Products (302020)
    { ticker: "GIS", companyName: "General Mills, Inc.", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "K", companyName: "Kellanova", sectorCode: "30", igCode: "3020", indCode: "302020" },
    // Household Products (303010)
    { ticker: "PG", companyName: "The Procter & Gamble Company", sectorCode: "30", igCode: "3030", indCode: "303010" },
    { ticker: "CL", companyName: "Colgate-Palmolive Company", sectorCode: "30", igCode: "3030", indCode: "303010" },
    // Consumer Staples Distribution & Retail (301010)
    { ticker: "COST", companyName: "Costco Wholesale Corporation", sectorCode: "30", igCode: "3010", indCode: "301010" },
    { ticker: "WMT", companyName: "Walmart Inc.", sectorCode: "30", igCode: "3010", indCode: "301010" },
    { ticker: "KR", companyName: "The Kroger Co.", sectorCode: "30", igCode: "3010", indCode: "301010" },
    // Tobacco (302030)
    { ticker: "PM", companyName: "Philip Morris International Inc.", sectorCode: "30", igCode: "3020", indCode: "302030" },
    { ticker: "MO", companyName: "Altria Group, Inc.", sectorCode: "30", igCode: "3020", indCode: "302030" },
    // Personal Care Products (303020)
    { ticker: "EL", companyName: "The Estée Lauder Companies Inc.", sectorCode: "30", igCode: "3030", indCode: "303020" },
    { ticker: "COTY", companyName: "Coty Inc.", sectorCode: "30", igCode: "3030", indCode: "303020" },

    // ═══ Financials ══════════════════════════════════════════════════════════
    // Insurance (403010)
    { ticker: "ALL", companyName: "The Allstate Corporation", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "PGR", companyName: "The Progressive Corporation", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "TRV", companyName: "The Travelers Companies, Inc.", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "HIG", companyName: "The Hartford Financial Services Group", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "CB", companyName: "Chubb Limited", sectorCode: "40", igCode: "4030", indCode: "403010" },
    // Capital Markets (402030)
    { ticker: "GS", companyName: "The Goldman Sachs Group, Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "MS", companyName: "Morgan Stanley", sectorCode: "40", igCode: "4020", indCode: "402030" },
    // Diversified Banks (401010)
    { ticker: "JPM", companyName: "JPMorgan Chase & Co.", sectorCode: "40", igCode: "4010", indCode: "401010" },
    { ticker: "BAC", companyName: "Bank of America Corporation", sectorCode: "40", igCode: "4010", indCode: "401010" },
    // Regional Banks (401020)
    { ticker: "PNC", companyName: "The PNC Financial Services Group, Inc.", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "USB", companyName: "U.S. Bancorp", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "TFC", companyName: "Truist Financial Corporation", sectorCode: "40", igCode: "4010", indCode: "401020" },
    // Diversified Financial Services (402010)
    { ticker: "V", companyName: "Visa Inc.", sectorCode: "40", igCode: "4020", indCode: "402010" },
    { ticker: "MA", companyName: "Mastercard Incorporated", sectorCode: "40", igCode: "4020", indCode: "402010" },
    { ticker: "PYPL", companyName: "PayPal Holdings, Inc.", sectorCode: "40", igCode: "4020", indCode: "402010" },
    // Consumer Finance (402020)
    { ticker: "COF", companyName: "Capital One Financial Corporation", sectorCode: "40", igCode: "4020", indCode: "402020" },
    { ticker: "AXP", companyName: "American Express Company", sectorCode: "40", igCode: "4020", indCode: "402020" },
    { ticker: "DFS", companyName: "Discover Financial Services", sectorCode: "40", igCode: "4020", indCode: "402020" },
    // Mortgage REITs (402040)
    { ticker: "NLY", companyName: "Annaly Capital Management, Inc.", sectorCode: "40", igCode: "4020", indCode: "402040" },
    { ticker: "AGNC", companyName: "AGNC Investment Corp.", sectorCode: "40", igCode: "4020", indCode: "402040" },

    // ═══ Industrials ═════════════════════════════════════════════════════════
    // Machinery (201060)
    { ticker: "CAT", companyName: "Caterpillar Inc.", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "DE", companyName: "Deere & Company", sectorCode: "20", igCode: "2010", indCode: "201060" },
    // Aerospace & Defense (201010)
    { ticker: "RTX", companyName: "RTX Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "LMT", companyName: "Lockheed Martin Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    // Electrical Equipment (201040)
    { ticker: "ETN", companyName: "Eaton Corporation plc", sectorCode: "20", igCode: "2010", indCode: "201040" },
    { ticker: "EMR", companyName: "Emerson Electric Co.", sectorCode: "20", igCode: "2010", indCode: "201040" },
    { ticker: "ROK", companyName: "Rockwell Automation, Inc.", sectorCode: "20", igCode: "2010", indCode: "201040" },
    // Building Products (201020)
    { ticker: "CARR", companyName: "Carrier Global Corporation", sectorCode: "20", igCode: "2010", indCode: "201020" },
    { ticker: "JCI", companyName: "Johnson Controls International plc", sectorCode: "20", igCode: "2010", indCode: "201020" },
    { ticker: "MAS", companyName: "Masco Corporation", sectorCode: "20", igCode: "2010", indCode: "201020" },
    // Construction & Engineering (201030)
    { ticker: "PWR", companyName: "Quanta Services, Inc.", sectorCode: "20", igCode: "2010", indCode: "201030" },
    { ticker: "EME", companyName: "EMCOR Group, Inc.", sectorCode: "20", igCode: "2010", indCode: "201030" },
    // Industrial Conglomerates (201050)
    { ticker: "HON", companyName: "Honeywell International Inc.", sectorCode: "20", igCode: "2010", indCode: "201050" },
    { ticker: "MMM", companyName: "3M Company", sectorCode: "20", igCode: "2010", indCode: "201050" },
    // Trading Companies & Distributors (201070)
    { ticker: "FAST", companyName: "Fastenal Company", sectorCode: "20", igCode: "2010", indCode: "201070" },
    { ticker: "WCC", companyName: "WESCO International, Inc.", sectorCode: "20", igCode: "2010", indCode: "201070" },
    // Commercial Services & Supplies (202010)
    { ticker: "WM", companyName: "Waste Management, Inc.", sectorCode: "20", igCode: "2020", indCode: "202010" },
    { ticker: "RSG", companyName: "Republic Services, Inc.", sectorCode: "20", igCode: "2020", indCode: "202010" },
    { ticker: "CTAS", companyName: "Cintas Corporation", sectorCode: "20", igCode: "2020", indCode: "202010" },
    // Professional Services (202020)
    { ticker: "VRSK", companyName: "Verisk Analytics, Inc.", sectorCode: "20", igCode: "2020", indCode: "202020" },
    { ticker: "ADP", companyName: "Automatic Data Processing, Inc.", sectorCode: "20", igCode: "2020", indCode: "202020" },
    // Air Freight & Logistics (203010)
    { ticker: "UPS", companyName: "United Parcel Service, Inc.", sectorCode: "20", igCode: "2030", indCode: "203010" },
    { ticker: "FDX", companyName: "FedEx Corporation", sectorCode: "20", igCode: "2030", indCode: "203010" },
    // Passenger Airlines (203020)
    { ticker: "DAL", companyName: "Delta Air Lines, Inc.", sectorCode: "20", igCode: "2030", indCode: "203020" },
    { ticker: "UAL", companyName: "United Airlines Holdings, Inc.", sectorCode: "20", igCode: "2030", indCode: "203020" },
    { ticker: "LUV", companyName: "Southwest Airlines Co.", sectorCode: "20", igCode: "2030", indCode: "203020" },
    // Marine Transportation (203030)
    { ticker: "ZIM", companyName: "ZIM Integrated Shipping Services Ltd.", sectorCode: "20", igCode: "2030", indCode: "203030" },
    { ticker: "MATX", companyName: "Matson, Inc.", sectorCode: "20", igCode: "2030", indCode: "203030" },
    // Ground Transportation (203040)
    { ticker: "UNP", companyName: "Union Pacific Corporation", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "CSX", companyName: "CSX Corporation", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "JBHT", companyName: "J.B. Hunt Transport Services, Inc.", sectorCode: "20", igCode: "2030", indCode: "203040" },
    // Transportation Infrastructure (203050)
    { ticker: "GATX", companyName: "GATX Corporation", sectorCode: "20", igCode: "2030", indCode: "203050" },
    { ticker: "KEX", companyName: "Kirby Corporation", sectorCode: "20", igCode: "2030", indCode: "203050" },

    // ═══ Communication Services ══════════════════════════════════════════════
    // Interactive Media & Services (502030)
    { ticker: "META", companyName: "Meta Platforms, Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "GOOGL", companyName: "Alphabet Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "PINS", companyName: "Pinterest, Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "SNAP", companyName: "Snap Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    // Diversified Telecommunication Services (501010)
    { ticker: "T", companyName: "AT&T Inc.", sectorCode: "50", igCode: "5010", indCode: "501010" },
    { ticker: "VZ", companyName: "Verizon Communications Inc.", sectorCode: "50", igCode: "5010", indCode: "501010" },
    // Wireless Telecommunication Services (501020)
    { ticker: "TMUS", companyName: "T-Mobile US, Inc.", sectorCode: "50", igCode: "5010", indCode: "501020" },
    // Media (502010)
    { ticker: "CMCSA", companyName: "Comcast Corporation", sectorCode: "50", igCode: "5020", indCode: "502010" },
    { ticker: "FOXA", companyName: "Fox Corporation", sectorCode: "50", igCode: "5020", indCode: "502010" },
    { ticker: "NWSA", companyName: "News Corporation", sectorCode: "50", igCode: "5020", indCode: "502010" },
    // Entertainment (502020)
    { ticker: "DIS", companyName: "The Walt Disney Company", sectorCode: "50", igCode: "5020", indCode: "502020" },
    { ticker: "NFLX", companyName: "Netflix, Inc.", sectorCode: "50", igCode: "5020", indCode: "502020" },
    { ticker: "LYV", companyName: "Live Nation Entertainment, Inc.", sectorCode: "50", igCode: "5020", indCode: "502020" },

    // ═══ Energy ══════════════════════════════════════════════════════════════
    // Oil, Gas & Consumable Fuels (101010)
    { ticker: "XOM", companyName: "Exxon Mobil Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "CVX", companyName: "Chevron Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "COP", companyName: "ConocoPhillips", sectorCode: "10", igCode: "1010", indCode: "101010" },
    // Energy Equipment & Services (101020)
    { ticker: "SLB", companyName: "Schlumberger Limited", sectorCode: "10", igCode: "1010", indCode: "101020" },
    { ticker: "HAL", companyName: "Halliburton Company", sectorCode: "10", igCode: "1010", indCode: "101020" },

    // ═══ Materials ═══════════════════════════════════════════════════════════
    // Chemicals (151010)
    { ticker: "LIN", companyName: "Linde plc", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "APD", companyName: "Air Products and Chemicals, Inc.", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "DD", companyName: "DuPont de Nemours, Inc.", sectorCode: "15", igCode: "1510", indCode: "151010" },
    // Metals & Mining (151040)
    { ticker: "NEM", companyName: "Newmont Corporation", sectorCode: "15", igCode: "1510", indCode: "151040" },
    { ticker: "FCX", companyName: "Freeport-McMoRan Inc.", sectorCode: "15", igCode: "1510", indCode: "151040" },
    // Construction Materials (151020)
    { ticker: "VMC", companyName: "Vulcan Materials Company", sectorCode: "15", igCode: "1510", indCode: "151020" },
    { ticker: "MLM", companyName: "Martin Marietta Materials, Inc.", sectorCode: "15", igCode: "1510", indCode: "151020" },
    // Containers & Packaging (151030)
    { ticker: "BLL", companyName: "Ball Corporation", sectorCode: "15", igCode: "1510", indCode: "151030" },
    { ticker: "PKG", companyName: "Packaging Corporation of America", sectorCode: "15", igCode: "1510", indCode: "151030" },
    { ticker: "AMCR", companyName: "Amcor plc", sectorCode: "15", igCode: "1510", indCode: "151030" },
    // Paper & Forest Products (151050)
    { ticker: "IP", companyName: "International Paper Company", sectorCode: "15", igCode: "1510", indCode: "151050" },
    { ticker: "SLVM", companyName: "Sylvamo Corporation", sectorCode: "15", igCode: "1510", indCode: "151050" },

    // ═══ Consumer Discretionary ══════════════════════════════════════════════
    // Hotels, Restaurants & Leisure (253010)
    { ticker: "MCD", companyName: "McDonald's Corporation", sectorCode: "25", igCode: "2530", indCode: "253010" },
    { ticker: "SBUX", companyName: "Starbucks Corporation", sectorCode: "25", igCode: "2530", indCode: "253010" },
    // Broadline Retail (255030)
    { ticker: "AMZN", companyName: "Amazon.com, Inc.", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "TGT", companyName: "Target Corporation", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "DG", companyName: "Dollar General Corporation", sectorCode: "25", igCode: "2550", indCode: "255030" },
    // Automobiles (251020)
    { ticker: "TSLA", companyName: "Tesla, Inc.", sectorCode: "25", igCode: "2510", indCode: "251020" },
    { ticker: "GM", companyName: "General Motors Company", sectorCode: "25", igCode: "2510", indCode: "251020" },
    // Automobile Components (251010)
    { ticker: "APTV", companyName: "Aptiv PLC", sectorCode: "25", igCode: "2510", indCode: "251010" },
    { ticker: "BWA", companyName: "BorgWarner Inc.", sectorCode: "25", igCode: "2510", indCode: "251010" },
    { ticker: "LEA", companyName: "Lear Corporation", sectorCode: "25", igCode: "2510", indCode: "251010" },
    // Household Durables (252010)
    { ticker: "LEN", companyName: "Lennar Corporation", sectorCode: "25", igCode: "2520", indCode: "252010" },
    { ticker: "DHI", companyName: "D.R. Horton, Inc.", sectorCode: "25", igCode: "2520", indCode: "252010" },
    { ticker: "WHR", companyName: "Whirlpool Corporation", sectorCode: "25", igCode: "2520", indCode: "252010" },
    // Leisure Products (252020)
    { ticker: "HAS", companyName: "Hasbro, Inc.", sectorCode: "25", igCode: "2520", indCode: "252020" },
    { ticker: "MAT", companyName: "Mattel, Inc.", sectorCode: "25", igCode: "2520", indCode: "252020" },
    // Textiles, Apparel & Luxury Goods (252030)
    { ticker: "NKE", companyName: "NIKE, Inc.", sectorCode: "25", igCode: "2520", indCode: "252030" },
    { ticker: "LULU", companyName: "Lululemon Athletica Inc.", sectorCode: "25", igCode: "2520", indCode: "252030" },
    { ticker: "TPR", companyName: "Tapestry, Inc.", sectorCode: "25", igCode: "2520", indCode: "252030" },
    // Diversified Consumer Services (253020)
    { ticker: "HRB", companyName: "H&R Block, Inc.", sectorCode: "25", igCode: "2530", indCode: "253020" },
    { ticker: "SCI", companyName: "Service Corporation International", sectorCode: "25", igCode: "2530", indCode: "253020" },
    // Distributors (255010)
    { ticker: "POOL", companyName: "Pool Corporation", sectorCode: "25", igCode: "2550", indCode: "255010" },
    { ticker: "LKQ", companyName: "LKQ Corporation", sectorCode: "25", igCode: "2550", indCode: "255010" },
    // Internet & Direct Marketing Retail (255020)
    { ticker: "EBAY", companyName: "eBay Inc.", sectorCode: "25", igCode: "2550", indCode: "255020" },
    { ticker: "ETSY", companyName: "Etsy, Inc.", sectorCode: "25", igCode: "2550", indCode: "255020" },
    // Specialty Retail (255040)
    { ticker: "HD", companyName: "The Home Depot, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "LOW", companyName: "Lowe's Companies, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "ORLY", companyName: "O'Reilly Automotive, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },

    // ═══ Health Care ═════════════════════════════════════════════════════════
    // Pharmaceuticals (352020)
    { ticker: "JNJ", companyName: "Johnson & Johnson", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "LLY", companyName: "Eli Lilly and Company", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "PFE", companyName: "Pfizer Inc.", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "MRK", companyName: "Merck & Co., Inc.", sectorCode: "35", igCode: "3520", indCode: "352020" },
    // Health Care Equipment & Supplies (351010)
    { ticker: "ABT", companyName: "Abbott Laboratories", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "MDT", companyName: "Medtronic plc", sectorCode: "35", igCode: "3510", indCode: "351010" },
    // Health Care Providers & Services (351020)
    { ticker: "UNH", companyName: "UnitedHealth Group Incorporated", sectorCode: "35", igCode: "3510", indCode: "351020" },
    { ticker: "ELV", companyName: "Elevance Health, Inc.", sectorCode: "35", igCode: "3510", indCode: "351020" },
    { ticker: "HCA", companyName: "HCA Healthcare, Inc.", sectorCode: "35", igCode: "3510", indCode: "351020" },
    // Health Care Technology (351030)
    { ticker: "VEEV", companyName: "Veeva Systems Inc.", sectorCode: "35", igCode: "3510", indCode: "351030" },
    { ticker: "DOCS", companyName: "Doximity, Inc.", sectorCode: "35", igCode: "3510", indCode: "351030" },
    // Biotechnology (352010)
    { ticker: "AMGN", companyName: "Amgen Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },
    { ticker: "GILD", companyName: "Gilead Sciences, Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },
    { ticker: "VRTX", companyName: "Vertex Pharmaceuticals Incorporated", sectorCode: "35", igCode: "3520", indCode: "352010" },
    // Life Sciences Tools & Services (352030)
    { ticker: "TMO", companyName: "Thermo Fisher Scientific Inc.", sectorCode: "35", igCode: "3520", indCode: "352030" },
    { ticker: "DHR", companyName: "Danaher Corporation", sectorCode: "35", igCode: "3520", indCode: "352030" },
    { ticker: "A", companyName: "Agilent Technologies, Inc.", sectorCode: "35", igCode: "3520", indCode: "352030" },

    // ═══ Utilities ═══════════════════════════════════════════════════════════
    // Electric Utilities (551010)
    { ticker: "NEE", companyName: "NextEra Energy, Inc.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "DUK", companyName: "Duke Energy Corporation", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "SO", companyName: "The Southern Company", sectorCode: "55", igCode: "5510", indCode: "551010" },
    // Gas Utilities (551020)
    { ticker: "ATO", companyName: "Atmos Energy Corporation", sectorCode: "55", igCode: "5510", indCode: "551020" },
    { ticker: "SR", companyName: "Spire Inc.", sectorCode: "55", igCode: "5510", indCode: "551020" },
    // Multi-Utilities (551030)
    { ticker: "D", companyName: "Dominion Energy, Inc.", sectorCode: "55", igCode: "5510", indCode: "551030" },
    { ticker: "SRE", companyName: "Sempra", sectorCode: "55", igCode: "5510", indCode: "551030" },
    // Water Utilities (551040)
    { ticker: "AWK", companyName: "American Water Works Company, Inc.", sectorCode: "55", igCode: "5510", indCode: "551040" },
    { ticker: "WTRG", companyName: "Essential Utilities, Inc.", sectorCode: "55", igCode: "5510", indCode: "551040" },
    // Independent Power and Renewable Electricity Producers (551050)
    { ticker: "VST", companyName: "Vistra Corp.", sectorCode: "55", igCode: "5510", indCode: "551050" },
    { ticker: "AES", companyName: "The AES Corporation", sectorCode: "55", igCode: "5510", indCode: "551050" },

    // ═══ Real Estate ═════════════════════════════════════════════════════════
    // Specialized REITs (601080)
    { ticker: "AMT", companyName: "American Tower Corporation", sectorCode: "60", igCode: "6010", indCode: "601080" },
    { ticker: "EQIX", companyName: "Equinix, Inc.", sectorCode: "60", igCode: "6010", indCode: "601080" },
    // Industrial REITs (601025)
    { ticker: "PLD", companyName: "Prologis, Inc.", sectorCode: "60", igCode: "6010", indCode: "601025" },
    { ticker: "STAG", companyName: "STAG Industrial, Inc.", sectorCode: "60", igCode: "6010", indCode: "601025" },
    // Diversified REITs (601010)
    { ticker: "WPC", companyName: "W. P. Carey Inc.", sectorCode: "60", igCode: "6010", indCode: "601010" },
    // Hotel & Resort REITs (601030)
    { ticker: "HST", companyName: "Host Hotels & Resorts, Inc.", sectorCode: "60", igCode: "6010", indCode: "601030" },
    { ticker: "PK", companyName: "Park Hotels & Resorts Inc.", sectorCode: "60", igCode: "6010", indCode: "601030" },
    // Office REITs (601040)
    { ticker: "BXP", companyName: "BXP, Inc.", sectorCode: "60", igCode: "6010", indCode: "601040" },
    { ticker: "VNO", companyName: "Vornado Realty Trust", sectorCode: "60", igCode: "6010", indCode: "601040" },
    // Health Care REITs (601050)
    { ticker: "WELL", companyName: "Welltower Inc.", sectorCode: "60", igCode: "6010", indCode: "601050" },
    { ticker: "VTR", companyName: "Ventas, Inc.", sectorCode: "60", igCode: "6010", indCode: "601050" },
    { ticker: "OHI", companyName: "Omega Healthcare Investors, Inc.", sectorCode: "60", igCode: "6010", indCode: "601050" },
    // Residential REITs (601060)
    { ticker: "EQR", companyName: "Equity Residential", sectorCode: "60", igCode: "6010", indCode: "601060" },
    { ticker: "AVB", companyName: "AvalonBay Communities, Inc.", sectorCode: "60", igCode: "6010", indCode: "601060" },
    // Retail REITs (601070)
    { ticker: "SPG", companyName: "Simon Property Group, Inc.", sectorCode: "60", igCode: "6010", indCode: "601070" },
    { ticker: "O", companyName: "Realty Income Corporation", sectorCode: "60", igCode: "6010", indCode: "601070" },
    { ticker: "REG", companyName: "Regency Centers Corporation", sectorCode: "60", igCode: "6010", indCode: "601070" },
    // Real Estate Management & Development (602010)
    { ticker: "CBRE", companyName: "CBRE Group, Inc.", sectorCode: "60", igCode: "6020", indCode: "602010" },
    { ticker: "JLL", companyName: "Jones Lang LaSalle Incorporated", sectorCode: "60", igCode: "6020", indCode: "602010" },

    // ═══ Expansion: 120 stocks to bring key industries to 8-10+ ═════════════

    // Electric Utilities (551010) — +10
    { ticker: "AEP", companyName: "American Electric Power Company, Inc.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "XEL", companyName: "Xcel Energy Inc.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "EXC", companyName: "Exelon Corporation", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "ED", companyName: "Consolidated Edison, Inc.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "WEC", companyName: "WEC Energy Group, Inc.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "ES", companyName: "Eversource Energy", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "PPL", companyName: "PPL Corporation", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "FE", companyName: "FirstEnergy Corp.", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "ETR", companyName: "Entergy Corporation", sectorCode: "55", igCode: "5510", indCode: "551010" },
    { ticker: "PEG", companyName: "Public Service Enterprise Group Incorporated", sectorCode: "55", igCode: "5510", indCode: "551010" },

    // Diversified Banks (401010) — +2
    { ticker: "WFC", companyName: "Wells Fargo & Company", sectorCode: "40", igCode: "4010", indCode: "401010" },
    { ticker: "C", companyName: "Citigroup Inc.", sectorCode: "40", igCode: "4010", indCode: "401010" },

    // Capital Markets (402030) — +6
    { ticker: "SCHW", companyName: "The Charles Schwab Corporation", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "BLK", companyName: "BlackRock, Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "ICE", companyName: "Intercontinental Exchange, Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "CME", companyName: "CME Group Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "SPGI", companyName: "S&P Global Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "MCO", companyName: "Moody's Corporation", sectorCode: "40", igCode: "4020", indCode: "402030" },

    // Regional Banks (401020) — +7
    { ticker: "FITB", companyName: "Fifth Third Bancorp", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "HBAN", companyName: "Huntington Bancshares Incorporated", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "MTB", companyName: "M&T Bank Corporation", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "CFG", companyName: "Citizens Financial Group, Inc.", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "KEY", companyName: "KeyCorp", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "RF", companyName: "Regions Financial Corporation", sectorCode: "40", igCode: "4010", indCode: "401020" },
    { ticker: "ZION", companyName: "Zions Bancorporation, N.A.", sectorCode: "40", igCode: "4010", indCode: "401020" },

    // Software (451030) — +5
    { ticker: "INTU", companyName: "Intuit Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "PLTR", companyName: "Palantir Technologies Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "PANW", companyName: "Palo Alto Networks, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "SNPS", companyName: "Synopsys, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "CDNS", companyName: "Cadence Design Systems, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },

    // Semiconductors (453010) — +4
    { ticker: "TXN", companyName: "Texas Instruments Incorporated", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "MRVL", companyName: "Marvell Technology, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "KLAC", companyName: "KLA Corporation", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "AMAT", companyName: "Applied Materials, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },

    // Pharmaceuticals (352020) — +5
    { ticker: "ABBV", companyName: "AbbVie Inc.", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "BMY", companyName: "Bristol-Myers Squibb Company", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "ZTS", companyName: "Zoetis Inc.", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "NVO", companyName: "Novo Nordisk A/S", sectorCode: "35", igCode: "3520", indCode: "352020" },
    { ticker: "AZN", companyName: "AstraZeneca PLC", sectorCode: "35", igCode: "3520", indCode: "352020" },

    // Specialty Retail (255040) — +7
    { ticker: "TJX", companyName: "The TJX Companies, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "ROST", companyName: "Ross Stores, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "AZO", companyName: "AutoZone, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "AAP", companyName: "Advance Auto Parts, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "ULTA", companyName: "Ulta Beauty, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "BBY", companyName: "Best Buy Co., Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },
    { ticker: "FIVE", companyName: "Five Below, Inc.", sectorCode: "25", igCode: "2550", indCode: "255040" },

    // Oil, Gas & Consumable Fuels (101010) — +6
    { ticker: "EOG", companyName: "EOG Resources, Inc.", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "DVN", companyName: "Devon Energy Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "PSX", companyName: "Phillips 66", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "VLO", companyName: "Valero Energy Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "MPC", companyName: "Marathon Petroleum Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },
    { ticker: "OXY", companyName: "Occidental Petroleum Corporation", sectorCode: "10", igCode: "1010", indCode: "101010" },

    // Aerospace & Defense (201010) — +6
    { ticker: "GD", companyName: "General Dynamics Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "NOC", companyName: "Northrop Grumman Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "BA", companyName: "The Boeing Company", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "HII", companyName: "Huntington Ingalls Industries, Inc.", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "TDG", companyName: "TransDigm Group Incorporated", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "HWM", companyName: "Howmet Aerospace Inc.", sectorCode: "20", igCode: "2010", indCode: "201010" },

    // Machinery (201060) — +6
    { ticker: "ITW", companyName: "Illinois Tool Works Inc.", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "PH", companyName: "Parker-Hannifin Corporation", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "DOV", companyName: "Dover Corporation", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "CMI", companyName: "Cummins Inc.", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "SWK", companyName: "Stanley Black & Decker, Inc.", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "OTIS", companyName: "Otis Worldwide Corporation", sectorCode: "20", igCode: "2010", indCode: "201060" },

    // Health Care Equipment & Supplies (351010) — +6
    { ticker: "SYK", companyName: "Stryker Corporation", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "BSX", companyName: "Boston Scientific Corporation", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "ISRG", companyName: "Intuitive Surgical, Inc.", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "EW", companyName: "Edwards Lifesciences Corporation", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "BAX", companyName: "Baxter International Inc.", sectorCode: "35", igCode: "3510", indCode: "351010" },
    { ticker: "ZBH", companyName: "Zimmer Biomet Holdings, Inc.", sectorCode: "35", igCode: "3510", indCode: "351010" },

    // Biotechnology (352010) — +4
    { ticker: "REGN", companyName: "Regeneron Pharmaceuticals, Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },
    { ticker: "MRNA", companyName: "Moderna, Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },
    { ticker: "BIIB", companyName: "Biogen Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },
    { ticker: "ALNY", companyName: "Alnylam Pharmaceuticals, Inc.", sectorCode: "35", igCode: "3520", indCode: "352010" },

    // IT Services (451020) — +6
    { ticker: "FI", companyName: "Fiserv, Inc.", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "FIS", companyName: "Fidelity National Information Services, Inc.", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "GPN", companyName: "Global Payments Inc.", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "EPAM", companyName: "EPAM Systems, Inc.", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "GDDY", companyName: "GoDaddy Inc.", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "DXC", companyName: "DXC Technology Company", sectorCode: "45", igCode: "4510", indCode: "451020" },

    // Broadline Retail (255030) — +5
    { ticker: "DLTR", companyName: "Dollar Tree, Inc.", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "BJ", companyName: "BJ's Wholesale Club Holdings, Inc.", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "M", companyName: "Macy's, Inc.", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "KSS", companyName: "Kohl's Corporation", sectorCode: "25", igCode: "2550", indCode: "255030" },
    { ticker: "JWN", companyName: "Nordstrom, Inc.", sectorCode: "25", igCode: "2550", indCode: "255030" },

    // Consumer Staples Distribution & Retail (301010) — +3
    { ticker: "CASY", companyName: "Casey's General Stores, Inc.", sectorCode: "30", igCode: "3010", indCode: "301010" },
    { ticker: "GO", companyName: "Grocery Outlet Holding Corp.", sectorCode: "30", igCode: "3010", indCode: "301010" },
    { ticker: "SFM", companyName: "Sprouts Farmers Market, Inc.", sectorCode: "30", igCode: "3010", indCode: "301010" },

    // Chemicals (151010) — +6
    { ticker: "SHW", companyName: "The Sherwin-Williams Company", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "ECL", companyName: "Ecolab Inc.", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "PPG", companyName: "PPG Industries, Inc.", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "CE", companyName: "Celanese Corporation", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "EMN", companyName: "Eastman Chemical Company", sectorCode: "15", igCode: "1510", indCode: "151010" },
    { ticker: "DOW", companyName: "Dow Inc.", sectorCode: "15", igCode: "1510", indCode: "151010" },

    // Ground Transportation (203040) — +5
    { ticker: "NSC", companyName: "Norfolk Southern Corporation", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "ODFL", companyName: "Old Dominion Freight Line, Inc.", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "UBER", companyName: "Uber Technologies, Inc.", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "LYFT", companyName: "Lyft, Inc.", sectorCode: "20", igCode: "2030", indCode: "203040" },
    { ticker: "XPO", companyName: "XPO, Inc.", sectorCode: "20", igCode: "2030", indCode: "203040" },

    // Household Products (303010) — +3
    { ticker: "KMB", companyName: "Kimberly-Clark Corporation", sectorCode: "30", igCode: "3030", indCode: "303010" },
    { ticker: "CHD", companyName: "Church & Dwight Co., Inc.", sectorCode: "30", igCode: "3030", indCode: "303010" },
    { ticker: "CLX", companyName: "The Clorox Company", sectorCode: "30", igCode: "3030", indCode: "303010" },

    // Food Products (302020) — +7
    { ticker: "HSY", companyName: "The Hershey Company", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "SJM", companyName: "The J.M. Smucker Company", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "CAG", companyName: "Conagra Brands, Inc.", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "MDLZ", companyName: "Mondelez International, Inc.", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "KHC", companyName: "The Kraft Heinz Company", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "MKC", companyName: "McCormick & Company, Incorporated", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "HRL", companyName: "Hormel Foods Corporation", sectorCode: "30", igCode: "3020", indCode: "302020" },

    // Insurance (403010) — +5
    { ticker: "AIG", companyName: "American International Group, Inc.", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "MET", companyName: "MetLife, Inc.", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "PRU", companyName: "Prudential Financial, Inc.", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "AFL", companyName: "Aflac Incorporated", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "CINF", companyName: "Cincinnati Financial Corporation", sectorCode: "40", igCode: "4030", indCode: "403010" },
  ];

  console.log("Seeding benchmark stock classifications...");
  for (const s of benchmarkStocks) {
    await db
      .insert(stockClassifications)
      .values({
        ticker: s.ticker,
        companyName: s.companyName,
        sectorId: `sector-${s.sectorCode}`,
        industryGroupId: `ig-${s.igCode}`,
        industryId: `ind-${s.indCode}`,
        source: "curated_override",
      })
      .onConflictDoUpdate({
        target: stockClassifications.ticker,
        set: {
          companyName: s.companyName,
          sectorId: `sector-${s.sectorCode}`,
          industryGroupId: `ig-${s.igCode}`,
          industryId: `ind-${s.indCode}`,
        },
      });
  }
  console.log(`  ✓ ${benchmarkStocks.length} stock classifications`);

  console.log("\nDone! GICS taxonomy seeded.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
