"use client";

import type { SectorInsights } from "@/lib/sector-insights";
import Markdown from "react-markdown";

interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

interface TabLearnProps {
  insights: SectorInsights | null;
  userSummaryFallback: string | null;
  holdings: Holding[];
}

const SEGMENT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
];

function StepBadge({ number }: { number: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
      {number}
    </span>
  );
}

function Card({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2.5">
        <StepBadge number={step} />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function HoldingsBar({ holdings }: { holdings: Holding[] }) {
  const top5 = holdings.slice(0, 5);
  const totalWeight = top5.reduce((sum, h) => sum + h.weight, 0);

  return (
    <div className="mt-3">
      <div className="flex h-5 overflow-hidden rounded-lg">
        {top5.map((h, i) => (
          <div
            key={h.symbol}
            className={`${SEGMENT_COLORS[i]} transition-all`}
            style={{ width: `${(h.weight / totalWeight) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {top5.map((h, i) => (
          <div key={h.symbol} className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-sm ${SEGMENT_COLORS[i]}`}
            />
            <span className="text-zinc-700 dark:text-zinc-300">
              {h.name}
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {h.weight.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TabLearn({
  insights,
  userSummaryFallback,
  holdings,
}: TabLearnProps) {
  if (!insights) {
    if (!userSummaryFallback) return null;

    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <Markdown
          components={{
            h2: ({ children }) => (
              <h2 className="mt-5 mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {children}
              </h2>
            ),
            p: ({ children }) => (
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="mt-1 space-y-2">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                <span>{children}</span>
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                {children}
              </strong>
            ),
          }}
        >
          {userSummaryFallback}
        </Markdown>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. What happened? */}
      <Card step={1} title="What happened?">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {insights.whatHappened}
        </p>
      </Card>

      {/* 2. What's inside this sector? */}
      <Card step={2} title="What's inside this sector?">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {insights.sectorComposition}
        </p>
        {holdings.length > 0 && <HoldingsBar holdings={holdings} />}
      </Card>

      {/* 3. Why did it happen? */}
      <Card step={3} title="Why did it happen?">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Macro
            </h4>
            <ul className="space-y-1.5">
              {insights.whyItHappened.macro.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Fundamentals
            </h4>
            <ul className="space-y-1.5">
              {insights.whyItHappened.fundamentals.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Sentiment
            </h4>
            <ul className="space-y-1.5">
              {insights.whyItHappened.sentiment.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* 4. Is it attractive now? */}
      <Card step={4} title="Is it attractive now?">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {insights.valuationAssessment}
        </p>
      </Card>

      {/* 5. What could happen next? */}
      <Card step={5} title="What could happen next?">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Opportunities
            </h4>
            <ul className="space-y-1.5">
              {insights.whatNext.opportunities.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Risks
            </h4>
            <ul className="space-y-1.5">
              {insights.whatNext.risks.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
