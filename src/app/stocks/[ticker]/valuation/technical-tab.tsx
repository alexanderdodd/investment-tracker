"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
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

// Line colors (kept from the app palette; the book uses ink/gray but we keep color).
const COL = {
  price: "#3b82f6", // stock price (blue)
  ma: "#f59e0b", // moving average (amber)
  k: "#3b82f6", // stochastic %K / "buy line"
  d: "#ef4444", // stochastic %D / "sell line"
  up: "#10b981", // bullish crossover marker
  down: "#ef4444", // bearish crossover marker
};

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

interface Row {
  date: string;
  close: number;
  sma: Num;
  macd: Num;
  signal: Num;
  hist: Num;
  k: Num;
  d: Num;
}

type Dir = "up" | "down";
interface Cross {
  index: number;
  dir: Dir;
}

/** Last point where (a − b) changes sign — a crossover, like the book's arrows. */
function lastCross(rows: Row[], a: keyof Row, b: keyof Row): Cross | null {
  let last: Cross | null = null;
  for (let i = 1; i < rows.length; i++) {
    const a0 = rows[i - 1][a] as Num, b0 = rows[i - 1][b] as Num;
    const a1 = rows[i][a] as Num, b1 = rows[i][b] as Num;
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    const d0 = a0 - b0, d1 = a1 - b1;
    if (d0 <= 0 && d1 > 0) last = { index: i, dir: "up" };
    else if (d0 >= 0 && d1 < 0) last = { index: i, dir: "down" };
  }
  return last;
}

/** Last point where a single series crosses zero (used for the MACD histogram). */
function lastZeroCross(rows: Row[], key: keyof Row): Cross | null {
  let last: Cross | null = null;
  for (let i = 1; i < rows.length; i++) {
    const v0 = rows[i - 1][key] as Num, v1 = rows[i][key] as Num;
    if (v0 === null || v1 === null) continue;
    if (v0 <= 0 && v1 > 0) last = { index: i, dir: "up" };
    else if (v0 >= 0 && v1 < 0) last = { index: i, dir: "down" };
  }
  return last;
}

type DotShapeProps = { cx?: number; cy?: number };

/** Filled triangle marker (▲/▼) for a ReferenceDot — flags the crossover. */
function triangleShape(dir: Dir, color: string) {
  const Marker = ({ cx, cy }: DotShapeProps) => {
    if (cx == null || cy == null) return <g />;
    const s = 7, gap = 9;
    const base = dir === "up" ? cy + gap + s * 1.5 : cy - gap - s * 1.5;
    const apex = dir === "up" ? base - s * 1.5 : base + s * 1.5;
    const d = `M ${cx} ${apex} L ${cx + s} ${base} L ${cx - s} ${base} Z`;
    return <path d={d} fill={color} stroke={color} strokeWidth={1} />;
  };
  Marker.displayName = "TriangleMarker";
  return Marker;
}

