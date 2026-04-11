/**
 * Canonical Facts builder.
 *
 * Combines SEC EDGAR XBRL data with deterministic market data to produce
 * the single source of truth for all valuation stages.
 */

import {
  resolveTickerToCIK,
  getSubmissions,
  getCompanyFacts,
  findLatestFilings,
} from "../sec-edgar/client";
import { extractAllXbrl, getLatestInstantValue } from "../sec-edgar/xbrl-mapper";
import { computeTTM, buildAnnualHistory } from "../sec-edgar/ttm";
import { fetchMarketData, fetchBeta } from "../market-data/client";
import { type CanonicalFacts, type ProvenancedValue, pv } from "./types";

// Fiscal year end month codes from SEC (e.g., "0831" → August)
function parseFiscalYearEnd(code: string): string {
  const monthNum = parseInt(code.slice(0, 2), 10);
  const months = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return months[monthNum] || code;
}

function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function toBillions(val: number | null): number | null {
  if (val === null) return null;
  return val / 1e9;
}

function nullPv(unit: string, period: string, note: string): ProvenancedValue {
  return pv(null, unit, period, "", "SEC_XBRL", "", note);
}

export async function buildCanonicalFacts(ticker: string): Promise<CanonicalFacts> {
  const upperTicker = ticker.toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const dataQualityNotes: string[] = [];

  // Step 1: Resolve CIK and fetch EDGAR data
  const cik = await resolveTickerToCIK(upperTicker);
  const [submissions, companyFacts, marketData, beta] = await Promise.all([
    getSubmissions(cik),
    getCompanyFacts(cik),
    fetchMarketData(upperTicker),
    fetchBeta(upperTicker),
  ]);

  const companyName = submissions.name || companyFacts.entityName || upperTicker;
  const fiscalYearEnd = parseFiscalYearEnd(submissions.fiscalYearEnd);

  if (fiscalYearEnd !== "December") {
    dataQualityNotes.push(`Non-calendar fiscal year: ends in ${fiscalYearEnd}`);
  }

  // Step 2: Find latest filings
  const latest10K = findLatestFilings(submissions, "10-K", 1)[0] ?? null;
  const latest10Q = findLatestFilings(submissions, "10-Q", 1)[0] ?? null;

  // Step 3: Extract XBRL data
  const xbrl = extractAllXbrl(companyFacts);

  // Step 4: Build TTM values
  const ttmRevenue = xbrl.revenueUnits ? computeTTM(xbrl.revenueUnits) : null;
  const ttmGrossProfit = xbrl.grossProfitUnits ? computeTTM(xbrl.grossProfitUnits) : null;
  const ttmOpIncome = xbrl.operatingIncomeUnits ? computeTTM(xbrl.operatingIncomeUnits) : null;
  const ttmNetIncome = xbrl.netIncomeUnits ? computeTTM(xbrl.netIncomeUnits) : null;
  const ttmEpsDiluted = xbrl.epsDilutedUnits ? computeTTM(xbrl.epsDilutedUnits) : null;
  const ttmOcf = xbrl.ocfUnits ? computeTTM(xbrl.ocfUnits) : null;
  const ttmCapex = xbrl.capexUnits ? computeTTM(xbrl.capexUnits) : null;
  const ttmDa = xbrl.daUnits ? computeTTM(xbrl.daUnits) : null;
  const ttmSbc = xbrl.sbcUnits ? computeTTM(xbrl.sbcUnits) : null;
  const ttmDivPaid = xbrl.dividendsPaidUnits ? computeTTM(xbrl.dividendsPaidUnits) : null;
  const ttmBuyback = xbrl.buybackUnits ? computeTTM(xbrl.buybackUnits) : null;
  const ttmDilShares = xbrl.dilutedSharesUnits ? computeTTM(xbrl.dilutedSharesUnits) : null;

  // FCF = OCF - CapEx (capex is usually reported as positive in "payments" tags)
  const ttmFcfValue = (ttmOcf?.value != null && ttmCapex?.value != null)
    ? ttmOcf.value - Math.abs(ttmCapex.value)
    : null;

  const quartersUsed = ttmRevenue?.quartersLabel ?? "unknown";

  // Step 5: Balance sheet (latest instant values)
  const bsCash = xbrl.cashUnits ? getLatestInstantValue(xbrl.cashUnits) : null;
  const bsStInv = xbrl.shortTermInvestmentsUnits ? getLatestInstantValue(xbrl.shortTermInvestmentsUnits) : null;
  const bsLtInv = xbrl.ltInvestmentsUnits ? getLatestInstantValue(xbrl.ltInvestmentsUnits) : null;
  const bsCurrDebt = xbrl.currentDebtUnits ? getLatestInstantValue(xbrl.currentDebtUnits) : null;
  const bsLtDebt = xbrl.longTermDebtUnits ? getLatestInstantValue(xbrl.longTermDebtUnits) : null;
  const bsEquity = xbrl.totalEquityUnits ? getLatestInstantValue(xbrl.totalEquityUnits) : null;
  const bsGoodwill = xbrl.goodwillUnits ? getLatestInstantValue(xbrl.goodwillUnits) : null;
  const bsInventory = xbrl.inventoryUnits ? getLatestInstantValue(xbrl.inventoryUnits) : null;
  const bsReceivables = xbrl.receivablesUnits ? getLatestInstantValue(xbrl.receivablesUnits) : null;
  const bsShares = xbrl.sharesOutstandingUnits ? getLatestInstantValue(xbrl.sharesOutstandingUnits) : null;

  // Totals
  const totalCash = (bsCash?.value ?? 0) + (bsStInv?.value ?? 0) + (bsLtInv?.value ?? 0);
  const totalDebt = (bsCurrDebt?.value ?? 0) + (bsLtDebt?.value ?? 0);
  const bsDate = bsCash?.date ?? bsEquity?.date ?? today;

  // Step 6: Market-derived metrics
  const price = marketData.price;
  // Prefer SEC XBRL shares outstanding (more accurate), fall back to Yahoo
  const shares = bsShares?.value ?? marketData.sharesOutstanding;
  const mktCap = price * shares;
  const ev = mktCap + totalDebt - totalCash;

  // Use Yahoo shares if XBRL shares are missing
  if (!bsShares) {
    dataQualityNotes.push("Shares outstanding from market data (Yahoo Finance), not SEC filing");
  }

  // Step 7: Derived valuation ratios
  const trailingPE = safeDiv(price, ttmEpsDiluted?.value ?? null);
  const bvps = safeDiv(bsEquity?.value ?? null, shares || null);
  const ptb = safeDiv(price, bvps);
  const evRev = safeDiv(ev, ttmRevenue?.value ?? null);

  // Step 8: Latest quarter metrics
  const latestQ = ttmRevenue?.quarters?.[3]; // Most recent quarter
  const lqRevenue = latestQ?.value ?? null;
  const lqGrossProfit = ttmGrossProfit?.quarters?.[3]?.value ?? null;
  const lqOpIncome = ttmOpIncome?.quarters?.[3]?.value ?? null;
  const lqNetIncome = ttmNetIncome?.quarters?.[3]?.value ?? null;

  // Step 9: Historical context
  const revHistory = xbrl.revenueUnits ? buildAnnualHistory(xbrl.revenueUnits) : [];
  const gpHistory = xbrl.grossProfitUnits ? buildAnnualHistory(xbrl.grossProfitUnits) : [];
  const opHistory = xbrl.operatingIncomeUnits ? buildAnnualHistory(xbrl.operatingIncomeUnits) : [];

  const annualHistory = revHistory.map((r) => {
    const gp = gpHistory.find((g) => g.fiscalYear === r.fiscalYear)?.value;
    const op = opHistory.find((o) => o.fiscalYear === r.fiscalYear)?.value;
    return {
      year: r.fiscalYear,
      revenue: r.value,
      grossMargin: gp != null && r.value ? gp / r.value : null,
      operatingMargin: op != null && r.value ? op / r.value : null,
    };
  });

  const last5GrossMargins = annualHistory.map((a) => a.grossMargin).filter((v): v is number => v !== null);
  const last5OpMargins = annualHistory.map((a) => a.operatingMargin).filter((v): v is number => v !== null);
  const avg5YGross = last5GrossMargins.length > 0 ? last5GrossMargins.reduce((a, b) => a + b, 0) / last5GrossMargins.length : null;
  const avg5YOp = last5OpMargins.length > 0 ? last5OpMargins.reduce((a, b) => a + b, 0) / last5OpMargins.length : null;

  // Step 10: Assemble
  const src = (tag: string) => `CIK${cik} us-gaap:${tag}`;
  const mktSrc = "Yahoo Finance";

  return {
    ticker: upperTicker,
    companyName,
    cik,
    sector: submissions.sicDescription || "Unknown",
    industry: submissions.sicDescription || "Unknown",
    fiscalYearEnd,

    latestAnnualFiling: latest10K ? { accession: latest10K.accessionNumber, periodEnd: latest10K.reportDate, filedDate: latest10K.filingDate } : null,
    latestQuarterlyFiling: latest10Q ? { accession: latest10Q.accessionNumber, periodEnd: latest10Q.reportDate, filedDate: latest10Q.filingDate } : null,

    currentPrice: pv(price, "USD", "point-in-time", marketData.priceTimestamp, "MARKET_DATA", mktSrc, "real-time quote"),
    sharesOutstanding: pv(shares, "shares", "point-in-time", bsDate, bsShares ? "SEC_XBRL" : "MARKET_DATA", bsShares ? src(xbrl.matchedTags["sharesOutstanding"] ?? "") : mktSrc, "latest filing"),
    marketCap: pv(mktCap, "USD", "point-in-time", today, "COMPUTED", "price * shares", "multiplication"),
    enterpriseValue: pv(ev, "USD", "point-in-time", today, "COMPUTED", "marketCap + totalDebt - totalCash", "formula"),
    beta: pv(beta, "ratio", "trailing", today, "MARKET_DATA", mktSrc, "Yahoo Finance beta"),

    ttmRevenue: pv(ttmRevenue?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["revenue"] ?? ""), `sum_last_4_quarters: ${quartersUsed}`),
    ttmGrossProfit: pv(ttmGrossProfit?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["grossProfit"] ?? ""), `sum_last_4_quarters`),
    ttmOperatingIncome: pv(ttmOpIncome?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["operatingIncome"] ?? ""), `sum_last_4_quarters`),
    ttmNetIncome: pv(ttmNetIncome?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["netIncome"] ?? ""), `sum_last_4_quarters`),
    ttmDilutedEPS: pv(ttmEpsDiluted?.value ?? null, "USD/share", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["epsDiluted"] ?? ""), `sum_last_4_quarters`),
    ttmOCF: pv(ttmOcf?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["ocf"] ?? ""), `sum_last_4_quarters`),
    ttmCapex: pv(ttmCapex?.value != null ? Math.abs(ttmCapex.value) : null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["capex"] ?? ""), `sum_last_4_quarters (abs)`),
    ttmFCF: pv(ttmFcfValue, "USD", "TTM", today, "COMPUTED", "TTM OCF - TTM CapEx", "subtraction"),
    ttmDA: pv(ttmDa?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["da"] ?? ""), `sum_last_4_quarters`),
    ttmSBC: pv(ttmSbc?.value ?? null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["sbc"] ?? ""), `sum_last_4_quarters`),
    ttmDividendsPaid: pv(ttmDivPaid?.value != null ? Math.abs(ttmDivPaid.value) : null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["dividendsPaid"] ?? ""), `sum_last_4_quarters (abs)`),
    ttmBuybacks: pv(ttmBuyback?.value != null ? Math.abs(ttmBuyback.value) : null, "USD", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["buyback"] ?? ""), `sum_last_4_quarters (abs)`),
    ttmDilutedShares: pv(ttmDilShares?.value ?? null, "shares", "TTM", today, "SEC_XBRL", src(xbrl.matchedTags["dilutedShares"] ?? ""), `average_last_4_quarters`),
    quartersUsed,

    latestQuarterRevenue: pv(lqRevenue, "USD", latestQ ? `${latestQ.fiscalPeriod} FY${latestQ.fiscalYear}` : "latest", today, "SEC_XBRL", src(xbrl.matchedTags["revenue"] ?? ""), "latest quarter"),
    latestQuarterGrossMargin: pv(safeDiv(lqGrossProfit, lqRevenue), "ratio", "latest quarter", today, "COMPUTED", "grossProfit/revenue", "division"),
    latestQuarterOperatingMargin: pv(safeDiv(lqOpIncome, lqRevenue), "ratio", "latest quarter", today, "COMPUTED", "opIncome/revenue", "division"),
    latestQuarterNetMargin: pv(safeDiv(lqNetIncome, lqRevenue), "ratio", "latest quarter", today, "COMPUTED", "netIncome/revenue", "division"),

    cash: pv(bsCash?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["cash"] ?? ""), "latest filing"),
    shortTermInvestments: pv(bsStInv?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["shortTermInvestments"] ?? ""), "latest filing"),
    totalCashAndInvestments: pv(totalCash, "USD", "point-in-time", bsDate, "COMPUTED", "cash + shortTermInvestments + ltInvestments", "addition"),
    currentDebt: pv(bsCurrDebt?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["currentDebt"] ?? ""), "latest filing"),
    longTermDebt: pv(bsLtDebt?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["longTermDebt"] ?? ""), "latest filing"),
    totalDebt: pv(totalDebt, "USD", "point-in-time", bsDate, "COMPUTED", "currentDebt + longTermDebt", "addition"),
    totalEquity: pv(bsEquity?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["totalEquity"] ?? ""), "latest filing"),
    goodwill: pv(bsGoodwill?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["goodwill"] ?? ""), "latest filing"),
    inventory: pv(bsInventory?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["inventory"] ?? ""), "latest filing"),
    receivables: pv(bsReceivables?.value ?? null, "USD", "point-in-time", bsDate, "SEC_XBRL", src(xbrl.matchedTags["receivables"] ?? ""), "latest filing"),
    bookValuePerShare: pv(bvps, "USD/share", "point-in-time", bsDate, "COMPUTED", "totalEquity / shares", "division"),

    trailingPE: pv(trailingPE, "ratio", "TTM", today, "COMPUTED", "price / TTM diluted EPS", "division"),
    priceToBook: pv(ptb, "ratio", "point-in-time", today, "COMPUTED", "price / bookValuePerShare", "division"),
    evToRevenue: pv(evRev, "ratio", "TTM", today, "COMPUTED", "EV / TTM revenue", "division"),

    annualHistory,
    fiveYearAvgGrossMargin: pv(avg5YGross, "ratio", "5Y avg", today, "COMPUTED", "avg of annual gross margins", "average"),
    fiveYearAvgOperatingMargin: pv(avg5YOp, "ratio", "5Y avg", today, "COMPUTED", "avg of annual operating margins", "average"),

    annualDividendPerShare: pv(marketData.annualDividendRate, "USD/share", "trailing annual", today, "MARKET_DATA", mktSrc, "trailing annual dividend"),
    dividendYield: pv(marketData.annualDividendYield, "ratio", "trailing annual", today, "MARKET_DATA", mktSrc, "trailing annual yield"),

    xbrlMatchedTags: xbrl.matchedTags,
    missingFields: xbrl.missingFields,
    dataQualityNotes,
  };
}
