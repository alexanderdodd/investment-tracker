"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatMoney } from "@/lib/currency";

// Phil Town's "three tools" (Rule #1) with his configurations:
//   MACD 8-17-9, Stochastic 14-5-5, Simple Moving Average 10.
// They're a TIMING overlay — only act on a wonderful company already at/below
// its Margin of Safety. When all three arrows agree, the "big money" is moving.
const MACD_FAST = 8;
const MACD_SLOW = 17;
const MACD_SIGNAL = 9;
const STOCH_PERIOD = 14;
const STOCH_K = 5;
const STOCH_D = 5;
const SMA_PERIOD = 10;
// Daily bars shown in the charts (indicators are computed over the full year).
const VIEW_BARS = 160;

interface ChartPoint {
  ts: number;
  close: number;
  high?: number;
  low?: number;
}

type Num = number | null;

/** EMA aligned to input, seeded with the SMA of the first `period` values. */
function emaSeries(vals: Num[], period: number): Num[] {
  const out: Num[] = new Array(vals.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v === null) continue;
    if (prev === null) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Simple moving average aligned to input (last `period` non-null values). */
function smaSeries(vals: Num[], period: number): Num[] {
  const out: Num[] = new Array(vals.length).fill(null);
  const buf: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v === null) {
      out[i] = null;
      continue;
    }
    buf.push(v);
    if (buf.length > period) buf.shift();
    if (buf.length === period) out[i] = buf.reduce((a, b) => a + b, 0) / period;
  }
  return out;
}

interface Series {
  sma: Num[];
  macd: Num[];
  signal: Num[];
  hist: Num[];
  k: Num[];
  d: Num[];
}

function computeSeries(points: ChartPoint[]): Series {
  const close = points.map((p) => p.close as Num);
  const high = points.map((p) => (p.high ?? p.close) as Num);
  const low = points.map((p) => (p.low ?? p.close) as Num);

  // MACD 8-17-9
  const emaFast = emaSeries(close, MACD_FAST);
  const emaSlow = emaSeries(close, MACD_SLOW);
  const macd: Num[] = close.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const signal = emaSeries(macd, MACD_SIGNAL);
  const hist: Num[] = macd.map((m, i) =>
    m !== null && signal[i] !== null ? m - (signal[i] as number) : null
  );

  // Stochastic 14-5-5 (slowed): rawK → %K (SMA 5) → %D (SMA 5)
  const rawK: Num[] = close.map((c, i) => {
    if (c === null || i < STOCH_PERIOD - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - STOCH_PERIOD + 1; j <= i; j++) {
      const h = high[j];
      const l = low[j];
      if (h !== null && h > hi) hi = h;
      if (l !== null && l < lo) lo = l;
    }
    if (!isFinite(hi) || !isFinite(lo) || hi === lo) return 50;
    return (100 * ((c as number) - lo)) / (hi - lo);
  });
  const k = smaSeries(rawK, STOCH_K);
  const d = smaSeries(k, STOCH_D);

  return { sma: smaSeries(close, SMA_PERIOD), macd, signal, hist, k, d };
}

type Arrow = "green" | "red" | null;

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface FetchResult {
  ticker: string;
  points: ChartPoint[];
  currency: string;
  error: string | null;
}