/** Book-style boxed callout with a leader line pointing at the series. */
function calloutShape(text: string, dir: Dir, ink: string, paper: string, border: string) {
  const Callout = ({ cx, cy }: DotShapeProps) => {
    if (cx == null || cy == null) return <g />;
    const fs = 10, padX = 7, h = fs + 8, lead = 18;
    const w = text.length * (fs * 0.6) + padX * 2;
    const bx = cx - w / 2;
    const by = dir === "up" ? cy - lead - h : cy + lead;
    const anchorY = dir === "up" ? by + h : by;
    return (
      <g pointerEvents="none">
        <line x1={cx} y1={cy} x2={cx} y2={anchorY} stroke={ink} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={2.5} fill={ink} />
        <rect x={bx} y={by} width={w} height={h} rx={3} fill={paper} stroke={border} strokeWidth={1} />
        <text x={cx} y={by + h / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={600} fill={ink}>
          {text}
        </text>
      </g>
    );
  };
  Callout.displayName = "ChartCallout";
  return Callout;
}

/** Reactive light/dark detection (app uses prefers-color-scheme, no class toggle). */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
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
  const rows = useMemo<Row[]>(() => {
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

  // Theme-aware ink/paper for the book-style annotations & chart chrome.
  const isDark = useIsDark();
  const axisTick = isDark ? "#a1a1aa" : "#71717a";
  const ink = isDark ? "#e4e4e7" : "#27272a";
  const paper = isDark ? "#18181b" : "#ffffff";
  const border = isDark ? "#3f3f46" : "#d4d4d8";
  const gridStroke = isDark ? "rgba(161,161,170,0.18)" : "rgba(63,63,70,0.14)";
  const plotFill = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)";
  const tooltipStyle = { background: paper, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, color: ink };

  // Crossover markers (book-style arrows) + callout anchor points.
  const markers = useMemo(() => {
    if (rows.length < 2) return null;
    const last = rows.length - 1;
    const pick = (f: number) => Math.min(last, Math.max(0, Math.floor(rows.length * f)));
    const priceC = lastCross(rows, "close", "sma");
    const macdC = lastZeroCross(rows, "hist");
    const stochC = lastCross(rows, "k", "d");
    const dir = (c: Cross | null, green: boolean): Dir => c?.dir ?? (green ? "up" : "down");
    const pIdx = priceC?.index ?? last;
    const mIdx = macdC?.index ?? last;
    const sIdx = stochC?.index ?? last;
    return {
      price: { date: rows[pIdx].date, y: rows[pIdx].close, dir: dir(priceC, arrows?.maArrow === "green") },
      macd: { date: rows[mIdx].date, y: 0, dir: dir(macdC, arrows?.macdArrow === "green") },
      stoch: { date: rows[sIdx].date, y: (rows[sIdx].k ?? 50) as number, dir: dir(stochC, arrows?.stochArrow === "green") },
      priceLabel: rows[pick(0.3)],
      maLabel: rows[pick(0.62)],
      kLabel: rows[pick(0.45)],
      dLabel: rows[pick(0.7)],
    };
  }, [rows, arrows]);

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

      {/* Moving average and price history */}
      <ChartCard eyebrow={ticker} title="Moving Average and Price History">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={gridStroke} fill={plotFill} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} minTickGap={40} />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: axisTick }}
              tickLine={false}
              axisLine={{ stroke: border }}
              width={56}
              tickFormatter={(v: number) => formatMoney(v, cur, { maximumFractionDigits: v >= 100 ? 0 : 2 })}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: unknown, name: unknown) => [formatMoney(Number(v), cur), name === "sma" ? "Moving average" : "Stock price"]}
            />
            <Line type="monotone" dataKey="close" stroke={COL.price} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sma" stroke={COL.ma} strokeWidth={1.5} dot={false} connectNulls />
            {markers && (
              <ReferenceDot x={markers.priceLabel.date} y={markers.priceLabel.close} r={0} shape={calloutShape("Stock price", "up", ink, paper, border)} />
            )}
            {markers && (
              <ReferenceDot x={markers.maLabel.date} y={(markers.maLabel.sma ?? markers.maLabel.close) as number} r={0} shape={calloutShape("Moving average", "down", ink, paper, border)} />
            )}
            {markers && (
              <ReferenceDot x={markers.price.date} y={markers.price.y} r={0} shape={triangleShape(markers.price.dir, markers.price.dir === "up" ? COL.up : COL.down)} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* MACD 8-17-9 — histogram (book layout) */}
      <ChartCard title="MACD" subtitle={`(${MACD_FAST}, ${MACD_SLOW}, ${MACD_SIGNAL})`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={gridStroke} fill={plotFill} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} width={56} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: unknown) => [Number(v).toFixed(2), "Histogram"]}
            />
            <ReferenceLine y={0} stroke={border} strokeWidth={1} />
            <Bar dataKey="hist" name="Histogram">
              {rows.map((r, i) => (
                <Cell key={i} fill={(r.hist ?? 0) >= 0 ? COL.up : COL.down} fillOpacity={0.5} />
              ))}
            </Bar>
            {markers && (
              <ReferenceDot x={markers.macd.date} y={markers.macd.y} r={0} shape={triangleShape(markers.macd.dir, markers.macd.dir === "up" ? COL.up : COL.down)} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Stochastic 14-5-5 */}
      <ChartCard title="Stochastic" subtitle={`(${STOCH_PERIOD}, ${STOCH_K}, ${STOCH_D})`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={gridStroke} fill={plotFill} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} minTickGap={40} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} width={56} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: unknown, name: unknown) => [Number(v).toFixed(1), name === "k" ? "Buy line (%K)" : "Sell line (%D)"]}
            />
            <ReferenceLine y={80} stroke={border} strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke={border} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="k" name="%K" stroke={COL.k} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="d" name="%D" stroke={COL.d} strokeWidth={1.5} dot={false} connectNulls />
            {markers && (
              <ReferenceDot x={markers.kLabel.date} y={(markers.kLabel.k ?? 50) as number} r={0} shape={calloutShape("Buy line", "up", ink, paper, border)} />
            )}
            {markers && (
              <ReferenceDot x={markers.dLabel.date} y={(markers.dLabel.d ?? 50) as number} r={0} shape={calloutShape("Sell line", "down", ink, paper, border)} />
            )}
            {markers && (
              <ReferenceDot x={markers.stoch.date} y={markers.stoch.y} r={0} shape={triangleShape(markers.stoch.dir, markers.stoch.dir === "up" ? COL.up : COL.down)} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Indicators computed from ~1 year of daily closes (Yahoo Finance), split-adjusted. The triangle on
        each panel marks the most recent crossover — ▲ green for a bullish cross, ▼ red for bearish. MACD is
        shown as its histogram (MACD − signal); the moving-average arrow checks price against a rising 10-day
        SMA. These are the settings Phil Town specifies in <em>Rule #1</em>.
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

function ChartCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 px-2">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{eyebrow}</p>
        )}
        <p className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
          {title}
          {subtitle && <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-400 dark:text-zinc-500">{subtitle}</span>}
        </p>
      </div>
      <div className="h-56">{children}</div>
    </div>
  );
}
