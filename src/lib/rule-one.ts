/**
 * Shared Rule #1 (Phil Town) math and thresholds — used by the stock page's
 * Growth / Sticker Price tabs and the watchlist dashboard so the numbers
 * can't drift apart between views.
 */

import type { MetricRating } from "./stock-metrics";

export const PROJECTION_YEARS = 10;
export const MINIMUM_RETURN = 0.15; // Rule #1 minimum acceptable rate of return
export const DISCOUNT_FACTOR = Math.pow(1 + MINIMUM_RETURN, PROJECTION_YEARS); // ≈ 4.05
export const MARGIN_OF_SAFETY = 0.5;

/** Rule #1 rule of thumb: all Big Five should be ≥ 10%/year */
export function rateBigFive(v: number | null): MetricRating {
  if (v === null) return "neutral";
  if (v >= 0.1) return "good";
  if (v >= 0.05) return "caution";
  return "bad";
}

/** Rule #1 growth estimate: the LOWER of your own (equity-growth-based)
 *  estimate and the analyst consensus. Null when neither is available. */
export function defaultGrowthRate(
  equityGrowth: number | null | undefined,
  analystGrowth: number | null | undefined
): number | null {
  const candidates = [equityGrowth, analystGrowth].filter(
    (v): v is number => v !== null && v !== undefined
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export interface StickerCalc {
  futureEps: number;
  defaultPe: number;
  futurePe: number;
  futurePrice: number;
  sticker: number;
  mos: number;
}

/** The five-step sticker price: EPS compounded PROJECTION_YEARS out, a
 *  conservative P/E (lower of 2×growth and the historical high), discounted
 *  back at MINIMUM_RETURN, MOS at half. Null when inputs can't support it. */
export function computeSticker(
  eps: number | null,
  growth: number | null,
  historicalHighPe: number | null
): StickerCalc | null {
  if (eps === null || eps <= 0 || growth === null || !isFinite(growth)) return null;
  const futureEps = eps * Math.pow(1 + growth, PROJECTION_YEARS);
  const defaultPe = growth * 2 * 100;
  const futurePe = historicalHighPe !== null ? Math.min(defaultPe, historicalHighPe) : defaultPe;
  if (futurePe <= 0) return null;
  const futurePrice = futureEps * futurePe;
  const sticker = futurePrice / DISCOUNT_FACTOR;
  return { futureEps, defaultPe, futurePe, futurePrice, sticker, mos: sticker * MARGIN_OF_SAFETY };
}

/** Verdict for a current price against sticker & MOS */
export function priceVerdict(
  price: number | null,
  calc: StickerCalc | null
): "mos" | "sticker" | "above" | null {
  if (price === null || calc === null) return null;
  if (price <= calc.mos) return "mos";
  if (price <= calc.sticker) return "sticker";
  return "above";
}

/** Buy-below (MOS) price at a chosen margin-of-safety fraction — e.g. 0.5 =
 *  buy at 50% of sticker. Matches the default MARGIN_OF_SAFETY at 0.5. */
export function mosPrice(sticker: number | null, mosFraction: number): number | null {
  if (sticker === null || !isFinite(sticker)) return null;
  return sticker * (1 - mosFraction);
}

/** Current margin of safety a price enjoys against sticker, as a fraction:
 *  (sticker − price) / sticker. Positive = trading below sticker (a discount),
 *  negative = above sticker. Compare against the chosen MOS fraction to decide
 *  if a stock is "on sale". */
export function currentMos(price: number | null, sticker: number | null): number | null {
  if (price === null || sticker === null || !isFinite(sticker) || sticker <= 0) return null;
  return (sticker - price) / sticker;
}

/** Verdict comparing a price against a sticker at a configurable MOS fraction.
 *  Lets the screener / watchlist recolor rows without recomputing stickers. */
export function priceVerdictAt(
  price: number | null,
  sticker: number | null,
  mosFraction: number
): "mos" | "sticker" | "above" | null {
  if (price === null || sticker === null || !isFinite(sticker) || sticker <= 0) return null;
  if (price <= sticker * (1 - mosFraction)) return "mos";
  if (price <= sticker) return "sticker";
  return "above";
}
