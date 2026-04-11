"use client";

import type { SectorInsights } from "@/lib/sector-insights";

interface SectorHeaderProps {
  sector: string;
  ticker: string;
  insights: SectorInsights | null;
  generatedAt: string | null;
}

const sectorIcons: Record<string, string> = {
  Technology: "\uD83D\uDCBB",
  Financials: "\uD83C\uDFE6",
  Utilities: "\u26A1",
  "Consumer Staples": "\uD83D\uDED2",
  "Consumer Discretionary": "\uD83D\uDECD\uFE0F",
  Industrials: "\uD83C\uDFED",
  "Health Care": "\uD83C\uDFE5",
  Energy: "\uD83D\uDEE2\uFE0F",
  Materials: "\u26CF\uFE0F",
  "Communication Services": "\uD83D\uDCE1",
  "Real Estate": "\uD83C\uDFE0",
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function stanceColor(stance: "Positive" | "Neutral" | "Cautious") {
  switch (stance) {
    case "Positive":
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Neutral":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
    case "Cautious":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
}

function valuationColor(valuation: "Cheap" | "Fair" | "Expensive") {
  switch (valuation) {
    case "Cheap":
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    case "Fair":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
    case "Expensive":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
  }
}

export default function SectorHeader({
  sector,
  ticker,
  insights,
  generatedAt,
}: SectorHeaderProps) {
  const icon = sectorIcons[sector] ?? "";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {icon && <span className="mr-1.5">{icon}</span>}
            {sector}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{ticker}</p>
        </div>

        {insights && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${stanceColor(insights.stanceLongTerm)}`}
            >
              {insights.stanceLongTerm} LT
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">/</span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${stanceColor(insights.stanceShortTerm)}`}
            >
              {insights.stanceShortTerm} ST
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${valuationColor(insights.valuation)}`}
            >
              {insights.valuation}
            </span>
            <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {insights.confidence} confidence
            </span>
          </div>
        )}
      </div>

      {generatedAt && (
        <div className="text-right">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Updated {relativeTime(generatedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
