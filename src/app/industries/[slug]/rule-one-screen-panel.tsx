"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BigFive {
  roic: number | null;
  sales: number | null;
  eps: number | null;
  equity: number | null;
  fcf: number | null;
}

interface ScreenStock {
  ticker: string;
  companyName: string | null;
  bigFive: BigFive;
  bigFiveScore: number;
  passedBigFive: boolean;
  dataAvailable: boolean;
  currentPrice: number | null;
  sticker: number | null;
  mos: number | null;
  discountToSticker: number | null;
  verdict: "mos" | "sticker" | "above" | null;
  moat: { type: string; strength: string; rationale: string } | null;
  management: { sentiment: string; notes: string } | null;
}

interface ScreenResult {
  industryName: string;
  totalStocks: number;
  evaluated: number;
  passedBigFive: number;
  belowSticker: number;
  stocks: ScreenStock[];
}

const MOAT_LABELS: Record<string, string> = {
  brand: "Brand moat",
  secret: "Secrets moat",
  toll_bridge: "Toll-bridge moat",
  switching: "Switching moat",
  price: "Price moat",
  none: "No moat",
};

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toFixed(2)}`;
}

function bigFiveCellColor(v: number | null): string {
  if (v === null) return "text-zinc-400 dark:text-zinc-500";
  if (v >= 0.1) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 0.05) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function RuleOneScreenPanel({ slug }: { slug: string }) {
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/industries/${slug}/rule-one-screen`)
      .then((r) => r.json())
      .then((data) => {
        if (data.result) {
          setResult(data.result);
          setGeneratedAt(data.generatedAt ?? null);
        }
      })
      .catch(() => {});
  }, [slug]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setProgress("Starting…");
    try {
      const res = await fetch(`/api/industries/${slug}/rule-one-screen`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error(`Screen failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.trim().replace(/^data:\s*/, "");
          if (!line) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "progress") {
              setProgress(
                `Stage ${data.stage}/3 · ${data.message} (${data.done + 1}/${data.total})`
              );
            } else if (data.type === "complete") {
              setResult(data.result);
              setGeneratedAt(data.generatedAt ?? null);
            } else if (data.type === "error") {
              setError(data.error);
            }
          } catch {
            // partial frame — ignore
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const finalists = result?.stocks.filter((s) => s.moat !== null) ?? [];
  const passersOnly =
    result?.stocks.filter((s) => s.passedBigFive && s.moat === null) ?? [];
  const failed = result?.stocks.filter((s) => !s.passedBigFive) ?? [];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Rule #1 Screen
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Big Five → sticker price → moat &amp; management for the survivors
            {generatedAt &&
              ` · last run ${new Date(generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : result ? "Re-run screen" : "Run Rule #1 Screen"}
        </button>
      </div>

      {running && (
        <div className="border-b border-zinc-100 px-6 py-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{progress}</p>
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            First run on an industry fetches SEC history per stock and can take several
            minutes; re-runs are much faster.
          </p>
        </div>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {!result && !running && !error && (
        <p className="px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400">
          Not run yet for this industry. The screen evaluates every classified stock against
          the Big Five (≥3 of 5 at 10%/yr to pass), prices survivors against their sticker,
          and researches moat &amp; management for anything trading below fair value.
        </p>
      )}

      {result && (
        <div className="space-y-5 px-6 py-5">
          {/* Funnel */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {result.evaluated} evaluated
            </span>
            <span className="text-zinc-400">→</span>
            <span className="rounded-full bg-blue-500/10 px-3 py-1 font-medium text-blue-600 dark:text-blue-400">
              {result.passedBigFive} passed Big Five
            </span>
            <span className="text-zinc-400">→</span>
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                result.belowSticker > 0
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {result.belowSticker} below sticker
            </span>
          </div>

          {/* Finalist cards */}
          {finalists.map((s) => (
            <div
              key={s.ticker}
              className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] px-5 py-4 dark:bg-emerald-500/[0.06]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/stocks/${s.ticker}/valuation`} className="group">
                  <span className="text-base font-semibold text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400">
                    {s.ticker}
                  </span>
                  {s.companyName && (
                    <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {s.companyName}
                    </span>
                  )}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-medium ${
                      s.verdict === "mos"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {s.verdict === "mos" ? "Below MOS" : "Below sticker"}
                    {s.discountToSticker !== null &&
                      ` · ${(s.discountToSticker * 100).toFixed(0)}% off`}
                  </span>
                  {s.moat && (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-medium ${
                        s.moat.strength === "wide"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : s.moat.strength === "narrow"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "border-zinc-400/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {MOAT_LABELS[s.moat.type] ?? s.moat.type} ({s.moat.strength})
                    </span>
                  )}
                  {s.management && (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-medium ${
                        s.management.sentiment === "positive"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : s.management.sentiment === "negative"
                            ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                            : "border-zinc-400/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      Mgmt: {s.management.sentiment}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Price {fmtMoney(s.currentPrice)}</span>
                <span>Sticker {fmtMoney(s.sticker)}</span>
                <span>MOS {fmtMoney(s.mos)}</span>
                <span>Big Five {s.bigFiveScore}/5</span>
              </div>
              {s.moat?.rationale && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {s.moat.rationale}
                </p>
              )}
              {s.management?.notes && (
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {s.management.notes}
                </p>
              )}
            </div>
          ))}

          {/* Passers not below sticker */}
          {passersOnly.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Passed the Big Five but not on sale
              </p>
              <div className="flex flex-wrap gap-2">
                {passersOnly.map((s) => (
                  <Link
                    key={s.ticker}
                    href={`/stocks/${s.ticker}/valuation`}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
                    title={`Big Five ${s.bigFiveScore}/5 · price ${fmtMoney(s.currentPrice)} vs sticker ${fmtMoney(s.sticker)}`}
                  >
                    {s.ticker}
                    {s.discountToSticker !== null && (
                      <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                        {(s.discountToSticker * 100).toFixed(0)}%
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Failed Big Five */}
          {failed.length > 0 && (
            <details>
              <summary className="cursor-pointer select-none text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                {failed.length} stocks failed the Big Five
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
                      <th className="py-1 font-medium">Stock</th>
                      <th className="py-1 text-right font-medium">ROIC</th>
                      <th className="py-1 text-right font-medium">Sales</th>
                      <th className="py-1 text-right font-medium">EPS</th>
                      <th className="py-1 text-right font-medium">Equity</th>
                      <th className="py-1 text-right font-medium">FCF</th>
                      <th className="py-1 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failed.map((s) => (
                      <tr key={s.ticker} className="border-t border-zinc-50 text-xs dark:border-zinc-800/50">
                        <td className="py-1.5">
                          <Link
                            href={`/stocks/${s.ticker}/valuation`}
                            className="text-zinc-700 hover:text-blue-600 dark:text-zinc-300 dark:hover:text-blue-400"
                          >
                            {s.ticker}
                          </Link>
                          {!s.dataAvailable && (
                            <span className="ml-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                              no SEC data
                            </span>
                          )}
                        </td>
                        {([s.bigFive.roic, s.bigFive.sales, s.bigFive.eps, s.bigFive.equity, s.bigFive.fcf] as const).map((v, i) => (
                          <td key={i} className={`py-1.5 text-right font-medium ${bigFiveCellColor(v)}`}>
                            {fmtPct(v)}
                          </td>
                        ))}
                        <td className="py-1.5 text-right font-semibold text-zinc-700 dark:text-zinc-300">
                          {s.dataAvailable ? `${s.bigFiveScore}/5` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Pass = at least 3 of the Big Five ≥ 10%/yr over 10 years (SEC filings). Sticker
            uses the default Rule #1 inputs. Moat &amp; management are AI-researched for the
            top {finalists.length > 0 ? finalists.length : 5} stocks trading below sticker —
            treat as a starting point, not a verdict.
          </p>
        </div>
      )}
    </div>
  );
}
