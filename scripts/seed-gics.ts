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
    // Technology — Semiconductors
    { ticker: "MU", companyName: "Micron Technology, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "NVDA", companyName: "NVIDIA Corporation", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "AMD", companyName: "Advanced Micro Devices, Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "INTC", companyName: "Intel Corporation", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "AVGO", companyName: "Broadcom Inc.", sectorCode: "45", igCode: "4530", indCode: "453010" },
    { ticker: "QCOM", companyName: "Qualcomm Incorporated", sectorCode: "45", igCode: "4530", indCode: "453010" },
    // Technology — Software
    { ticker: "MSFT", companyName: "Microsoft Corporation", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "ORCL", companyName: "Oracle Corporation", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "CRM", companyName: "Salesforce, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "ADBE", companyName: "Adobe Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    { ticker: "NOW", companyName: "ServiceNow, Inc.", sectorCode: "45", igCode: "4510", indCode: "451030" },
    // Technology — Hardware
    { ticker: "AAPL", companyName: "Apple Inc.", sectorCode: "45", igCode: "4520", indCode: "452020" },
    // Technology — IT Services
    { ticker: "ACN", companyName: "Accenture plc", sectorCode: "45", igCode: "4510", indCode: "451020" },
    { ticker: "IBM", companyName: "International Business Machines Corporation", sectorCode: "45", igCode: "4510", indCode: "451020" },

    // Consumer Staples — Beverages
    { ticker: "KO", companyName: "The Coca-Cola Company", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "PEP", companyName: "PepsiCo, Inc.", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "KDP", companyName: "Keurig Dr Pepper Inc.", sectorCode: "30", igCode: "3020", indCode: "302010" },
    { ticker: "MNST", companyName: "Monster Beverage Corporation", sectorCode: "30", igCode: "3020", indCode: "302010" },
    // Consumer Staples — Food Products
    { ticker: "GIS", companyName: "General Mills, Inc.", sectorCode: "30", igCode: "3020", indCode: "302020" },
    { ticker: "K", companyName: "Kellanova", sectorCode: "30", igCode: "3020", indCode: "302020" },
    // Consumer Staples — Household Products
    { ticker: "PG", companyName: "The Procter & Gamble Company", sectorCode: "30", igCode: "3030", indCode: "303010" },
    { ticker: "CL", companyName: "Colgate-Palmolive Company", sectorCode: "30", igCode: "3030", indCode: "303010" },

    // Financials — Insurance
    { ticker: "ALL", companyName: "The Allstate Corporation", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "PGR", companyName: "The Progressive Corporation", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "TRV", companyName: "The Travelers Companies, Inc.", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "HIG", companyName: "The Hartford Financial Services Group", sectorCode: "40", igCode: "4030", indCode: "403010" },
    { ticker: "CB", companyName: "Chubb Limited", sectorCode: "40", igCode: "4030", indCode: "403010" },
    // Financials — Capital Markets
    { ticker: "GS", companyName: "The Goldman Sachs Group, Inc.", sectorCode: "40", igCode: "4020", indCode: "402030" },
    { ticker: "MS", companyName: "Morgan Stanley", sectorCode: "40", igCode: "4020", indCode: "402030" },
    // Financials — Banks
    { ticker: "JPM", companyName: "JPMorgan Chase & Co.", sectorCode: "40", igCode: "4010", indCode: "401010" },
    { ticker: "BAC", companyName: "Bank of America Corporation", sectorCode: "40", igCode: "4010", indCode: "401010" },

    // Industrials — Machinery
    { ticker: "CAT", companyName: "Caterpillar Inc.", sectorCode: "20", igCode: "2010", indCode: "201060" },
    { ticker: "DE", companyName: "Deere & Company", sectorCode: "20", igCode: "2010", indCode: "201060" },
    // Industrials — Aerospace & Defense
    { ticker: "RTX", companyName: "RTX Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    { ticker: "LMT", companyName: "Lockheed Martin Corporation", sectorCode: "20", igCode: "2010", indCode: "201010" },
    // Industrials — Electrical Equipment
    { ticker: "ETN", companyName: "Eaton Corporation plc", sectorCode: "20", igCode: "2010", indCode: "201040" },

    // Communication Services — Interactive Media
    { ticker: "META", companyName: "Meta Platforms, Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "GOOGL", companyName: "Alphabet Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "PINS", companyName: "Pinterest, Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
    { ticker: "SNAP", companyName: "Snap Inc.", sectorCode: "50", igCode: "5020", indCode: "502030" },
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
