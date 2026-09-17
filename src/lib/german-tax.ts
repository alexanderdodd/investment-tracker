// German capital gains tax (Kapitalertragsteuer / Abgeltungssteuer) for the
// portfolio simulator.
//
// Model (single filer, no church tax):
//   • Flat rate (Abgeltungssteuer):        25%
//   • Solidarity surcharge (Soli):         5.5% of the tax → effective 26.375%
//   • Loss offsetting (Verlustverrechnung): realized losses reduce net gains
//     before tax is applied — i.e. tax-loss harvesting.
//
// Currency: values are taxed as raw numbers (no FX conversion).

export const CAPITAL_GAINS_RATE = 0.25; // Abgeltungssteuer
export const SOLI_RATE = 0.055; // Solidaritätszuschlag (5.5% of the tax)
export const EFFECTIVE_RATE = CAPITAL_GAINS_RATE * (1 + SOLI_RATE); // 0.26375

export interface CapitalGainsTax {
  realizedGains: number; // sum of profitable sales (≥ 0)
  realizedLosses: number; // sum of losing sales (≤ 0)
  netRealized: number; // gains + losses (after loss harvesting)
  taxableAmount: number; // amount subject to tax after losses
  tax: number; // estimated tax owed
  effectiveRate: number; // 0.26375
}

/**
 * Compute German capital gains tax for a set of realized gains/losses.
 * @param realizedGains sum of positive realized gains (≥ 0)
 * @param realizedLosses sum of realized losses (≤ 0)
 */
export function calculateCapitalGainsTax(
  realizedGains: number,
  realizedLosses: number
): CapitalGainsTax {
  const netRealized = realizedGains + realizedLosses; // losses are negative
  const taxableAmount = Math.max(0, netRealized);
  const tax = taxableAmount * EFFECTIVE_RATE;

  return {
    realizedGains,
    realizedLosses,
    netRealized,
    taxableAmount,
    tax,
    effectiveRate: EFFECTIVE_RATE,
  };
}

/**
 * Split a list of per-sale realized gains into positive gains and negative
 * losses, then compute the tax.
 */
export function summarizeRealized(realizedGains: number[]): CapitalGainsTax {
  let gains = 0;
  let losses = 0;
  for (const g of realizedGains) {
    if (g >= 0) gains += g;
    else losses += g;
  }
  return calculateCapitalGainsTax(gains, losses);
}
