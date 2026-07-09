/**
 * Builds a GrowthHistoryPayload from ESEF filings (filings.xbrl.org) for
 * European-listed companies with no usable SEC data. Each annual report
 * carries 2-3 years of comparatives; stacking the available filings yields
 * ~5-7 years of history (the mandate started in 2020). Values stay in the
 * filing currency, matching the app-wide convention — and since native EU
 * listings also QUOTE in that currency, the sticker price works for them.
 */

import { resolveEsefEntity, fetchEsefFacts, type EsefFacts } from "./client";
import type { GrowthHistoryPayload } from "../sec-edgar/growth-history";
import {
  buildGrowthSummary,
  detectSplitFactors,
  type GrowthYearRow,
} from "../sec-edgar/growth-math";

const FALLBACK_TAX_RATE = 0.21;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// ifrs-full concept candidates per series, in priority order
const CONCEPTS: Record<string, string[]> = {
  revenue: [
    "ifrs-full:Revenue",
    "ifrs-full:RevenueFromContractsWithCustomers",
    "ifrs-full:RevenueFromSaleOfGoods",
  ],
  operatingIncome: ["ifrs-full:ProfitLossFromOperatingActivities"],
  netIncome: ["ifrs-full:ProfitLoss", "ifrs-full:ProfitLossAttributableToOwnersOfParent"],
  epsDiluted: ["ifrs-full:DilutedEarningsLossPerShare"],
  ocf: ["ifrs-full:CashFlowsFromUsedInOperatingActivities"],
  capex: [
    "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    "ifrs-full:PurchaseOfPropertyPlantAndEquipment",
  ],
  taxExpense: ["ifrs-full:IncomeTaxExpenseContinuingOperations"],
  pretaxIncome: ["ifrs-full:ProfitLossBeforeTax"],
  dilutedShares: ["ifrs-full:AdjustedWeightedAverageShares", "ifrs-full:WeightedAverageShares"],
  // instants
  equity: ["ifrs-full:Equity", "ifrs-full:EquityAttributableToOwnersOfParent"],
  cash: ["ifrs-full:CashAndCashEquivalents"],
  currentDebt: [
    "ifrs-full:ShorttermBorrowings",
    "ifrs-full:CurrentPortionOfLongtermBorrowings",
  ],
  longTermDebt: [
    "ifrs-full:LongtermBorrowings",
    "ifrs-full:NoncurrentPortionOfNoncurrentBorrowings",
  ],
};
const INSTANT_SERIES = new Set(["equity", "cash", "currentDebt", "longTermDebt"]);

const CORE_DIMENSIONS = new Set(["concept", "entity", "period", "unit", "language"]);

interface ParsedFact {
  series: string;
  conceptRank: number;
  fiscalYear: number;
  value: number;
  currency: string | null;
}

/** Fiscal year label: calendar year the period ends in (ends are exclusive
 *  in xBRL-JSON — "2025-01-01T00:00:00" means through end of 2024) */
function fiscalYearOfEnd(endIso: string): number {
  const t = new Date(endIso).getTime() - DAY_MS;
  return new Date(t).getUTCFullYear();
}

function parseFacts(facts: EsefFacts): ParsedFact[] {
  const conceptToSeries = new Map<string, { series: string; rank: number }>();
  for (const [series, concepts] of Object.entries(CONCEPTS)) {
    concepts.forEach((c, i) => conceptToSeries.set(c, { series, rank: i }));
  }

  const out: ParsedFact[] = [];
  for (const fact of Object.values(facts.facts ?? {})) {
    const dims = fact.dimensions ?? {};
    const concept = dims.concept;
    if (!concept) continue;
    const mapped = conceptToSeries.get(concept);
    if (!mapped) continue;
    // Consolidated, undimensioned facts only (no segment/member breakdowns)
    if (Object.keys(dims).some((k) => !CORE_DIMENSIONS.has(k))) continue;
    const period = dims.period;
    if (!period) continue;
    const value = typeof fact.value === "number" ? fact.value : parseFloat(String(fact.value));
    if (!isFinite(value)) continue;

    const isInstant = !period.includes("/");
    if (INSTANT_SERIES.has(mapped.series) !== isInstant) continue;

    let fiscalYear: number;
    if (isInstant) {
      fiscalYear = fiscalYearOfEnd(period);
    } else {
      const [start, end] = period.split("/");
      const duration = new Date(end).getTime() - new Date(start).getTime();
      if (duration < 330 * DAY_MS || duration > 400 * DAY_MS) continue;
      fiscalYear = fiscalYearOfEnd(end);
    }

    const unit = dims.unit ?? null;
    const currencyMatch = unit?.match(/iso4217:([A-Z]{3})/);
    out.push({
      series: mapped.series,
      conceptRank: mapped.rank,
      fiscalYear,
      value,
      currency: currencyMatch ? currencyMatch[1] : null,
    });
  }
  return out;
}

