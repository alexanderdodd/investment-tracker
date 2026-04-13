"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sectorToSlug } from "@/lib/sectors";

interface IndustryRow {
  id: string;
  code: string;
  name: string;
  slug: string;
  industryGroupName: string;
  cyclicalityClass: string;
  valueFrameworkId: string | null;
  stockCount: number;
  analytics: {
    valuationState: string;
    industryState: string;
    medianForwardPe: number | null;
    medianEvEbitda: number | null;
    medianOperatingMargin: number | null;
    medianRoic: number | null;
    candidateCountValidated: number;
    candidateCountPossible: number;
    confidence: number;
    generatedAt: string;
  } | null;
}

const STATE_BADGES: Record<string, { label: string; className: string }> = {
  ATTRACTIVE_HUNTING_GROUND: {
    label: "Attractive",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  MIXED: {
    label: "Mixed",
    className: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400",
  },
  OVERHEATED: {
    label: "Overheated",
    className: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
  },
  LOW_VISIBILITY: {
    label: "Low Visibility",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  WITHHELD: {
    label: "Pending",
    className: "border-zinc-300/40 bg-zinc-300/10 text-zinc-500 dark:text-zinc-500",
  },
};

const CYCLICALITY_LABELS: Record<string, string> = {
  defensive: "Defensive",
  mixed: "Mixed",
  cyclical: "Cyclical",
  hyper_cyclical: "Hyper-cyclical",
};

function formatMultiple(v: number | null): string {
  if (v === null) return "-";
  return `${v.toFixed(1)}x`;
}

function formatPercent(v: number | null): string {
  if (v === null) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

export function TabIndustries({ sector, slug }: { sector: string; slug: string }) {
  const [industries, setIndustries] = useState<IndustryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sectors/${slug}/industries`)
      .then((r) => r.json())
      .then((data) => setIndustries(data.industries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />;
  }

  if (industries.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">
          No GICS industries mapped for {sector} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Industries in {sector}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            GICS industry breakdown &middot; {industries.length} industries &middot;{" "}
            {industries.reduce((s, i) => s + i.stockCount, 0)} classified stocks
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-3 py-3 font-medium">Group</th>
                <th className="px-3 py-3 text-center font-medium">Cyclicality</th>
                <th className="px-3 py-3 text-right font-medium">Stocks</th>
                <th className="px-3 py-3 text-center font-medium">State</th>
                <th className="px-3 py-3 text-right font-medium">Fwd P/E</th>
                <th className="px-3 py-3 text-right font-medium">EV/EBITDA</th>
                <th className="px-3 py-3 text-right font-medium">Op Margin</th>
                <th className="px-3 py-3 text-right font-medium">ROIC</th>
                <th className="px-3 py-3 text-right font-medium">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {industries.map((ind) => {
                const state = ind.analytics?.industryState ?? "WITHHELD";
                const badge = STATE_BADGES[state] ?? STATE_BADGES.WITHHELD;
                const totalCandidates = ind.analytics
                  ? ind.analytics.candidateCountValidated + ind.analytics.candidateCountPossible
                  : 0;

                return (
                  <tr
                    key={ind.id}
                    className="border-b border-zinc-50 last:border-b-0 dark:border-zinc-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/industries/${ind.slug}`}
                        className="text-sm font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 transition-colors"
                      >
                        {ind.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {ind.industryGroupName}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {CYCLICALITY_LABELS[ind.cyclicalityClass] ?? ind.cyclicalityClass}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {ind.stockCount}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {formatMultiple(ind.analytics?.medianForwardPe ?? null)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {formatMultiple(ind.analytics?.medianEvEbitda ?? null)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {formatPercent(ind.analytics?.medianOperatingMargin ?? null)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {formatPercent(ind.analytics?.medianRoic ?? null)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {totalCandidates > 0 ? totalCandidates : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
