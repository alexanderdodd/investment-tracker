"use client";

import { useState } from "react";
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

const STANCE_EXPLAINERS = {
  shortTerm: {
    label: "Short-term outlook",
    description: "How this sector is likely to perform over the next 1-3 months based on recent momentum, sentiment, and near-term catalysts.",
    values: {
      Positive: "The sector has strong near-term momentum and favorable conditions.",
      Neutral: "Near-term signals are mixed, with no clear directional edge.",
      Cautious: "Short-term headwinds or risks outweigh tailwinds right now.",
    },
  },
  longTerm: {
    label: "Long-term outlook",
    description: "How this sector is likely to perform over the next 1-3 years based on structural trends, fundamentals, and industry dynamics.",
    values: {
      Positive: "Structural tailwinds support sustained growth and outperformance.",
      Neutral: "Long-term prospects are balanced between opportunities and risks.",
      Cautious: "Fundamental challenges or headwinds may weigh on performance.",
    },
  },
  valuation: {
    label: "Valuation",
    description: "Whether the sector's current price level looks attractive relative to its earnings, growth, and historical range.",
    values: {
      Cheap: "Trading below historical averages with room for multiple expansion.",
      Fair: "Priced roughly in line with fundamentals and historical norms.",
      Expensive: "Trading above historical averages, leaving less margin for error.",
    },
  },
  confidence: {
    label: "Confidence",
    description: "How confident the analysis is in these assessments, based on data availability, clarity of drivers, and range of possible outcomes.",
    values: {
      High: "Clear drivers, strong data support, narrow range of outcomes.",
      Medium: "Reasonable data support but some meaningful uncertainties remain.",
      Low: "High uncertainty, conflicting signals, or limited data.",
    },
  },
};

function BadgeTooltip({
  children,
  title,
  description,
  valueExplainer,
  reason,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  valueExplainer: string;
  reason?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="cursor-help"
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {valueExplainer}
          </p>
          {reason && (
            <p className="mt-2 border-t border-zinc-100 pt-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Why: </span>
              {reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
            <BadgeTooltip
              title={STANCE_EXPLAINERS.longTerm.label}
              description={STANCE_EXPLAINERS.longTerm.description}
              valueExplainer={STANCE_EXPLAINERS.longTerm.values[insights.stanceLongTerm]}
              reason={insights.stanceLongTermReason}
            >
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${stanceColor(insights.stanceLongTerm)}`}
              >
                {insights.stanceLongTerm} LT
              </span>
            </BadgeTooltip>
            <span className="text-zinc-400 dark:text-zinc-500">/</span>
            <BadgeTooltip
              title={STANCE_EXPLAINERS.shortTerm.label}
              description={STANCE_EXPLAINERS.shortTerm.description}
              valueExplainer={STANCE_EXPLAINERS.shortTerm.values[insights.stanceShortTerm]}
              reason={insights.stanceShortTermReason}
            >
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${stanceColor(insights.stanceShortTerm)}`}
              >
                {insights.stanceShortTerm} ST
              </span>
            </BadgeTooltip>
            <BadgeTooltip
              title={STANCE_EXPLAINERS.valuation.label}
              description={STANCE_EXPLAINERS.valuation.description}
              valueExplainer={STANCE_EXPLAINERS.valuation.values[insights.valuation]}
              reason={insights.valuationReason}
            >
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${valuationColor(insights.valuation)}`}
              >
                {insights.valuation}
              </span>
            </BadgeTooltip>
            <BadgeTooltip
              title={STANCE_EXPLAINERS.confidence.label}
              description={STANCE_EXPLAINERS.confidence.description}
              valueExplainer={STANCE_EXPLAINERS.confidence.values[insights.confidence]}
              reason={insights.confidenceReason}
            >
              <span className="inline-flex items-center rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {insights.confidence} confidence
              </span>
            </BadgeTooltip>
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
