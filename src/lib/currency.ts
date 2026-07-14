/**
 * Yahoo Finance quotes a few markets in a *minor* unit — 1/100 of the ISO
 * currency — while reporting per-share fundamentals (EPS) in the major unit.
 * Most notably UK stocks quote in pence (GBp) but their EPS is in pounds (GBP),
 * so a naive P/E is 100× too big and the "filing currency == quote currency"
 * check fails (GBp !== GBP). Normalising the price to the major unit fixes both.
 *
 * Known minor units on Yahoo:
 *   GBp / GBX  → GBP  (UK pence)
 *   ZAc        → ZAR  (South African cents)
 *   ILA        → ILS  (Israeli agorot)
 */
const MINOR_UNITS: Record<string, { major: string; per: number }> = {
  GBp: { major: "GBP", per: 100 },
  GBX: { major: "GBP", per: 100 },
  ZAc: { major: "ZAR", per: 100 },
  ZAC: { major: "ZAR", per: 100 },
  ILA: { major: "ILS", per: 100 },
};

/**
 * Given a raw Yahoo currency code, return the major-unit ISO code and the
 * divisor needed to convert a quoted value into that major unit. For ordinary
 * currencies the divisor is 1 and the code is returned unchanged (upper-cased).
 */
export function normalizeCurrency(currency: string | null | undefined): {
  currency: string;
  divisor: number;
} {
  if (!currency) return { currency: "USD", divisor: 1 };
  const minor = MINOR_UNITS[currency] ?? MINOR_UNITS[currency.trim()];
  if (minor) return { currency: minor.major, divisor: minor.per };
  return { currency: currency.trim().toUpperCase(), divisor: 1 };
}

/** Convert a single quoted value to the major unit for its currency. */
export function toMajorUnit(
  value: number | null | undefined,
  currency: string | null | undefined
): number | null {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const { divisor } = normalizeCurrency(currency);
  return value / divisor;
}

/**
 * Format a monetary value in its own currency — £ for GBP, € for EUR, CHF, $,
 * etc. We deliberately do NOT convert to USD: a pound stock is shown in pounds,
 * a euro stock in euros. Falls back to a "CODE 1.23" prefix for exotic codes.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined = "USD",
  opts: { maximumFractionDigits?: number } = {}
): string {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  const { currency: code } = normalizeCurrency(currency);
  const maximumFractionDigits = opts.maximumFractionDigits ?? 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits,
    }).format(value);
  } catch {
    // Unknown/invalid ISO code — fall back to a readable prefix
    return `${code} ${value.toFixed(maximumFractionDigits)}`;
  }
}
