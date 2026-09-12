"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SimulateSellModal } from "@/components/simulate-sell-modal";
import { AddCashModal } from "@/components/add-cash-modal";
import { PositionMenu } from "@/components/position-menu";
import { type FeeModel } from "@/lib/sim-fees";
import { EFFECTIVE_RATE } from "@/lib/german-tax";

interface Position {
  ticker: string;
  companyName: string;
  shares: number;
  totalCost: number;
  totalFees: number;
  avgCostBasis: number;
  avgPrice: number;
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
  realizedGain: number | null;
  notes: string | null;
  executedAt: string;
}

interface TaxYear {
  year: number;
  realizedGains: number;
  realizedLosses: number;
  netRealized: number;
  allowance: number;
  allowanceApplied: number;
  taxableAmount: number;
  tax: number;
  effectiveRate: number;
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
    totalDividends: number;
    realizedGains: number;
    positionCount: number;
    tradeCount: number;
  };
  taxByYear: TaxYear[];
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

// After-tax P&L: a gain is reduced by the 26.375% effective rate; a loss keeps
// the same rate as its tax-loss-harvesting shield against other gains. Ignores
// the €1,000 annual allowance, which applies at the portfolio level.
function EffectivePnlText({ value, basis }: { value: number; basis: number }) {
  const pnl = value - basis;
  const afterTax = pnl * (1 - EFFECTIVE_RATE);
  const pct = basis > 0 ? afterTax / basis : 0;
  const color = afterTax >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return <span className={color}>{fmt(afterTax)} ({fmtPct(pct)})</span>;
}

