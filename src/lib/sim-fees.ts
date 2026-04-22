/**
 * Brokerage fee models for simulation portfolios.
 *
 * IBKR Pro: $0.005/share, min $1.00, max 1% of trade value
 * Saxo Classic: 0.08% of trade value, min $1.00
 * Commission-free: $0
 */

export type FeeModel = "ibkr_pro" | "saxo_classic" | "commission_free";

export function calculateFee(
  model: FeeModel,
  shares: number,
  pricePerShare: number
): number {
  switch (model) {
    case "ibkr_pro": {
      const perShareFee = shares * 0.005;
      const tradeValue = shares * pricePerShare;
      const maxFee = tradeValue * 0.01; // 1% cap
      return Math.round(Math.max(1.0, Math.min(perShareFee, maxFee)) * 100) / 100;
    }
    case "saxo_classic": {
      const tradeValue = shares * pricePerShare;
      return Math.round(Math.max(1.0, tradeValue * 0.0008) * 100) / 100;
    }
    case "commission_free":
      return 0;
  }
}

export const FEE_MODEL_LABELS: Record<FeeModel, { name: string; description: string }> = {
  ibkr_pro: {
    name: "IBKR Pro",
    description: "$0.005/share, min $1, max 1% of trade",
  },
  saxo_classic: {
    name: "Saxo Classic",
    description: "0.08% of trade value, min $1",
  },
  commission_free: {
    name: "Commission-free",
    description: "$0 per trade (Robinhood/Schwab model)",
  },
};
