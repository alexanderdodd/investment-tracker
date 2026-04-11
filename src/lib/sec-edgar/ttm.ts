/**
 * TTM (Trailing Twelve Months) calculator — v3 statement-table-first.
 *
 * Strategy: find the latest 4 discrete quarters by walking backward from
 * the most recent calendar quarter frame. Derive Q4 from FY annual when
 * it's not reported as a separate discrete quarter.
 */

import type { XbrlUnit } from "./client";

export interface QuarterlyValue {
  fiscalYear: number;
  fiscalPeriod: string;
  calendarFrame: string;
  endDate: string;
  value: number;
  accession: string;
  derived: boolean;
}

export interface TtmResult {
  value: number;
  quarters: QuarterlyValue[];
  quartersLabel: string;
}

interface DiscreteEntry {
  frame: string;
  fy: number;
  fp: string;
  start: string;
  end: string;
  val: number;
  accn: string;
  durationDays: number;
}

/**
 * Extract all discrete (single-quarter) entries from XBRL units.
 * A discrete entry is one with the shortest duration for a given fy+fp,
 * or one that has a calendar quarter frame (CY####Q#).
 */
function getDiscreteEntries(units: XbrlUnit[]): DiscreteEntry[] {
  const result: DiscreteEntry[] = [];
  const seenFrames = new Set<string>();

  // First pass: get all framed entries (these are definitively discrete)
  for (const u of units) {
    if (u.form !== "10-K" && u.form !== "10-Q") continue;
    if (!u.frame || !u.start || !u.end) continue;
    if (u.fp === "FY") continue;

    const frameKey = u.frame.replace("I", "");
    if (seenFrames.has(frameKey)) continue;
    seenFrames.add(frameKey);

    const duration = (new Date(u.end).getTime() - new Date(u.start).getTime()) / (1000 * 60 * 60 * 24);

    result.push({
      frame: frameKey,
      fy: u.fy,
      fp: u.fp,
      start: u.start,
      end: u.end,
      val: u.val,
      accn: u.accn,
      durationDays: duration,
    });
  }

  return result;
}

/**
 * Get all FY (full-year) entries for deriving Q4.
 */
function getAnnualEntries(units: XbrlUnit[]): { fy: number; start: string; end: string; val: number }[] {
  const byFyEnd = new Map<string, { fy: number; start: string; end: string; val: number; duration: number }>();

  for (const u of units) {
    if (u.fp !== "FY" || !u.start || !u.end) continue;
    if (u.form !== "10-K" && u.form !== "10-Q") continue;

    const key = `${u.fy}-${u.end}`;
    const duration = new Date(u.end).getTime() - new Date(u.start).getTime();
    const existing = byFyEnd.get(key);
    if (!existing || duration > existing.duration) {
      byFyEnd.set(key, { fy: u.fy, start: u.start, end: u.end, val: u.val, duration });
    }
  }

  return Array.from(byFyEnd.values()).sort((a, b) => (b.end > a.end ? 1 : -1));
}

/**
 * Try to derive Q4 by finding FY annual entries where Q1+Q2+Q3 are known
 * but Q4 is not a separate discrete entry.
 */
function deriveQ4Entries(
  discreteEntries: DiscreteEntry[],
  annualEntries: { fy: number; start: string; end: string; val: number }[]
): DiscreteEntry[] {
  const derived: DiscreteEntry[] = [];

  for (const annual of annualEntries) {
    const annualStart = new Date(annual.start).getTime();
    const annualEnd = new Date(annual.end).getTime();

    // Find Q1, Q2, Q3 whose period falls WITHIN this annual period.
    // This is critical for non-calendar fiscal years where the same fy number
    // can refer to different periods in SEC EDGAR.
    const q1 = discreteEntries.find(e => {
      const eEnd = new Date(e.end).getTime();
      return e.fp === "Q1" && eEnd > annualStart && eEnd <= annualEnd;
    });
    const q2 = discreteEntries.find(e => {
      const eEnd = new Date(e.end).getTime();
      return e.fp === "Q2" && eEnd > annualStart && eEnd <= annualEnd;
    });
    const q3 = discreteEntries.find(e => {
      const eEnd = new Date(e.end).getTime();
      return e.fp === "Q3" && eEnd > annualStart && eEnd <= annualEnd;
    });

    // Check if a Q4 already exists for this annual period
    const hasQ4 = [...discreteEntries, ...derived].some(e => {
      const eEnd = new Date(e.end).getTime();
      return e.fp === "Q4" && Math.abs(eEnd - annualEnd) < 7 * 24 * 60 * 60 * 1000; // within 7 days
    });

    if (q1 && q2 && q3 && !hasQ4) {
      const q4Val = annual.val - q1.val - q2.val - q3.val;
      const q3EndDate = new Date(q3.end);
      const q4StartDate = new Date(q3EndDate);
      q4StartDate.setDate(q4StartDate.getDate() + 1);

      derived.push({
        frame: `FY${annual.fy}Q4_derived`,
        fy: annual.fy,
        fp: "Q4",
        start: q4StartDate.toISOString().split("T")[0],
        end: annual.end,
        val: q4Val,
        accn: "derived",
        durationDays: 90,
      });
    }
  }

  return derived;
}

