"use client";

import { useEffect, useMemo, useState } from "react";
import { MetricTooltip } from "@/components/metric-tooltip";
import {
  PROJECTION_YEARS,
  MINIMUM_RETURN,
  DISCOUNT_FACTOR,
  defaultGrowthRate,
  computeSticker,
} from "@/lib/rule-one";

interface YearlyPe {
  fiscalYear: number;
  eps: number;
  highPrice: number;
  highPe: number;
}

interface StickerInputs {
  ticker: string;
  companyName: string | null;
  available: boolean;
  unavailableReason: string | null;
  currentPrice: number | null;
  eps: number | null;
  epsSource: "yahoo-ttm" | "sec-fiscal-year" | null;
  epsFiscalYear: number | null;
  analystGrowth: number | null;
  analystGrowthPeriod: "5y" | "1y" | null;
  equityGrowth: { value: number; spanYears: number } | null;
  historicalHighPe: number | null;
  peYearsUsed: YearlyPe[];
}

function fmtMoney(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number | null): string {
  if (v === null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

interface FetchResult {
  ticker: string;
  data: StickerInputs | null;
  error: string | null;
}

export function StickerPriceTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  // Growth override: empty string means "use the computed default"
  const [growthInput, setGrowthInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/sticker-price`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setResult({ ticker, data: json, error: null });
      })
      .catch((e) => {
        if (!cancelled) setResult({ ticker, data: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const loading = result?.ticker !== ticker;
  const data = loading ? null : result!.data;
  const error = loading ? null : result!.error;

  // Rule #1: use the LOWER of your own estimate (historical equity growth)
  // and the analyst estimate
  const defaultGrowth = useMemo(
    () => (data ? defaultGrowthRate(data.equityGrowth?.value, data.analystGrowth) : null),
    [data]
  );

  const overridden = growthInput.trim() !== "";
  const growth = overridden ? parseFloat(growthInput) / 100 : defaultGrowth;

  const calc = useMemo(
    () => (data ? computeSticker(data.eps, growth, data.historicalHighPe) : null),
    [data, growth]
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-96 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-6 py-10 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        Couldn&apos;t load sticker price inputs: {error}
      </div>
    );
  }

  if (!data || !data.available) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">
          Sticker price isn&apos;t available for {ticker}.
        </p>
        {data?.unavailableReason && (
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {data.unavailableReason}
          </p>
        )}
      </div>
    );
  }

  const price = data.currentPrice;
  const verdict =
    calc && price !== null
      ? price <= calc.mos
        ? { label: "On sale — below MOS price", color: "text-emerald-600 dark:text-emerald-400", badge: "border-emerald-500/40 bg-emerald-500/10" }
        : price <= calc.sticker
          ? { label: "Below sticker, above MOS", color: "text-amber-600 dark:text-amber-400", badge: "border-amber-500/40 bg-amber-500/10" }
          : { label: "Above sticker price", color: "text-red-600 dark:text-red-400", badge: "border-red-500/40 bg-red-500/10" }
      : null;

  const discountVsSticker =
    calc && price !== null ? 1 - price / calc.sticker : null;

  const rows: {
    step: string;
    label: string;
    tooltip: string;
    value: React.ReactNode;
    note?: string;
    emphasize?: boolean;
  }[] = [
    {
      step: "1",
      label: "Current EPS",
      tooltip: "Trailing-twelve-month diluted earnings per share — the starting point of the projection.",
      value: fmtMoney(data.eps),
      note:
        data.epsSource === "yahoo-ttm"
          ? "TTM"
          : data.epsFiscalYear
            ? `FY${data.epsFiscalYear} (SEC)`
            : undefined,
    },
    {
      step: "2a",
      label: "Equity (BV) growth",
      tooltip: "Historical book-value growth from SEC filings — Town's preferred basis for your own EPS growth estimate.",
      value: fmtPct(data.equityGrowth?.value ?? null),
      note: data.equityGrowth ? `${data.equityGrowth.spanYears}y CAGR` : undefined,
    },
    {
      step: "2b",
      label: "Analyst estimate",
      tooltip: "Consensus analyst EPS growth estimate from Yahoo Finance. Yahoo no longer publishes the 5-year series for most tickers, so this is usually the next-fiscal-year estimate.",
      value: fmtPct(data.analystGrowth),
      note: data.analystGrowthPeriod === "5y" ? "5y consensus" : data.analystGrowthPeriod === "1y" ? "next FY" : undefined,
    },
    {
      step: "2",
      label: "Growth rate used",
      tooltip: "Rule #1 takes the LOWER of your own estimate and the analyst estimate. Override it to test your own assumption.",
      value: (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="number"
            value={overridden ? growthInput : defaultGrowth !== null ? (defaultGrowth * 100).toFixed(1) : ""}
            onChange={(e) => setGrowthInput(e.target.value)}
            step="0.5"
            className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <span className="text-zinc-500 dark:text-zinc-400">%</span>
          {overridden && (
            <button
              onClick={() => setGrowthInput("")}
              className="text-xs text-blue-500 hover:underline dark:text-blue-400"
            >
              reset
            </button>
          )}
        </span>
      ),
      note: overridden ? "custom" : "lower of 2a / 2b",
      emphasize: true,
    },
    {
      step: "3",
      label: `EPS in ${PROJECTION_YEARS} years`,
      tooltip: `Current EPS compounded at the growth rate for ${PROJECTION_YEARS} years.`,
      value: fmtMoney(calc?.futureEps ?? null),
    },
    {
      step: "4a",
      label: "Default P/E (2 × growth)",
      tooltip: "Rule #1's default future P/E: twice the growth rate. A 15% grower gets a default P/E of 30.",
      value: calc ? calc.defaultPe.toFixed(1) : "—",
    },
    {
      step: "4b",
      label: "Historical high P/E",
      tooltip: `Median of each fiscal year's high price ÷ that year's diluted EPS, across ${data.peYearsUsed.length} years of history.`,
      value: data.historicalHighPe !== null ? data.historicalHighPe.toFixed(1) : "—",
      note: data.peYearsUsed.length > 0 ? `${data.peYearsUsed.length}y median` : undefined,
    },
    {
      step: "4",
      label: "Future P/E used",
      tooltip: "The lower of the default P/E and the historical high P/E — the second layer of conservatism.",
      value: calc ? calc.futurePe.toFixed(1) : "—",
      note: "lower of 4a / 4b",
      emphasize: true,
    },
    {
      step: "5",
      label: `Price in ${PROJECTION_YEARS} years`,
      tooltip: "Future EPS × future P/E.",
      value: fmtMoney(calc?.futurePrice ?? null),
    },
    {
      step: "6",
      label: "Sticker price",
      tooltip: `The future price discounted back ${PROJECTION_YEARS} years at ${MINIMUM_RETURN * 100}%/yr (÷ ${DISCOUNT_FACTOR.toFixed(2)}) — Rule #1's fair value.`,
      value: fmtMoney(calc?.sticker ?? null),
      emphasize: true,
    },
    {
      step: "7",
      label: "Margin of Safety price",
      tooltip: "Half the sticker price. Rule #1 only buys at or below this level.",
      value: fmtMoney(calc?.mos ?? null),
      emphasize: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Verdict */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Current price</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Sticker price</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(calc?.sticker ?? null)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">MOS buy price</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {fmtMoney(calc?.mos ?? null)}
              </p>
            </div>
          </div>
          {verdict && (
            <div className={`rounded-full border px-4 py-1.5 text-sm font-medium ${verdict.badge} ${verdict.color}`}>
              {verdict.label}
            </div>
          )}
        </div>
        {discountVsSticker !== null && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Current price is{" "}
            <span className={discountVsSticker >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              {Math.abs(discountVsSticker * 100).toFixed(0)}% {discountVsSticker >= 0 ? "below" : "above"}
            </span>{" "}
            the sticker price.
          </p>
        )}
      </div>

      {/* Derivation table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Sticker price derivation
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Rule #1: project EPS {PROJECTION_YEARS} years out, apply a conservative P/E, discount
            back at {MINIMUM_RETURN * 100}%/yr, then demand a 50% margin of safety
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px]">
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.step + row.label}
                  className={`border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50 ${
                    row.emphasize ? "bg-zinc-50/60 dark:bg-zinc-800/30" : ""
                  }`}
                >
                  <td className="w-10 px-4 py-3 text-xs text-zinc-400 dark:text-zinc-500">
                    {row.step}
                  </td>
                  <td className="px-2 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <MetricTooltip label={row.label} description={row.tooltip}>
                      <span className={row.emphasize ? "font-medium text-zinc-900 dark:text-zinc-100" : ""}>
                        {row.label}
                      </span>
                    </MetricTooltip>
                  </td>
                  <td className={`px-4 py-3 text-right text-sm ${row.emphasize ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-800 dark:text-zinc-200"}`}>
                    {row.value}
                    {row.note && (
                      <span className="ml-1.5 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                        {row.note}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical P/E detail */}
      {data.peYearsUsed.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Historical high P/E by year
            </h3>
          </div>
          <div className="overflow-x-auto px-6 py-3">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
                  <th className="py-1 font-medium">FY</th>
                  <th className="py-1 text-right font-medium">High price</th>
                  <th className="py-1 text-right font-medium">EPS</th>
                  <th className="py-1 text-right font-medium">High P/E</th>
                </tr>
              </thead>
              <tbody>
                {[...data.peYearsUsed].reverse().map((y) => (
                  <tr key={y.fiscalYear} className="border-t border-zinc-50 text-xs dark:border-zinc-800/50">
                    <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{y.fiscalYear}</td>
                    <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-300">{fmtMoney(y.highPrice)}</td>
                    <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-300">{fmtMoney(y.eps)}</td>
                    <td className="py-1.5 text-right font-medium text-zinc-900 dark:text-zinc-100">{y.highPe.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Method: Phil Town&apos;s Rule #1. Growth rate = lower of historical equity growth (SEC
        filings) and the analyst consensus estimate; future P/E = lower of 2×growth and the
        historical high P/E; minimum acceptable return {MINIMUM_RETURN * 100}%/yr over{" "}
        {PROJECTION_YEARS} years; Margin of Safety = 50% of sticker. Estimates, not advice.
      </p>
    </div>
  );
}