export default function PortfolioDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<PortfolioData | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sellTarget, setSellTarget] = useState<Position | null>(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadData = useCallback(() => {
    return fetch(`/api/portfolios/${id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch live prices for positions + SPY + sector ETFs
  useEffect(() => {
    if (!data?.positions.length) return;
    const tickers = new Set<string>();
    tickers.add("SPY");
    data.positions.forEach((p) => {
      tickers.add(p.ticker);
      if (p.sectorEtfTicker) tickers.add(p.sectorEtfTicker);
    });

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
        <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-zinc-500">Portfolio not found.</p>
        </div>
      </div>
    );
  }

  const { portfolio, summary, positions, trades, taxByYear } = data;
  const currentYear = new Date().getFullYear();
  const currentYearTax =
    taxByYear?.find((t) => t.year === currentYear) ?? taxByYear?.[0] ?? null;

  const deletePosition = async (ticker: string) => {
    if (!window.confirm(`Delete ${ticker} entirely? This removes all its trades and dividends from this portfolio.`)) {
      return;
    }
    setDeleting(ticker);
    try {
      const res = await fetch(`/api/portfolios/${id}/trades?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLoading(true);
        await loadData();
      }
    } finally {
      setDeleting(null);
    }
  };

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

  // Column totals for the Positions table footer. Percentages use the cost
  // basis of only the positions that contribute to each metric.
  const totals = positionsWithLive.reduce(
    (a, p) => {
      a.divs += p.dividendsReceived;
      if (p.currentValue != null) {
        a.value += p.currentValue;
        a.costForValue += p.totalCost;
      }
      if (p.spyReturn != null) {
        a.spy += p.spyReturn;
        a.costForSpy += p.totalCost;
      }
      if (p.etfReturn != null) {
        a.etf += p.etfReturn;
        a.costForEtf += p.totalCost;
      }
      return a;
    },
    { divs: 0, value: 0, costForValue: 0, spy: 0, costForSpy: 0, etf: 0, costForEtf: 0 }
  );

  const totalCurrentValue = positionsWithLive.reduce((s, p) => s + (p.currentValue ?? 0), 0);
  const totalPortfolioValue = summary.cashRemaining + totalCurrentValue;
  const totalPnl = totalPortfolioValue - portfolio.startingCash;
  const totalPnlPct = portfolio.startingCash > 0 ? totalPnl / portfolio.startingCash : 0;
  const pnlColor = totalPnl >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8 space-y-6">
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
            <div className="flex items-start justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Cash Remaining</p>
              <button
                onClick={() => setShowAddCash(true)}
                className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-colors"
              >
                + Add
              </button>
            </div>
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
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Stock</th>
                    <th className="px-3 py-3 text-right font-medium">Shares</th>
                    <th className="px-3 py-3 text-right font-medium">Avg Cost</th>
                    <th className="px-3 py-3 text-right font-medium">Live Price</th>
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-3 py-3 text-right font-medium">P&L</th>
                    <th className="px-3 py-3 text-right font-medium" title="P&L after 26.375% German capital gains tax (Abgeltungssteuer + Soli)">
                      Eff. P&L
                    </th>
                    <th className="px-3 py-3 text-right font-medium">vs SPY</th>
                    <th className="px-3 py-3 text-right font-medium">vs Sector</th>
                    <th className="px-3 py-3 text-right font-medium">Divs</th>
                    <th className="px-3 py-3 text-right font-medium"></th>
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
                      <td
                        className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300"
                        title={`Pure price ${fmt(pos.avgPrice)} + fees ${fmt(pos.totalFees)} → incl. fees ${fmt(pos.avgCostBasis)}/share`}
                      >
                        {fmt(pos.avgPrice)}
                        {pos.totalFees > 0 && (
                          <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">
                            +{fmt(pos.totalFees)} fees
                          </span>
                        )}
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
                        {pos.currentValue ? <EffectivePnlText value={pos.currentValue} basis={pos.totalCost} /> : "-"}
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
                      <td className="px-3 py-3 text-right">
                        {deleting === pos.ticker ? (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">Deleting…</span>
                        ) : (
                          <PositionMenu
                            onSell={() => setSellTarget(pos)}
                            onDelete={() => deletePosition(pos.ticker)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 text-sm font-medium dark:border-zinc-700">
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">Total</td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 text-right text-zinc-900 dark:text-zinc-100">{fmt(totals.value)}</td>
                    <td className="px-3 py-3 text-right">
                      <PnlText value={totals.value} basis={totals.costForValue} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <EffectivePnlText value={totals.value} basis={totals.costForValue} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {totals.costForSpy > 0 ? <PnlText value={totals.spy} basis={totals.costForSpy} /> : "-"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {totals.costForEtf > 0 ? <PnlText value={totals.etf} basis={totals.costForEtf} /> : "-"}
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      {totals.divs > 0 ? fmt(totals.divs) : "-"}
                    </td>
                    <td className="px-3 py-3"></td>
                  </tr>
                </tfoot>
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

        {/* Capital gains & German tax */}
        {taxByYear && taxByYear.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Capital Gains &amp; Tax
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                German capital gains tax (Abgeltungssteuer 25% + 5.5% Soli = 26.375%), €1,000
                annual allowance. Realized losses offset gains (tax-loss harvesting).
              </p>
            </div>

            {currentYearTax && (
              <div className="grid grid-cols-2 gap-px bg-zinc-100 sm:grid-cols-4 dark:bg-zinc-800">
                <div className="bg-white px-4 py-3 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Realized Gains {currentYearTax.year}</p>
                  <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                    {fmt(currentYearTax.realizedGains)}
                  </p>
                </div>
                <div className="bg-white px-4 py-3 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Harvested Losses</p>
                  <p className="text-base font-semibold text-red-600 dark:text-red-400">
                    {fmt(currentYearTax.realizedLosses)}
                  </p>
                </div>
                <div className="bg-white px-4 py-3 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Net Realized</p>
                  <p
                    className={`text-base font-semibold ${
                      currentYearTax.netRealized >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {fmt(currentYearTax.netRealized)}
                  </p>
                </div>
                <div className="bg-white px-4 py-3 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Est. Tax Owed</p>
                  <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {fmt(currentYearTax.tax)}
                  </p>
                </div>
              </div>
            )}

            {currentYearTax && (
              <div className="border-t border-zinc-100 px-6 py-4 text-sm dark:border-zinc-800">
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500 dark:text-zinc-400">Net realized gains</span>
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {fmt(Math.max(0, currentYearTax.netRealized))}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Tax-free allowance applied (of {fmt(currentYearTax.allowance)})
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    −{fmt(currentYearTax.allowanceApplied)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-zinc-100 py-1 pt-2 dark:border-zinc-800">
                  <span className="text-zinc-700 dark:text-zinc-300">Taxable amount</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(currentYearTax.taxableAmount)}</span>
                </div>
                <div className="flex justify-between py-1 font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">Estimated tax @ 26.375%</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{fmt(currentYearTax.tax)}</span>
                </div>
              </div>
            )}

            {/* Per-year breakdown when more than one year of sells exists */}
            {taxByYear.length > 1 && (
              <div className="overflow-x-auto border-t border-zinc-100 dark:border-zinc-800">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400">
                      <th className="px-6 py-2 font-medium">Year</th>
                      <th className="px-3 py-2 text-right font-medium">Gains</th>
                      <th className="px-3 py-2 text-right font-medium">Losses</th>
                      <th className="px-3 py-2 text-right font-medium">Net</th>
                      <th className="px-3 py-2 text-right font-medium">Taxable</th>
                      <th className="px-6 py-2 text-right font-medium">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxByYear.map((ty) => (
                      <tr key={ty.year} className="border-t border-zinc-50 dark:border-zinc-800/50">
                        <td className="px-6 py-2 text-zinc-700 dark:text-zinc-300">{ty.year}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{fmt(ty.realizedGains)}</td>
                        <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{fmt(ty.realizedLosses)}</td>
                        <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{fmt(ty.netRealized)}</td>
                        <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">{fmt(ty.taxableAmount)}</td>
                        <td className="px-6 py-2 text-right font-medium text-zinc-900 dark:text-zinc-100">{fmt(ty.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                      <span className={t.tradeType === "sell" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                        {t.tradeType === "buy" ? "Buy" : "Sell"}
                      </span>{" "}
                      {t.shares}{" "}
                      <Link
                        href={`/stocks/${t.ticker}/valuation`}
                        className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {t.ticker}
                      </Link>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      <Link
                        href={`/stocks/${t.ticker}/valuation`}
                        className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                      >
                        {t.companyName}
                      </Link>{" "}
                      at {fmt(t.pricePerShare)}/share
                      {t.fees > 0 && ` + ${fmt(t.fees)} fees`}
                    </p>
                    {t.notes && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic mt-0.5">{t.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t.tradeType === "sell" ? "+" : "−"}{fmt(t.totalCost)}
                    </p>
                    {t.tradeType === "sell" && t.realizedGain !== null && (
                      <p
                        className={`text-xs ${
                          t.realizedGain >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {t.realizedGain >= 0 ? "gain" : "loss"} {fmt(t.realizedGain)}
                      </p>
                    )}
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

      {sellTarget && (
        <SimulateSellModal
          portfolioId={portfolio.id}
          feeModel={portfolio.feeModel as FeeModel}
          ticker={sellTarget.ticker}
          companyName={sellTarget.companyName}
          sharesHeld={sellTarget.shares}
          avgCostBasis={sellTarget.avgCostBasis}
          currentPrice={livePrices[sellTarget.ticker] ?? null}
          onClose={() => setSellTarget(null)}
          onDone={() => {
            setLoading(true);
            loadData();
          }}
        />
      )}

      {showAddCash && (
        <AddCashModal
          portfolioId={portfolio.id}
          portfolioName={portfolio.name}
          cashRemaining={summary.cashRemaining}
          onClose={() => setShowAddCash(false)}
          onDone={() => {
            setLoading(true);
            loadData();
          }}
        />
      )}
    </div>
  );
}
