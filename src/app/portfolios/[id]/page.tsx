"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { type StockMetrics, formatMetric } from "@/lib/stock-metrics";

interface Position {
  ticker: string;
  companyName: string;
  shares: number;
  totalCost: number;
  totalFees: number;
  avgCostBasis: number;
  firstBuyDate: string;
  sectorEtfTicker: string | null;
  spyPriceAtFirstBuy: number | null;
  sectorEtfPriceAtFirstBuy: number | null;
  dividendsReceived: number;
}

interface Trade {
  id: string;
  ticker: string;
  companyName: string;
  tradeType: string;
  shares: number;
  pricePerShare: number;
  fees: number;
  totalCost: number;
  notes: string | null;
  executedAt: string;
}

interface PortfolioData {
  portfolio: {
    id: string;
    name: string;
    description: string | null;
    startingCash: number;
    feeModel: string;
    createdAt: string;
  };
  summary: {
    cashRemaining: number;
    totalInvested: number;
    totalFees: number;
    totalDividends: number;
    positionCount: number;
    tradeCount: number;
  };
  positions: Position[];
  trades: Trade[];
}

function fmt(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function PnlText({ value, basis }: { value: number; basis: number }) {
  const pnl = value - basis;
  const pct = basis > 0 ? pnl / basis : 0;
  const color = pnl >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return <span className={color}>{fmt(pnl)} ({fmtPct(pct)})</span>;
}

export default function PortfolioDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PortfolioData | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portfolios/${id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch live prices for positions + SPY + sector ETFs
  useEffect(() => {
    if (!data?.positions.length) return;
    const tickers = new Set<string>();
    tickers.add("SPY");
    data.positions.forEach((p) => {
      tickers.add(p.ticker);
      if (p.sectorEtfTicker) tickers.add(p.sectorEtfTicker);
    });

    fetch(`/api/stocks/metrics?tickers=${[...tickers].join(",")}`)
      .then((r) => r.json())
      .then((metrics: Record<string, StockMetrics>) => {
        // Extract current prices from forward P/E isn't quite right — let me use a price endpoint
        // For now, use metrics as a proxy to verify loading works
        // TODO: use a dedicated price endpoint
      })
      .catch(() => {});

    // Fetch from price endpoint
    Promise.all(
      [...tickers].map(async (ticker) => {
        try {
          const res = await fetch(`/api/stocks/${ticker}/price`);
          if (!res.ok) return null;
          const json = await res.json();
          return { ticker, price: json.price ?? json.regularMarketPrice ?? null };
        } catch { return null; }
      })
    ).then((results) => {
      const prices: Record<string, number> = {};
      results.forEach((r) => { if (r?.price) prices[r.ticker] = r.price; });
      setLivePrices(prices);
    });
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-zinc-500">Portfolio not found.</p>
        </div>
      </div>
    );
  }

  const { portfolio, summary, positions, trades } = data;

  // Compute live portfolio value
  const positionsWithLive = positions.map((pos) => {
    const livePrice = livePrices[pos.ticker];
    const currentValue = livePrice ? pos.shares * livePrice : null;
    const unrealizedPnl = currentValue ? currentValue - pos.totalCost : null;

    // Benchmark: what would SPY have returned?
    const spyNow = livePrices["SPY"];
    const spyReturn = (pos.spyPriceAtFirstBuy && spyNow)
      ? (pos.totalCost / pos.spyPriceAtFirstBuy) * spyNow
      : null;

    // Benchmark: what would sector ETF have returned?
    const etfNow = pos.sectorEtfTicker ? livePrices[pos.sectorEtfTicker] : null;
    const etfReturn = (pos.sectorEtfPriceAtFirstBuy && etfNow)
      ? (pos.totalCost / pos.sectorEtfPriceAtFirstBuy) * etfNow
      : null;

    return { ...pos, livePrice, currentValue, unrealizedPnl, spyReturn, etfReturn };
  });

  const totalCurrentValue = positionsWithLive.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const totalPortfolioValue = summary.cashRemaining + totalCurrentValue;
  const totalPnl = totalPortfolioValue - portfolio.startingCash;
  const totalPnlPct = portfolio.startingCash > 0 ? totalPnl / portfolio.startingCash : 0;
  const pnlColor = totalPnl >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 mb-2">
            <Link href="/portfolios" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              Portfolios
            </Link>
            <span>/</span>
            <span className="text-zinc-600 dark:text-zinc-300">{portfolio.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{portfolio.name}</h1>
          {portfolio.description && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{portfolio.description}</p>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Portfolio Value</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{fmt(totalPortfolioValue)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Total P&L</p>
            <p className={`text-lg font-semibold ${pnlColor}`}>{fmt(totalPnl)} ({fmtPct(totalPnlPct)})</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cash Remaining</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{fmt(summary.cashRemaining)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Dividends</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{fmt(summary.totalDividends)}</p>
          </div>
        </div>

        {/* Positions table */}
        {positionsWithLive.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Positions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 text-right font-medium">Shares</th>
                    <th className="px-3 py-3 text-right font-medium">Avg Cost</th>
                    <th className="px-3 py-3 text-right font-medium">Live Price</th>
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-3 py-3 text-right font-medium">P&L</th>
                    <th className="px-3 py-3 text-right font-medium">vs SPY</th>
                    <th className="px-3 py-3 text-right font-medium">vs Sector</th>
                    <th className="px-3 py-3 text-right font-medium">Divs</th>
                  </tr>
                </thead>
                <tbody>
                  {positionsWithLive.map((pos) => (
                    <tr key={pos.ticker} className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50">
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${pos.ticker}/valuation`} className="group">
                          <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                            {pos.ticker}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{pos.companyName}</p>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {pos.shares}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {fmt(pos.avgCostBasis)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {pos.livePrice ? fmt(pos.livePrice) : "-"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {pos.currentValue ? fmt(pos.currentValue) : "-"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm">
                        {pos.currentValue ? <PnlText value={pos.currentValue} basis={pos.totalCost} /> : "-"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm">
                        {pos.spyReturn ? <PnlText value={pos.spyReturn} basis={pos.totalCost} /> : "-"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm">
                        {pos.etfReturn ? (
                          <span title={pos.sectorEtfTicker ?? ""}>
                            <PnlText value={pos.etfReturn} basis={pos.totalCost} />
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-emerald-600 dark:text-emerald-400">
                        {pos.dividendsReceived > 0 ? fmt(pos.dividendsReceived) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {positionsWithLive.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              No positions yet. Browse stocks and click &quot;Simulate Buy&quot; to add positions.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/sectors" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                Browse Sectors
              </Link>
            </div>
          </div>
        )}

        {/* Recent trades */}
        {trades.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Trade History</h2>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {trades.slice(0, 20).map((t) => (
                <div key={t.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t.tradeType === "buy" ? "Buy" : "Sell"} {t.shares} {t.ticker}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t.companyName} at {fmt(t.pricePerShare)}/share
                      {t.fees > 0 && ` + ${fmt(t.fees)} fees`}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic mt-0.5">{t.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{fmt(t.totalCost)}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(t.executedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