export async function buildEsefGrowthHistory(
  ticker: string,
  companyName: string
): Promise<GrowthHistoryPayload | null> {
  const resolved = await resolveEsefEntity(companyName);
  if (!resolved) return null;

  // Earliest filings first: as-originally-filed values win per (series, year),
  // matching the SEC convention; the split detector normalizes the rest
  const maps = new Map<string, Map<number, { value: number; rank: number }>>();
  const currencyVotes: Record<string, number> = {};
  let latestPeriodEnd = "";

  for (const filing of resolved.filings) {
    let facts: EsefFacts;
    try {
      facts = await fetchEsefFacts(filing.jsonUrl!);
    } catch {
      continue;
    }
    if (filing.periodEnd > latestPeriodEnd) latestPeriodEnd = filing.periodEnd;
    for (const f of parseFacts(facts)) {
      let m = maps.get(f.series);
      if (!m) {
        m = new Map();
        maps.set(f.series, m);
      }
      const existing = m.get(f.fiscalYear);
      // set-if-absent per year (earliest filing wins); within a filing,
      // prefer higher-priority concepts
      if (!existing || f.conceptRank < existing.rank) {
        if (!existing) m.set(f.fiscalYear, { value: f.value, rank: f.conceptRank });
        else if (f.conceptRank < existing.rank) m.set(f.fiscalYear, { value: f.value, rank: f.conceptRank });
      }
      if (f.currency) currencyVotes[f.currency] = (currencyVotes[f.currency] ?? 0) + 1;
    }
  }

  const get = (series: string, fy: number): number | null =>
    maps.get(series)?.get(fy)?.value ?? null;
  const yearsOf = (series: string): number[] => Array.from(maps.get(series)?.keys() ?? []);

  const allYears = Array.from(new Set([...yearsOf("revenue"), ...yearsOf("equity")])).sort(
    (a, b) => a - b
  );
  if (allYears.filter((y) => get("revenue", y) !== null).length < 2) return null;

  // Split adjustment from the filings themselves (net income ÷ EPS implies
  // share counts where they're missing) — same approach as the SEC path
  const epsMap = new Map<number, number>();
  const sharesMap = new Map<number, number>();
  for (const fy of allYears) {
    const e = get("epsDiluted", fy);
    if (e !== null) epsMap.set(fy, e);
    const sh = get("dilutedShares", fy);
    if (sh !== null) sharesMap.set(fy, sh);
    else {
      const ni = get("netIncome", fy);
      if (ni !== null && e !== null && e !== 0) sharesMap.set(fy, Math.abs(ni / e));
    }
  }
  const splitFactors = detectSplitFactors(allYears, sharesMap, epsMap);

  const years: GrowthYearRow[] = allYears.map((fy) => {
    const splitFactor = splitFactors.get(fy) ?? 1;
    const ocfVal = get("ocf", fy);
    const capexVal = get("capex", fy);
    const fcf = ocfVal === null ? null : ocfVal - Math.abs(capexVal ?? 0);

    const equityVal = get("equity", fy);
    const cd = get("currentDebt", fy);
    const ltd = get("longTermDebt", fy);
    const totalDebt = cd !== null || ltd !== null ? (cd ?? 0) + (ltd ?? 0) : null;
    const totalCash = get("cash", fy);

    const tax = get("taxExpense", fy);
    const pretax = get("pretaxIncome", fy);
    let taxRate = FALLBACK_TAX_RATE;
    if (tax !== null && pretax !== null && pretax > 0) {
      taxRate = Math.min(Math.max(tax / pretax, 0), 0.5);
    }
    const oi = get("operatingIncome", fy);
    let roic: number | null = null;
    if (oi !== null && equityVal !== null) {
      const investedCapital = equityVal + (totalDebt ?? 0);
      if (investedCapital > 0) roic = (oi * (1 - taxRate)) / investedCapital;
    }

    const epsRaw = get("epsDiluted", fy);
    const sharesRaw = get("dilutedShares", fy);
    return {
      fiscalYear: fy,
      revenue: get("revenue", fy),
      epsDiluted: epsRaw === null ? null : epsRaw / splitFactor,
      equity: equityVal,
      ocf: ocfVal,
      capex: capexVal === null ? null : Math.abs(capexVal),
      fcf,
      operatingIncome: oi,
      totalDebt,
      totalCash,
      dilutedShares: sharesRaw === null ? null : sharesRaw * splitFactor,
      roic,
    };
  });

  const endMonth = latestPeriodEnd
    ? new Date(new Date(latestPeriodEnd).getTime()).getUTCMonth() + 1
    : null;

  return {
    ticker: ticker.toUpperCase(),
    companyName: resolved.entity.name,
    cik: null,
    fiscalYearEndMonth: endMonth ? (MONTHS[endMonth] ?? null) : null,
    currency:
      Object.entries(currencyVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    available: true,
    unavailableReason: null,
    years,
    summary: buildGrowthSummary(years),
  };
}
