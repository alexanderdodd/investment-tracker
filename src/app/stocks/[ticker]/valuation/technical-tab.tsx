"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { computeSticker, defaultGrowthRate } from "@/lib/rule-one";

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
// Selectable look-back windows. All use daily bars so the daily-tuned Rule #1
// indicators stay comparable across periods. We always fetch 2 years of daily
// closes (FETCH_RANGE) and compute indicators over the whole series, then slice
// the view to the chosen window — so the left edge is always "warm" and the
// period switch is instant (no refetch).
const RANGES = ["3M", "6M", "1Y", "2Y"] as const;
type RangeKey = (typeof RANGES)[number];
const RANGE_DAYS: Record<RangeKey, number> = { "3M": 63, "6M": 126, "1Y": 252, "2Y": 504 };
const FETCH_RANGE = "2y";

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

/** The three Rule #1 signals + values as of a single bar (for the top metrics). */
interface Reading {
  macdArrow: Arrow;
  stochArrow: Arrow;
  maArrow: Arrow;
  macd: number;
  signal: number;
  k: number;
  d: number;
  sma: number;
  price: number;
  change: number | null;
  date: string;
}

/** Compute the buy/sell reading at a given bar index (null if indicators warming). */
function readingAt(rows: Row[], i: number): Reading | null {
  const r = rows[i];
  if (!r) return null;
  const { close, sma, macd, signal, k, d } = r;
  if (macd == null || signal == null || k == null || d == null || sma == null) return null;
  const prev = rows[i - 1];
  const smaPrev = prev?.sma ?? null;
  const closePrev = prev?.close ?? null;
  const macdArrow: Arrow = macd > signal ? "green" : "red";
  const stochArrow: Arrow = k > d ? "green" : "red";
  const maArrow: Arrow = close > sma && (smaPrev == null || sma >= smaPrev) ? "green" : "red";
  const change = closePrev ? ((close - closePrev) / closePrev) * 100 : null;
  return { macdArrow, stochArrow, maArrow, macd, signal, k, d, sma, price: close, change, date: r.date };
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

interface TipItem {
  text: string;
  color: string;
  value: string;
}
interface TipPayload {
  dataKey?: string | number;
  value?: number | null;
  color?: string;
  name?: string;
}

/** Color-coded tooltip: a swatch per series matching the line/bar color. */
function ChartTooltip({
  active,
  payload,
  label,
  paper,
  border,
  ink,
  resolve,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
  paper: string;
  border: string;
  ink: string;
  resolve: (p: TipPayload) => TipItem | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const items = payload.map(resolve).filter((it): it is TipItem => it !== null);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        background: paper,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        fontSize: 12,
      }}
    >
      <div style={{ color: ink, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: "18px" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color, flex: "0 0 auto" }} />
          <span style={{ color: ink }}>
            {it.text}: <span style={{ fontWeight: 600 }}>{it.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
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

// Minimal shape of the sticker-price API needed to recompute the sticker here.
interface StickerInputs {
  available: boolean;
  eps: number | null;
  analystGrowth: number | null;
  equityGrowth: { value: number } | null;
  historicalHighPe: number | null;
}

export function TechnicalTab({
  ticker,
  currency,
  livePrice,
}: {
  ticker: string;
  currency?: string | null;
  livePrice?: { price: number; previousClose: number | null } | null;
}) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  // Bar index currently hovered on any chart — drives the top metrics.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Recharts fires this per hovered bar (shared across the synced charts).
  // activeTooltipIndex can be a number or a numeric string depending on version.
  const onChartMove = useCallback((state: unknown) => {
    const raw = (state as { activeTooltipIndex?: number | string | null } | null)?.activeTooltipIndex;
    const n = typeof raw === "string" ? Number(raw) : raw;
    const next = typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
    setHoverIndex((prev) => (prev === next ? prev : next));
  }, []);
  const onChartLeave = useCallback(() => setHoverIndex(null), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/price?chart=true&range=${FETCH_RANGE}`)
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

  // Our calculated Rule #1 sticker price (fair value) + margin-of-safety buy price.
  const [sticker, setSticker] = useState<StickerInputs | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/sticker-price`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setSticker(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticker]);
  const stickerCalc = useMemo(() => {
    if (!sticker || !sticker.available) return null;
    const g = defaultGrowthRate(sticker.equityGrowth?.value, sticker.analystGrowth);
    return computeSticker(sticker.eps, g, sticker.historicalHighPe);
  }, [sticker]);

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

  // Chart rows (selected window; indicators already computed over the full series)
  const rows = useMemo<Row[]>(() => {
    if (!series) return [];
    const start = Math.max(0, points.length - RANGE_DAYS[range]);
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
  }, [series, points, range]);

  // Theme-aware ink/paper for the book-style annotations & chart chrome.
  const isDark = useIsDark();
  const axisTick = isDark ? "#a1a1aa" : "#71717a";
  const ink = isDark ? "#e4e4e7" : "#27272a";
  const paper = isDark ? "#18181b" : "#ffffff";
  const border = isDark ? "#3f3f46" : "#d4d4d8";
  const gridStroke = isDark ? "rgba(161,161,170,0.18)" : "rgba(63,63,70,0.14)";
  const plotFill = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)";

  // Crossover markers (book-style arrows) — the most recent cross per panel.
  const markers = useMemo(() => {
    if (rows.length < 2) return null;
    const last = rows.length - 1;
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

  const latestReading = readingAt(rows, rows.length - 1);

  if (result?.error || points.length === 0 || !arrows || !latestReading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">Technical analysis isn&apos;t available for {ticker}.</p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {result?.error ?? "Not enough daily price history to compute the indicators."}
        </p>
      </div>
    );
  }

  // Top metrics reflect the hovered bar (if any), else the latest reading.
  const hoverReading = hoverIndex != null ? readingAt(rows, hoverIndex) : null;
  const active = hoverReading ?? latestReading;
  const isHover = hoverReading != null;

  const greens = [active.macdArrow, active.stochArrow, active.maArrow].filter((a) => a === "green").length;
  const verdict =
    greens === 3
      ? { title: "All three green", desc: "Rule #1 buy timing — the big money is moving in", color: "text-emerald-600 dark:text-emerald-400", badge: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-500" }
      : greens === 0
        ? { title: "All three red", desc: "Distribution — stay out or sell into strength", color: "text-red-600 dark:text-red-400", badge: "border-red-500/40 bg-red-500/10", dot: "bg-red-500" }
        : { title: "Mixed signal", desc: "Wait for the arrows to align before acting", color: "text-amber-600 dark:text-amber-400", badge: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-500" };

  // Price stats over the selected window (from the viewed rows).
  const viewCloses = rows.map((r) => r.close);
  const hiView = viewCloses.length ? Math.max(...viewCloses) : null;
  const loView = viewCloses.length ? Math.min(...viewCloses) : null;
  const firstClose = viewCloses[0] ?? null;
  const lastClose = viewCloses[viewCloses.length - 1] ?? null;
  const periodChange = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const periodUp = (periodChange ?? 0) >= 0;
  const priceLineColor = periodUp ? "#22c55e" : "#ef4444";
  // Day change / headline price: prefer the live quote (matches the page header);
  // fall back to the last two daily closes of the full series.
  const allCloses = points.map((p) => p.close);
  const seriesPrev = allCloses.length > 1 ? allCloses[allCloses.length - 2] : null;
  const headlinePrice = livePrice?.price ?? lastClose;
  const headlinePrev = livePrice?.previousClose ?? seriesPrev;
  const dayChange = headlinePrev && headlinePrice ? ((headlinePrice - headlinePrev) / headlinePrev) * 100 : null;
  // Banner price/change: hovered bar when scrubbing, else the live/latest quote.
  const bannerPrice = isHover ? active.price : headlinePrice;
  const bannerChange = isHover ? active.change : dayChange;
  const bannerUp = (bannerChange ?? 0) >= 0;
  const bannerWhen = isHover ? active.date : "today";

  return (
    <div className="space-y-5">
      {/* Dashboard controls: timeframe selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Technical dashboard <span className="font-normal text-zinc-400 dark:text-zinc-500">— Rule #1 timing tools</span>
        </p>
        <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setHoverIndex(null); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard summary: verdict + live price */}
      <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-4 ${verdict.badge}`}>
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${verdict.dot}`} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Rule #1 timing · {greens}/3 tools bullish{isHover && <span className="text-zinc-400 dark:text-zinc-500"> · as of {active.date}</span>}
            </p>
            <p className={`text-base font-bold ${verdict.color}`}>{verdict.title}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{verdict.desc}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(bannerPrice, cur)}</p>
          {bannerChange !== null && (
            <p className={`text-sm font-medium ${bannerUp ? "text-emerald-500" : "text-red-500"}`}>
              {bannerUp ? "+" : ""}{bannerChange.toFixed(2)}% <span className="font-normal text-zinc-400 dark:text-zinc-500">{bannerWhen}</span>
            </p>
          )}
        </div>
      </div>

      {/* Signal tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ArrowChip
          name="MACD"
          sub={`${MACD_FAST}-${MACD_SLOW}-${MACD_SIGNAL}`}
          arrow={active.macdArrow}
          detail={active.macdArrow === "green" ? "MACD above signal" : "MACD below signal"}
          values={`${active.macd.toFixed(2)} vs ${active.signal.toFixed(2)}`}
        />
        <ArrowChip
          name="Stochastic"
          sub={`${STOCH_PERIOD}-${STOCH_K}-${STOCH_D}`}
          arrow={active.stochArrow}
          detail={active.stochArrow === "green" ? "%K above %D" : "%K below %D"}
          values={`%K ${active.k.toFixed(0)} · %D ${active.d.toFixed(0)}`}
        />
        <ArrowChip
          name={`${SMA_PERIOD}-day MA`}
          sub="Trend"
          arrow={active.maArrow}
          detail={active.maArrow === "green" ? "Price above rising MA" : "Price below MA"}
          values={`${formatMoney(active.price, cur)} vs ${formatMoney(active.sma, cur)}`}
        />
      </div>

      {/* Chart dashboard: 2×2 grid — price | MA over MACD | Stochastic */}
      <div className="grid gap-5 lg:grid-cols-2">
      {/* Dedicated stock price chart + period context */}
      <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 px-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{ticker}</p>
          <p className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Stock Price</p>
        </div>
        <div className="min-h-[18rem] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} syncId="tech-dash" onMouseMove={onChartMove} onMouseLeave={onChartLeave} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
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
                content={
                  <ChartTooltip
                    paper={paper}
                    border={border}
                    ink={ink}
                    resolve={(p) =>
                      p.value == null ? null : { text: "Stock price", color: priceLineColor, value: formatMoney(Number(p.value), cur) }
                    }
                  />
                }
              />
              {hiView !== null && <ReferenceLine y={hiView} stroke={axisTick} strokeDasharray="2 5" strokeOpacity={0.5} />}
              {loView !== null && <ReferenceLine y={loView} stroke={axisTick} strokeDasharray="2 5" strokeOpacity={0.5} />}
              <Line type="monotone" dataKey="close" stroke={priceLineColor} strokeWidth={2} dot={false} />
              {stickerCalc && (
                <ReferenceLine
                  y={stickerCalc.sticker}
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                  label={{ value: `Sticker ${formatMoney(stickerCalc.sticker, cur)}`, position: "insideTopLeft", fill: "#a855f7", fontSize: 10, fontWeight: 600 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell label="Current" value={formatMoney(headlinePrice, cur)} />
          <StatCell label={`${range} High`} value={formatMoney(hiView, cur)} />
          <StatCell label={`${range} Low`} value={formatMoney(loView, cur)} />
          <StatCell
            label={`${range} Change`}
            value={periodChange === null ? "—" : `${periodUp ? "+" : ""}${periodChange.toFixed(1)}%`}
            color={periodChange === null ? undefined : periodUp ? "green" : "red"}
          />
        </div>
      </div>

      {/* Moving average and price history (price vs 10-day MA + crossover) */}
      <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 px-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{ticker}</p>
          <p className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">Moving Average and Price History</p>
        </div>
        <div className="min-h-[18rem] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} syncId="tech-dash" onMouseMove={onChartMove} onMouseLeave={onChartLeave} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
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
                content={
                  <ChartTooltip
                    paper={paper}
                    border={border}
                    ink={ink}
                    resolve={(p) =>
                      p.value == null
                        ? null
                        : p.dataKey === "sma"
                          ? { text: "Moving average", color: COL.ma, value: formatMoney(Number(p.value), cur) }
                          : { text: "Stock price", color: COL.price, value: formatMoney(Number(p.value), cur) }
                    }
                  />
                }
              />
              <Line type="monotone" dataKey="close" stroke={COL.price} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sma" stroke={COL.ma} strokeWidth={1.5} dot={false} connectNulls />
              {markers && (
                <ReferenceDot x={markers.price.date} y={markers.price.y} r={0} shape={triangleShape(markers.price.dir, markers.price.dir === "up" ? COL.up : COL.down)} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MACD 8-17-9 — histogram (book layout) */}
      <ChartCard title="MACD" subtitle={`(${MACD_FAST}, ${MACD_SLOW}, ${MACD_SIGNAL})`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} syncId="tech-dash" onMouseMove={onChartMove} onMouseLeave={onChartLeave} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={gridStroke} fill={plotFill} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} width={56} />
            <Tooltip
              content={
                <ChartTooltip
                  paper={paper}
                  border={border}
                  ink={ink}
                  resolve={(p) =>
                    p.value == null
                      ? null
                      : { text: "Histogram", color: Number(p.value) >= 0 ? COL.up : COL.down, value: Number(p.value).toFixed(2) }
                  }
                />
              }
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
          <LineChart data={rows} syncId="tech-dash" onMouseMove={onChartMove} onMouseLeave={onChartLeave} margin={{ top: 10, right: 18, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={gridStroke} fill={plotFill} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} minTickGap={40} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 50, 80, 100]} tick={{ fontSize: 10, fill: axisTick }} tickLine={false} axisLine={{ stroke: border }} width={56} />
            <Tooltip
              content={
                <ChartTooltip
                  paper={paper}
                  border={border}
                  ink={ink}
                  resolve={(p) =>
                    p.value == null
                      ? null
                      : p.dataKey === "k"
                        ? { text: "Buy line (%K)", color: COL.k, value: Number(p.value).toFixed(1) }
                        : { text: "Sell line (%D)", color: COL.d, value: Number(p.value).toFixed(1) }
                  }
                />
              }
            />
            <ReferenceLine y={80} stroke={border} strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke={border} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="k" name="%K" stroke={COL.k} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="d" name="%D" stroke={COL.d} strokeWidth={1.5} dot={false} connectNulls />
            {markers && (
              <ReferenceDot x={markers.stoch.date} y={markers.stoch.y} r={0} shape={triangleShape(markers.stoch.dir, markers.stoch.dir === "up" ? COL.up : COL.down)} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Indicators computed from ~2 years of daily closes (Yahoo Finance), split-adjusted, and shown for the
        selected window. Hover any panel to compare the same date across every chart. The triangle marks the
        most recent crossover — ▲ green for a bullish cross, ▼ red for bearish. MACD is shown as its histogram
        (MACD − signal); the moving-average arrow checks price against a rising 10-day SMA. Timing only — Phil
        Town uses these to decide <em>when</em> to act on a wonderful company already trading at or below its
        Margin of Safety, never as a standalone buy signal.
      </p>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${
        color === "green" ? "text-emerald-500" : color === "red" ? "text-red-500" : "text-zinc-900 dark:text-zinc-100"
      }`}>
        {value}
      </p>
    </div>
  );
}

function ArrowChip({ name, sub, arrow, detail, values }: { name: string; sub?: string; arrow: Arrow; detail: string; values: string }) {
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
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {name}
          {sub && <span className="ml-1.5 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">{sub}</span>}
        </p>
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
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 px-2">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{eyebrow}</p>
        )}
        <p className="text-sm font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
          {title}
          {subtitle && <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-400 dark:text-zinc-500">{subtitle}</span>}
        </p>
      </div>
      <div className="min-h-[16rem] flex-1">{children}</div>
    </div>
  );
}
