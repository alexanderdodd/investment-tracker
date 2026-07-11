"use client";

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import {
  MOAT_TYPE_LABELS,
  type MoatAnalysis,
  type MoatStrength,
} from "@/lib/generate-moat-analysis";

const MD_COMPONENTS = {
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mt-4 mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mt-1 mb-2 space-y-1.5">{children}</ul>,
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
  ),
};

const STRENGTH_BADGE: Record<MoatStrength, string> = {
  wide: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  narrow: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  none: "border-zinc-400/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
};

const STRENGTH_LABEL: Record<MoatStrength, string> = {
  wide: "Wide moat",
  narrow: "Narrow moat",
  none: "No moat",
};

const SEVERITY_BADGE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-zinc-400/40 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
};

interface FetchResult {
  ticker: string;
  analysis: MoatAnalysis | null;
  generatedAt: string | null;
  error: string | null;
}

export function MoatTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/moat`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled)
          setResult({ ticker, analysis: json.analysis, generatedAt: json.generatedAt, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setResult({ ticker, analysis: null, generatedAt: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const loading = result?.ticker !== ticker;
  const analysis = loading ? null : result!.analysis;

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/stocks/${ticker}/moat`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setResult({ ticker, analysis: json.analysis, generatedAt: json.generatedAt, error: null });
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Moat</h2>
              {analysis && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STRENGTH_BADGE[analysis.overallStrength]}`}
                >
                  {STRENGTH_LABEL[analysis.overallStrength]}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              AI-researched consensus on the company&apos;s competitive moats (Rule #1&apos;s five
              types), their width, and the risks to them
              {result?.generatedAt &&
                ` · generated ${new Date(result.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400"
          >
            {generating ? "Researching…" : analysis ? "Refresh" : "Generate"}
          </button>
        </div>

        {genError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{genError}</p>}
        {result?.error && !analysis && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{result.error}</p>
        )}

        {!analysis && !generating && !result?.error && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No moat analysis yet. It researches the consensus view on the company&apos;s
            competitive advantages, classifies them into Town&apos;s five moat types, judges how
            wide they are, and lists what could erode them.
          </p>
        )}
        {generating && (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        )}

        {analysis && !generating && (
          <div className="space-y-5">
            {/* Consensus */}
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Consensus view
              </h3>
              <Markdown components={MD_COMPONENTS}>{analysis.consensus}</Markdown>
            </div>

            {/* Individual moats */}
            {analysis.moats.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Identified moats
                </h3>
                <div className="space-y-3">
                  {analysis.moats.map((m, i) => (
                    <div
                      key={`${m.type}-${i}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/30"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {MOAT_TYPE_LABELS[m.type]}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STRENGTH_BADGE[m.strength]}`}
                        >
                          {m.strength}
                        </span>
                      </div>
                      <Markdown components={MD_COMPONENTS}>{m.description}</Markdown>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {analysis.risks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Risks to the moat
                </h3>
                <div className="space-y-3">
                  {analysis.risks.map((r, i) => (
                    <div
                      key={`${r.title}-${i}`}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/30"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {r.title}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${SEVERITY_BADGE[r.severity]}`}
                        >
                          {r.severity}
                        </span>
                      </div>
                      <Markdown components={MD_COMPONENTS}>{r.description}</Markdown>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Durability */}
            {analysis.durability && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Durability over 10 years
                </h3>
                <Markdown components={MD_COMPONENTS}>{analysis.durability}</Markdown>
              </div>
            )}

            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              AI-researched from public sources — treat as a starting point for your own moat
              judgment, not a verdict.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