export function TechnicalTab({ ticker, currency }: { ticker: string; currency?: string | null }) {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/price?chart=true&range=1y`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (${r.status})`))))
      .then((json) => {
        if (cancelled) return;
        setResult({
          ticker,
          points: (json.chart ?? []).filter((p: ChartPoint) => typeof p.close === "number"),
          currency: json.currency ?? currency ?? "USD",
          error: null,
        });
      })
      .catch((e) => {
        if (!cancelled) setResult({ ticker, points: [], currency: currency ?? "USD", error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, currency]);

  const loading = result?.ticker !== ticker;
  const points = useMemo(() => result?.points ?? [], [result]);
  const series = useMemo(() => (points.length > 0 ? computeSeries(points) : null), [points]);
  const cur = result?.currency ?? currency ?? "USD";

  // Latest reading for the arrows
  const L = points.length - 1;
  const arrows = useMemo(() => {
    if (!series || L < 0) return null;
    const macd = series.macd[L];
    const signal = series.signal[L];
    const k = series.k[L];
    const d = series.d[L];
    const sma = series.sma[L];
    const smaPrev = series.sma[L - 1];
    const price = points[L]?.close ?? null;
    if (macd === null || signal === null || k === null || d === null || sma === null || price === null) {
      return null;
    }
    const macdArrow: Arrow = macd > signal ? "green" : "red";
    const stochArrow: Arrow = k > d ? "green" : "red";
    // Town's MA tool: price above a rising 10-SMA
    const maArrow: Arrow = price > sma && (smaPrev === null || sma >= smaPrev) ? "green" : "red";
    return { macdArrow, stochArrow, maArrow, macd, signal, k, d, sma, price };
  }, [series, L, points]);

  // Chart rows (recent window; indicators already computed over the full year)
  const rows = useMemo(() => {
    if (!series) return [];
    const start = Math.max(0, points.length - VIEW_BARS);
    return points.slice(start).map((p, idx) => {
      const i = start + idx;
      return {
        date: fmtDate(p.ts),
        close: p.close,
        sma: series.sma[i],
        macd: series.macd[i],
        signal: series.signal[i],
        hist: series.hist[i],
        k: series.k[i],
        d: series.d[i],
      };
    });
  }, [series, points]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (result?.error || points.length === 0 || !arrows) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">Technical analysis isn&apos;t available for {ticker}.</p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {result?.error ?? "Not enough daily price history to compute the indicators."}
        </p>
      </div>
    );
  }

  const greens = [arrows.macdArrow, arrows.stochArrow, arrows.maArrow].filter((a) => a === "green").length;
  const verdict =
    greens === 3
      ? { label: "All three green — Rule #1 buy timing", color: "text-emerald-600 dark:text-emerald-400", badge: "border-emerald-500/40 bg-emerald-500/10" }
      : greens === 0
        ? { label: "All three red — distribution, stay out / sell", color: "text-red-600 dark:text-red-400", badge: "border-red-500/40 bg-red-500/10" }
        : { label: "Mixed — no clear signal, wait for the arrows to align", color: "text-amber-600 dark:text-amber-400", badge: "border-amber-500/40 bg-amber-500/10" };

  return (
    <div className="space-y-6">
      {/* Verdict + three arrows */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              The Three Tools <span className="font-normal text-zinc-400 dark:text-zinc-500">— Rule #1 timing (daily)</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              MACD {MACD_FAST}-{MACD_SLOW}-{MACD_SIGNAL} · Stochastic {STOCH_PERIOD}-{STOCH_K}-{STOCH_D} · {SMA_PERIOD}-day MA
            </p>
          </div>
          <div className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${verdict.badge} ${verdict.color}`}>
            {verdict.label}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ArrowChip
            name="MACD"
            arrow={arrows.macdArrow}
            detail={arrows.macdArrow === "green" ? "MACD above signal" : "MACD below signal"}
            values={`${arrows.macd.toFixed(2)} vs ${arrows.signal.toFixed(2)}`}
          />
          <ArrowChip
            name="Stochastic"
            arrow={arrows.stochArrow}
            detail={arrows.stochArrow === "green" ? "%K above %D" : "%K below %D"}
            values={`%K ${arrows.k.toFixed(0)} · %D ${arrows.d.toFixed(0)}`}
          />
          <ArrowChip
            name={`${SMA_PERIOD}-day MA`}
            arrow={arrows.maArrow}
            detail={arrows.maArrow === "green" ? "Price above rising MA" : "Price below MA"}
            values={`${formatMoney(arrows.price, cur)} vs ${formatMoney(arrows.sma, cur)}`}
          />
        </div>
        <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          Timing only. Phil Town uses these to decide <em>when</em> to act on a company he&apos;s already
          confirmed is wonderful and trading at or below its Margin of Safety — never as a standalone
          buy signal. Green arrows suggest institutions are accumulating; red, distributing.
        </p>
      </div>

      {/* Price + 10-day MA */}
      <ChartCard title="Price & 10-day moving average">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatMoney(v, cur, { maximumFractionDigits: v >= 100 ? 0 : 2 })}
            />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown, name: unknown) => [formatMoney(Number(v), cur), name === "sma" ? "10-day MA" : "Price"]}
            />
            <Line type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sma" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* MACD 8-17-9 */}
      <ChartCard title={`MACD (${MACD_FAST}, ${MACD_SLOW}, ${MACD_SIGNAL})`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown, name: unknown) => [Number(v).toFixed(2), String(name)]}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeWidth={1} />
            <Bar dataKey="hist" name="Histogram" fill="#71717a" opacity={0.5} />
            <Line type="monotone" dataKey="macd" name="MACD" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="signal" name="Signal" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Stochastic 14-5-5 */}
      <ChartCard title={`Stochastic (${STOCH_PERIOD}, ${STOCH_K}, ${STOCH_D})`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={{ fontSize: 10, fill: "#a1a1aa" }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown, name: unknown) => [Number(v).toFixed(1), String(name)]}
            />
            <ReferenceLine y={80} stroke="#71717a" strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke="#71717a" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="k" name="%K" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="d" name="%D" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Indicators computed from ~1 year of daily closes (Yahoo Finance), split-adjusted. MACD and
        Stochastic use crossovers; the moving-average arrow checks price against a rising 10-day SMA.
        These are the settings Phil Town specifies in <em>Rule #1</em>.
      </p>
    </div>
  );
}

function ArrowChip({ name, arrow, detail, values }: { name: string; arrow: Arrow; detail: string; values: string }) {
  const green = arrow === "green";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        green ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <span className={`text-2xl leading-none ${green ? "text-emerald-500" : "text-red-500"}`}>
        {green ? "▲" : "▼"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{name}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{values}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-2 px-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
      <div className="h-52">{children}</div>
    </div>
  );
}
