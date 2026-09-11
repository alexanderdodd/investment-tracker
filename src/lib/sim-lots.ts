// FIFO lot accounting for simulated portfolios.
//
// German tax law (and this simulator) matches sales of identical securities
// against the oldest acquired lots first (first-in-first-out). Buy fees are
// folded into each lot's cost basis; sell fees reduce proceeds. Realized gain
// for a sale = proceeds (net of sell fees) − cost basis of the consumed lots.

const EPS = 1e-9;

export interface TradeRecord {
  id: string;
  ticker: string;
  companyName: string;
  tradeType: "buy" | "sell";
  shares: number;
  pricePerShare: number;
  fees: number;
  totalCost: number;
  executedAt: Date;
  spyPriceAtTrade: number | null;
  sectorEtfTicker: string | null;
  sectorEtfPriceAtTrade: number | null;
}

export interface ReplayPosition {
  ticker: string;
  companyName: string;
  shares: number; // remaining shares after all sells
  totalCost: number; // remaining cost basis (includes allocated buy fees)
  avgCostBasis: number;
  firstBuyDate: string;
  sectorEtfTicker: string | null;
  spyPriceAtFirstBuy: number | null;
  sectorEtfPriceAtFirstBuy: number | null;
}

export interface ReplayResult {
  /** Only tickers with remaining shares > 0. */
  positions: ReplayPosition[];
  /** Remaining shares held per ticker (0 if fully sold). */
  sharesByTicker: Record<string, number>;
  /** Realized gain per sell trade id. */
  realizedByTrade: Record<string, number>;
  /** Sum of all realized gains/losses. */
  realizedTotal: number;
}

interface Lot {
  shares: number;
  costPerShare: number; // includes proportional buy fees
}

interface TickerState {
  lots: Lot[];
  companyName: string;
  firstBuyDate: string | null;
  sectorEtfTicker: string | null;
  spyPriceAtFirstBuy: number | null;
  sectorEtfPriceAtFirstBuy: number | null;
}

/**
 * Compute the realized gain for a single sale against a FIFO lot queue, mutating
 * the queue to consume the oldest lots. Returns the realized gain.
 */
function consumeLots(lots: Lot[], shares: number, proceeds: number): number {
  let remaining = shares;
  let costConsumed = 0;
  while (remaining > EPS && lots.length > 0) {
    const lot = lots[0];
    const take = Math.min(lot.shares, remaining);
    costConsumed += take * lot.costPerShare;
    lot.shares -= take;
    remaining -= take;
    if (lot.shares <= EPS) lots.shift();
  }
  return proceeds - costConsumed;
}

/**
 * Replay all trades (any order) through FIFO accounting.
 */
export function replayTrades(trades: TradeRecord[]): ReplayResult {
  const sorted = [...trades].sort((a, b) => {
    const t = a.executedAt.getTime() - b.executedAt.getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const states: Record<string, TickerState> = {};
  const realizedByTrade: Record<string, number> = {};
  let realizedTotal = 0;

  for (const trade of sorted) {
    let state = states[trade.ticker];
    if (!state) {
      state = states[trade.ticker] = {
        lots: [],
        companyName: trade.companyName,
        firstBuyDate: null,
        sectorEtfTicker: null,
        spyPriceAtFirstBuy: null,
        sectorEtfPriceAtFirstBuy: null,
      };
    }

    if (trade.tradeType === "buy") {
      // totalCost already includes buy fees.
      const costPerShare = trade.shares > 0 ? trade.totalCost / trade.shares : 0;
      state.lots.push({ shares: trade.shares, costPerShare });
      if (state.firstBuyDate === null) {
        state.firstBuyDate = trade.executedAt.toISOString();
        state.sectorEtfTicker = trade.sectorEtfTicker;
        state.spyPriceAtFirstBuy = trade.spyPriceAtTrade;
        state.sectorEtfPriceAtFirstBuy = trade.sectorEtfPriceAtTrade;
      }
      state.companyName = trade.companyName;
    } else {
      const proceeds = trade.shares * trade.pricePerShare - trade.fees;
      const realized = consumeLots(state.lots, trade.shares, proceeds);
      realizedByTrade[trade.id] = realized;
      realizedTotal += realized;
    }
  }

  const positions: ReplayPosition[] = [];
  const sharesByTicker: Record<string, number> = {};

  for (const [ticker, state] of Object.entries(states)) {
    const shares = state.lots.reduce((s, l) => s + l.shares, 0);
    sharesByTicker[ticker] = shares;
    if (shares <= EPS) continue;
    const totalCost = state.lots.reduce((s, l) => s + l.shares * l.costPerShare, 0);
    positions.push({
      ticker,
      companyName: state.companyName,
      shares,
      totalCost,
      avgCostBasis: shares > 0 ? totalCost / shares : 0,
      firstBuyDate: state.firstBuyDate ?? "",
      sectorEtfTicker: state.sectorEtfTicker,
      spyPriceAtFirstBuy: state.spyPriceAtFirstBuy,
      sectorEtfPriceAtFirstBuy: state.sectorEtfPriceAtFirstBuy,
    });
  }

  return { positions, sharesByTicker, realizedByTrade, realizedTotal };
}

/**
 * Compute the realized gain a prospective sale would produce, without mutating
 * persistent state. Used at sell time to persist realizedGain on the trade.
 * Returns null if the position doesn't hold enough shares.
 */
export function computeSaleRealizedGain(
  existingTrades: TradeRecord[],
  ticker: string,
  shares: number,
  pricePerShare: number,
  fees: number
): { realizedGain: number; sharesHeld: number } | null {
  const { sharesByTicker } = replayTrades(existingTrades);
  const sharesHeld = sharesByTicker[ticker] ?? 0;
  if (shares > sharesHeld + EPS) return null;

  // Rebuild the FIFO queue for this ticker, then consume the sale.
  const sorted = existingTrades
    .filter((t) => t.ticker === ticker)
    .sort((a, b) => {
      const t = a.executedAt.getTime() - b.executedAt.getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });

  const lots: Lot[] = [];
  for (const trade of sorted) {
    if (trade.tradeType === "buy") {
      const costPerShare = trade.shares > 0 ? trade.totalCost / trade.shares : 0;
      lots.push({ shares: trade.shares, costPerShare });
    } else {
      const proceeds = trade.shares * trade.pricePerShare - trade.fees;
      consumeLots(lots, trade.shares, proceeds);
    }
  }

  const proceeds = shares * pricePerShare - fees;
  const realizedGain = consumeLots(lots, shares, proceeds);
  return { realizedGain, sharesHeld };
}
