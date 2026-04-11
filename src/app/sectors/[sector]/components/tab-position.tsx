"use client";

import type { SectorInsights } from "@/lib/sector-insights";

interface TabPositionProps {
  insights: SectorInsights | null;
}

export default function TabPosition({ insights }: TabPositionProps) {
  if (!insights) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Detailed position analysis is not yet available for this sector.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Current Thesis */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Current Thesis
        </h3>
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {insights.thesis}
        </p>
      </div>

      {/* 2. Evidence For / Against */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="mb-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Evidence For
          </h3>
          <ul className="space-y-2">
            {insights.evidenceFor.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-emerald-800 dark:text-emerald-200"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900 dark:bg-red-950/30">
          <h3 className="mb-3 text-sm font-semibold text-red-800 dark:text-red-300">
            Evidence Against
          </h3>
          <ul className="space-y-2">
            {insights.evidenceAgainst.map((item, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-red-800 dark:text-red-200"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 3. Scenarios */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Scenarios
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 border-l-4 border-l-emerald-500 p-4 dark:border-zinc-800 dark:border-l-emerald-500">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Bull Case
            </h4>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {insights.scenarios.bull}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 border-l-4 border-l-zinc-400 p-4 dark:border-zinc-800 dark:border-l-zinc-500">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Base Case
            </h4>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {insights.scenarios.base}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 border-l-4 border-l-red-500 p-4 dark:border-zinc-800 dark:border-l-red-500">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Bear Case
            </h4>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {insights.scenarios.bear}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Change-My-Mind Triggers */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
        <h3 className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
          Change-My-Mind Triggers
        </h3>
        <ul className="space-y-2">
          {insights.triggers.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm leading-relaxed text-amber-800 dark:text-amber-200"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