/**
 * Compute TTM using cumulative approach for cash flow items.
 *
 * Cash flow statements in SEC XBRL are typically reported as cumulative
 * (YTD) values. TTM = latest_cumulative + (prior_FY - equivalent_prior_cumulative).
 *
 * Example for a Q2 filing:
 *   TTM = H1_current_year + (FY_prior - H1_prior_year)
 *       = 20,314 + (17,525 - 7,186) = 30,653
 */
function computeTTMCumulative(units: XbrlUnit[]): TtmResult | null {
  const filingEntries = units.filter(u =>
    u.start && u.end && (u.form === "10-K" || u.form === "10-Q")
  );

  if (filingEntries.length === 0) return null;

  // Find the latest non-FY cumulative entry (from the most recent 10-Q)
  const cumulatives = filingEntries
    .filter(u => u.fp !== "FY")
    .sort((a, b) => (b.end! > a.end! ? 1 : -1));

  if (cumulatives.length === 0) return null;

  // Get the latest cumulative entry (could be Q1, Q2, or Q3)
  // For each fp, there may be both short (discrete) and long (cumulative) entries
  // We want the longest (most cumulative) entry for the latest filing
  const latestEnd = cumulatives[0].end!;
  const latestFy = cumulatives[0].fy;
  const latestFp = cumulatives[0].fp;

  // Get all entries for this fy+fp
  const samePeriod = cumulatives.filter(u => u.fy === latestFy && u.fp === latestFp);
  // Pick the longest duration (most cumulative)
  samePeriod.sort((a, b) => {
    const durA = new Date(a.end!).getTime() - new Date(a.start!).getTime();
    const durB = new Date(b.end!).getTime() - new Date(b.start!).getTime();
    return durB - durA;
  });
  const latestCumulative = samePeriod[0];
  const latestCumVal = latestCumulative.val;
  const latestCumStart = latestCumulative.start!;

  // Find the prior FY annual entry that covers the year before this cumulative
  const annuals = getAnnualEntries(units);
  // The prior FY should end right before the cumulative starts (within a few days)
  const priorFY = annuals.find(a => {
    const fyEnd = new Date(a.end).getTime();
    const cumStart = new Date(latestCumStart).getTime();
    return Math.abs(fyEnd - cumStart) < 7 * 24 * 60 * 60 * 1000; // within 7 days
  });

  if (!priorFY) return null;

  // Find the equivalent cumulative from the prior year
  // Same fp, same fiscal year as the annual, longest duration
  const priorCumulatives = filingEntries
    .filter(u => {
      if (u.fp !== latestFp) return false;
      const uStart = new Date(u.start!).getTime();
      const fyStart = new Date(priorFY.start).getTime();
      return Math.abs(uStart - fyStart) < 7 * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => {
      const durA = new Date(a.end!).getTime() - new Date(a.start!).getTime();
      const durB = new Date(b.end!).getTime() - new Date(b.start!).getTime();
      return durB - durA;
    });

  if (priorCumulatives.length === 0) return null;
  const priorCumVal = priorCumulatives[0].val;

  // TTM = latest_cumulative + (prior_FY - prior_equivalent_cumulative)
  const ttmValue = latestCumVal + (priorFY.val - priorCumVal);

  return {
    value: ttmValue,
    quarters: [
      { fiscalYear: priorFY.fy, fiscalPeriod: "remainder", calendarFrame: "derived", endDate: priorFY.end, value: priorFY.val - priorCumVal, accession: "derived_cumulative", derived: true },
      { fiscalYear: latestFy, fiscalPeriod: latestFp + "_cumulative", calendarFrame: "cumulative", endDate: latestEnd, value: latestCumVal, accession: latestCumulative.accn, derived: false },
    ],
    quartersLabel: `${latestFp} FY${String(latestFy).slice(-2)} cumulative + FY${String(priorFY.fy).slice(-2)} remainder`,
  };
}

/**
 * Compute TTM by finding the latest 4 discrete quarters and summing.
 * Falls back to cumulative approach for cash flow items where discrete
 * quarter frames are not available.
 */
export function computeTTM(units: XbrlUnit[]): TtmResult | null {
  const discrete = getDiscreteEntries(units);
  const annuals = getAnnualEntries(units);
  const derivedQ4s = deriveQ4Entries(discrete, annuals);

  // Combine all available quarters
  const allQuarters = [...discrete, ...derivedQ4s];

  // Sort by end date descending
  allQuarters.sort((a, b) => (b.end > a.end ? 1 : -1));

  // Take the latest 4
  const latest4 = allQuarters.slice(0, 4);

  if (latest4.length >= 4) {
    // Verify the 4 quarters are contiguous (not 4 Q1s from different years)
    // Check: they should span approximately 365 days total
    const oldestEnd = new Date(latest4[latest4.length - 1].end).getTime();
    const newestEnd = new Date(latest4[0].end).getTime();
    const spanDays = (newestEnd - oldestEnd) / (1000 * 60 * 60 * 24);

    // Also check: no duplicate fiscal periods in same fiscal year
    const fpSet = new Set(latest4.map(q => `${q.fy}-${q.fp}`));
    const isContiguous = spanDays > 250 && spanDays < 400 && fpSet.size === 4;

    if (isContiguous) {
      // Reverse to chronological order
      latest4.reverse();

      const quarters: QuarterlyValue[] = latest4.map((e) => ({
        fiscalYear: e.fy,
        fiscalPeriod: e.fp,
        calendarFrame: e.frame,
        endDate: e.end,
        value: e.val,
        accession: e.accn,
        derived: e.accn === "derived",
      }));

      const ttmValue = quarters.reduce((sum, q) => sum + q.value, 0);
      const quartersLabel = quarters
        .map((q) => `${q.fiscalPeriod} FY${String(q.fiscalYear).slice(-2)}`)
        .join(" + ");

      return { value: ttmValue, quarters, quartersLabel };
    }
  }

  // Fallback: use cumulative approach (for cash flow items)
  return computeTTMCumulative(units);
}

/**
 * Build a 5-year annual history of a metric from XBRL units.
 * Uses the longest-duration FY entry for each fiscal year.
 *
 * IMPORTANT: Uses the calendar year of the period-end date as the fiscal year
 * identifier, NOT the SEC EDGAR `fy` field. For non-calendar fiscal years
 * (e.g., Micron ending in August), SEC assigns the same `fy` number to
 * different physical fiscal years. Using end-date year ensures each physical
 * year gets a unique, stable identifier that can be joined across metrics.
 */
export function buildAnnualHistory(
  units: XbrlUnit[],
  years = 5
): { fiscalYear: number; value: number }[] {
  const annuals = getAnnualEntries(units);

  // Deduplicate by end-date year (the calendar year the fiscal year ends in).
  // This is the stable identifier — the SEC fy field is unreliable for
  // non-calendar fiscal years.
  const byEndYear = new Map<number, { endYear: number; val: number }>();
  for (const a of annuals) {
    const endYear = parseInt(a.end.substring(0, 4), 10);
    if (!byEndYear.has(endYear)) {
      byEndYear.set(endYear, { endYear, val: a.val });
    }
  }

  return Array.from(byEndYear.values())
    .sort((a, b) => a.endYear - b.endYear)
    .slice(-years)
    .map((e) => ({ fiscalYear: e.endYear, value: e.val }));
}
