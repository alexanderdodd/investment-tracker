/**
 * TTM (Trailing Twelve Months) calculator.
 *
 * Constructs TTM values by summing the last 4 discrete quarterly values
 * from XBRL data.  Handles the common case where Q4 is not separately
 * reported but must be derived as FY - (Q1 + Q2 + Q3).
 */

import type { XbrlUnit } from "./client";
import { getValueForPeriod } from "./xbrl-mapper";

export interface QuarterlyValue {
  fiscalYear: number;
  fiscalPeriod: string; // "Q1", "Q2", "Q3", "Q4"
  value: number;
  accession: string;
  derived: boolean; // true if Q4 was derived from FY - Q1 - Q2 - Q3
}

export interface TtmResult {
  value: number;
  quarters: QuarterlyValue[];
  quartersLabel: string; // e.g. "Q3 FY25 + Q4 FY25 + Q1 FY26 + Q2 FY26"
}

/**
 * Identify the latest 4 fiscal quarters available in the XBRL data.
 * Returns them in chronological order [oldest, ..., newest].
 */
function identifyLatest4Quarters(units: XbrlUnit[]): { fy: number; fp: string }[] {
  // Collect all quarterly and annual period markers from 10-K/10-Q filings
  const quarters: { fy: number; fp: string; end: string }[] = [];
  const annuals: { fy: number; end: string }[] = [];

  for (const u of units) {
    if (u.form !== "10-K" && u.form !== "10-Q") continue;
    if (!u.start || !u.end) continue; // skip instant values

    if (u.fp === "FY") {
      if (!annuals.some((a) => a.fy === u.fy)) {
        annuals.push({ fy: u.fy, end: u.end });
      }
    } else if (["Q1", "Q2", "Q3"].includes(u.fp)) {
      if (!quarters.some((q) => q.fy === u.fy && q.fp === u.fp)) {
        quarters.push({ fy: u.fy, fp: u.fp, end: u.end });
      }
    }
  }

  // Sort by end date descending
  quarters.sort((a, b) => (b.end > a.end ? 1 : -1));
  annuals.sort((a, b) => (b.end > a.end ? 1 : -1));

  // Build the latest 4 quarters
  // Strategy: take the most recent quarters, deriving Q4 if needed
  const result: { fy: number; fp: string }[] = [];
  const seen = new Set<string>();

  // First pass: collect actual quarterly data points
  for (const q of quarters) {
    const key = `${q.fy}-${q.fp}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ fy: q.fy, fp: q.fp });
    }
  }

  // Check if we need to synthesize Q4 for any fiscal year
  for (const annual of annuals) {
    const q4Key = `${annual.fy}-Q4`;
    if (!seen.has(q4Key)) {
      // Check if we have Q1, Q2, Q3 for this year
      const hasQ1 = seen.has(`${annual.fy}-Q1`);
      const hasQ2 = seen.has(`${annual.fy}-Q2`);
      const hasQ3 = seen.has(`${annual.fy}-Q3`);
      if (hasQ1 && hasQ2 && hasQ3) {
        seen.add(q4Key);
        result.push({ fy: annual.fy, fp: "Q4" });
      }
    }
  }

  // Sort chronologically: by FY then Q1<Q2<Q3<Q4
  const qOrder: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
  result.sort((a, b) => {
    if (a.fy !== b.fy) return a.fy - b.fy;
    return (qOrder[a.fp] ?? 0) - (qOrder[b.fp] ?? 0);
  });

  // Take the last 4
  return result.slice(-4);
}

/**
 * Compute TTM by summing the last 4 discrete quarters.
 * Derives Q4 as FY - Q1 - Q2 - Q3 when Q4 is not separately reported.
 */
export function computeTTM(units: XbrlUnit[]): TtmResult | null {
  const latest4 = identifyLatest4Quarters(units);
  if (latest4.length < 4) return null;

  const quarters: QuarterlyValue[] = [];

  for (const { fy, fp } of latest4) {
    if (fp === "Q4") {
      // Q4 is derived: FY - Q1 - Q2 - Q3
      const fyVal = getValueForPeriod(units, fy, "FY");
      const q1Val = getValueForPeriod(units, fy, "Q1");
      const q2Val = getValueForPeriod(units, fy, "Q2");
      const q3Val = getValueForPeriod(units, fy, "Q3");

      if (fyVal === null || q1Val === null || q2Val === null || q3Val === null) {
        return null; // Can't derive Q4
      }

      quarters.push({
        fiscalYear: fy,
        fiscalPeriod: "Q4",
        value: fyVal - q1Val - q2Val - q3Val,
        accession: "derived",
        derived: true,
      });
    } else {
      const val = getValueForPeriod(units, fy, fp);
      if (val === null) return null;

      // Find the accession for this quarter
      const match = units.find(
        (u) => u.fy === fy && u.fp === fp && u.start && (u.form === "10-Q" || u.form === "10-K")
      );

      quarters.push({
        fiscalYear: fy,
        fiscalPeriod: fp,
        value: val,
        accession: match?.accn ?? "unknown",
        derived: false,
      });
    }
  }

  const ttmValue = quarters.reduce((sum, q) => sum + q.value, 0);

  const quartersLabel = quarters
    .map((q) => `${q.fiscalPeriod} FY${String(q.fiscalYear).slice(-2)}`)
    .join(" + ");

  return {
    value: ttmValue,
    quarters,
    quartersLabel,
  };
}

/**
 * Build a 5-year annual history of a metric from XBRL units.
 */
export function buildAnnualHistory(
  units: XbrlUnit[],
  years = 5
): { fiscalYear: number; value: number }[] {
  const annuals = units
    .filter((u) => u.fp === "FY" && u.start && u.end && (u.form === "10-K" || u.form === "10-Q"))
    .sort((a, b) => b.fy - a.fy)
    .slice(0, years);

  // Deduplicate by fiscal year
  const seen = new Set<number>();
  const result: { fiscalYear: number; value: number }[] = [];
  for (const u of annuals) {
    if (!seen.has(u.fy)) {
      seen.add(u.fy);
      result.push({ fiscalYear: u.fy, value: u.val });
    }
  }

  return result.sort((a, b) => a.fiscalYear - b.fiscalYear);
}
