"use client";

import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import { MetricTooltip } from "@/components/metric-tooltip";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface YahooOfficer {
  name: string;
  title: string;
  age: number | null;
  totalPay: number | null;
}

interface YahooManagement {
  officers: YahooOfficer[];
  insidersPercentHeld: number | null;
  netActivity: {
    period: string | null;
    buyShares: number | null;
    buyCount: number | null;
    sellShares: number | null;
    sellCount: number | null;
    netShares: number | null;
  } | null;
}

interface InsiderTransaction {
  date: string;
  owner: string;
  role: string | null;
  isCeo: boolean;
  isOfficer: boolean;
  isDirector: boolean;
  code: string;
  codeLabel: string;
  acquired: boolean;
  shares: number | null;
  price: number | null;
  value: number | null;
  sharesOwnedAfter: number | null;
  filingUrl: string;
}

interface OfficerComp {
  name: string;
  fiscalYear: number | null;
  salary: number | null;
  bonus: number | null;
  nonEquityIncentive: number | null;
  stockAwards: number | null;
  optionAwards: number | null;
  otherComp: number | null;
  total: number | null;
}

interface ManagementSec {
  available: boolean;
  unavailableReason: string | null;
  transactions: InsiderTransaction[];
  ceoOwnership: { date: string; owner: string; shares: number }[];
  execChanges: { date: string; filingUrl: string }[];
  ceoComp?: { fiscalYear: number; totalComp: number; compActuallyPaid: number | null }[];
  compBreakdown?: { officers: OfficerComp[]; bonusPlanNote: string | null } | null;
  proxyUrl?: string | null;
  form4Available: number;
  form4Parsed: number;
}

interface ManagementBrief {
  ceoName: string | null;
  ceoSince: string | null;
  founderLed: boolean | null;
  assessment: string;
  compensation?: string;
  recentStatements: string;
  positives: string[];
  redFlags: string[];
}

interface ManagementData {
  ticker: string;
  yahoo: YahooManagement;
  sec: ManagementSec | null;
  brief: ManagementBrief | null;
  briefGeneratedAt: string | null;
}

function fmtShares(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
}

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

// Match a Yahoo officer name ("Mr. Jen-Hsun Huang") to an SCT name
// ("Jen-Hsun Huang"): same last token + same first initial after stripping
// honorifics and suffixes
const NAME_SUFFIXES = new Set([
  "mr", "ms", "mrs", "dr", "prof", "jr", "sr", "ii", "iii", "iv",
  "jd", "phd", "ph", "lca", "esq", "cpa", "mba", "cfa",
]);

function nameTokens(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_SUFFIXES.has(t));
  // Degree suffixes like "J.D." tokenize into stray single letters at the
  // end ("teter j d") — drop trailing initials so the surname survives
  while (tokens.length > 1 && tokens[tokens.length - 1].length === 1) tokens.pop();
  return tokens;
}

function officerCompFor(name: string, comp: OfficerComp[] | undefined): OfficerComp | null {
  if (!comp) return null;
  const t = nameTokens(name);
  if (t.length === 0) return null;
  const last = t[t.length - 1];
  const firstInitial = t[0][0];
  return (
    comp.find((c) => {
      const ct = nameTokens(c.name);
      if (ct.length === 0) return false;
      return ct[ct.length - 1] === last && ct[0][0] === firstInitial;
    }) ?? null
  );
}

function isTopCeo(title: string): boolean {
  return /chief executive|(^|[^a-z])ceo([^a-z]|$)/i.test(title) && !/,|of /i.test(title.replace(/chairman|president/gi, ""));
}

const CODE_COLORS: Record<string, string> = {
  P: "text-emerald-600 dark:text-emerald-400",
  S: "text-red-600 dark:text-red-400",
};

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

type TxFilter = "trades" | "all";

interface PersonAgg {
  owner: string;
  role: string | null;
  isCeo: boolean;
  boughtShares: number;
  boughtValue: number;
  soldShares: number;
  soldValue: number;
  /** Latest direct holding on record */
  currentStake: number | null;
  /** Reconstructed direct holding at the start of the window */
  startingStake: number | null;
  /** (current − starting) / starting — the real "are they dumping?" number.
   *  Execs who exercise options and sell same-day show ~0% here even with
   *  large sale totals, which is the correct reading. */
  stakeChange: number | null;
}

/**
 * Aggregate discretionary insider activity per person over the last ~12
 * months of parsed filings. Buys = open-market purchases (code P); sells =
 * open-market sales (code S). Grants, option exercises, and tax withholding
 * are excluded — they're compensation mechanics, not conviction. The
 * starting stake is reconstructed by reverse-applying every direct
 * transaction from the person's latest reported holding.
 */
function aggregateInsiders(transactions: InsiderTransaction[]): {
  people: PersonAgg[];
  totals: { boughtShares: number; boughtValue: number; soldShares: number; soldValue: number; stakeChange: number | null };
  windowFrom: string | null;
  windowTo: string | null;
} {
  const dated = transactions.filter((t) => t.date);
  if (dated.length === 0) {
    return {
      people: [],
      totals: { boughtShares: 0, boughtValue: 0, soldShares: 0, soldValue: 0, stakeChange: null },
      windowFrom: null,
      windowTo: null,
    };
  }
  const latest = dated.reduce((max, t) => (t.date > max ? t.date : max), dated[0].date);
  const cutoffMs = new Date(latest).getTime() - 365 * 24 * 60 * 60 * 1000;
  const window = dated.filter((t) => new Date(t.date).getTime() >= cutoffMs);
  const windowFrom = window.reduce((min, t) => (t.date < min ? t.date : min), window[0].date);

  const byOwner = new Map<string, InsiderTransaction[]>();
  for (const t of window) {
    const list = byOwner.get(t.owner) ?? [];
    list.push(t);
    byOwner.set(t.owner, list);
  }

  const people: PersonAgg[] = [];
  for (const [owner, txs] of byOwner) {
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    let boughtShares = 0, boughtValue = 0, soldShares = 0, soldValue = 0;
    for (const t of sorted) {
      if (t.code === "P") {
        boughtShares += t.shares ?? 0;
        boughtValue += t.value ?? 0;
      } else if (t.code === "S") {
        soldShares += t.shares ?? 0;
        soldValue += t.value ?? 0;
      }
    }

    // Direct-holding transactions carry sharesOwnedAfter — walk them to get
    // the current stake and reverse-apply to reconstruct the starting stake
    const direct = sorted.filter((t) => t.sharesOwnedAfter !== null);
    const currentStake = direct.length > 0 ? direct[direct.length - 1].sharesOwnedAfter : null;
    let startingStake: number | null = null;
    if (direct.length > 0) {
      const first = direct[0];
      startingStake =
        first.sharesOwnedAfter! + (first.acquired ? -(first.shares ?? 0) : (first.shares ?? 0));
      if (startingStake < 0) startingStake = 0;
    }
    const stakeChange =
      startingStake !== null && startingStake > 0 && currentStake !== null
        ? currentStake / startingStake - 1
        : null;

    if (boughtShares === 0 && soldShares === 0) continue; // no discretionary trades

    const latestTx = sorted[sorted.length - 1];
    people.push({
      owner,
      role: latestTx.role,
      isCeo: sorted.some((t) => t.isCeo),
      boughtShares,
      boughtValue,
      soldShares,
      soldValue,
      currentStake,
      startingStake,
      stakeChange,
    });
  }

  people.sort((a, b) => (b.soldValue + b.boughtValue) - (a.soldValue + a.boughtValue));

  const totals = people.reduce(
    (acc, p) => ({
      boughtShares: acc.boughtShares + p.boughtShares,
      boughtValue: acc.boughtValue + p.boughtValue,
      soldShares: acc.soldShares + p.soldShares,
      soldValue: acc.soldValue + p.soldValue,
      starting: acc.starting + (p.startingStake ?? 0),
      current: acc.current + (p.currentStake ?? 0),
    }),
    { boughtShares: 0, boughtValue: 0, soldShares: 0, soldValue: 0, starting: 0, current: 0 }
  );

  return {
    people,
    totals: {
      boughtShares: totals.boughtShares,
      boughtValue: totals.boughtValue,
      soldShares: totals.soldShares,
      soldValue: totals.soldValue,
      stakeChange: totals.starting > 0 ? totals.current / totals.starting - 1 : null,
    },
    windowFrom,
    windowTo: latest,
  };
}

function stakeChangeColor(change: number | null): string {
  if (change === null) return "text-zinc-400 dark:text-zinc-500";
  if (change <= -0.2) return "text-red-600 dark:text-red-400";
  if (change <= -0.05) return "text-amber-600 dark:text-amber-400";
  if (change >= 0.05) return "text-emerald-600 dark:text-emerald-400";
  return "text-zinc-700 dark:text-zinc-300";
}

// Stored briefs can predate the string-coercion fix in the generator —
// Markdown requires string children, so normalize defensively here too
function asMarkdown(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => `- ${String(x)}`).join("\n");
  return "";
}

interface FetchResult {
  ticker: string;
  data: ManagementData | null;
  error: string | null;
}

export function ManagementTab({ ticker }: { ticker: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter>("trades");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stocks/${ticker}/management`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setResult({ ticker, data: json, error: null });
      })
      .catch((e) => {
        if (!cancelled) setResult({ ticker, data: null, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const loading = result?.ticker !== ticker;
  const data = loading ? null : result!.data;
  const error = loading ? null : result!.error;

  const generateBrief = async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch(`/api/stocks/${ticker}/management`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setResult((prev) =>
        prev?.data
          ? {
              ...prev,
              data: { ...prev.data, brief: json.brief, briefGeneratedAt: json.briefGeneratedAt },
            }
          : prev
      );
    } catch (e) {
      setBriefError((e as Error).message);
    } finally {
      setBriefLoading(false);
    }
  };

  const visibleTx = useMemo(() => {
    const tx = data?.sec?.transactions ?? [];
    const filtered = txFilter === "trades" ? tx.filter((t) => t.code === "P" || t.code === "S") : tx;
    return filtered.slice(0, 40);
  }, [data, txFilter]);

  const ceoSeries = useMemo(() => {
    return (data?.sec?.ceoOwnership ?? []).map((p) => ({
      ...p,
      label: p.date.slice(0, 7),
    }));
  }, [data]);

  const insiderAgg = useMemo(
    () => aggregateInsiders(data?.sec?.transactions ?? []),
    [data]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Loading management data… first load parses recent SEC insider filings and can take
          up to half a minute.
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-6 py-10 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        Couldn&apos;t load management data: {error}
      </div>
    );
  }

  const net = data.yahoo.netActivity;
  const netVerdict =
    net?.netShares != null
      ? net.netShares > 0
        ? { label: "Insiders net buying", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
        : net.netShares < 0
          ? { label: "Insiders net selling", color: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
          : { label: "Neutral insider activity", color: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" }
      : null;

  const ceoName = ceoSeries.length > 0 ? ceoSeries[ceoSeries.length - 1].owner : null;

  return (
    <div className="space-y-6">
      {/* Leadership */}
      {data.yahoo.officers.length > 0 && (() => {
        const breakdown = data.sec?.compBreakdown ?? null;
        const compFY = breakdown?.officers[0]?.fiscalYear ?? null;
        return (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Leadership</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {breakdown
                  ? `Officers with the salary/bonus/equity split from the proxy's Summary Compensation Table${compFY ? ` (FY${compFY})` : ""}`
                  : "Officers and latest reported compensation (Yahoo Finance)"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className={`w-full ${breakdown ? "min-w-[760px]" : "min-w-[520px]"}`}>
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Title</th>
                    <th className="px-3 py-2.5 text-right font-medium">Age</th>
                    {breakdown ? (
                      <>
                        <th className="px-3 py-2.5 text-right font-medium">Salary</th>
                        <th className="px-3 py-2.5 text-right font-medium">
                          <MetricTooltip
                            label="Bonus / incentive"
                            description={`Discretionary cash bonus plus the non-equity incentive plan payout (the performance-based cash bonus).${breakdown.bonusPlanNote ? ` What it rewards here: ${breakdown.bonusPlanNote}` : ""}`}
                          >
                            <span>Bonus</span>
                          </MetricTooltip>
                        </th>
                        <th className="px-3 py-2.5 text-right font-medium">Stock awards</th>
                        <th className="px-4 py-2.5 text-right font-medium">Total (SCT)</th>
                      </>
                    ) : (
                      <th className="px-4 py-2.5 text-right font-medium">Pay</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.yahoo.officers.slice(0, 8).map((o) => {
                    const ceoRow = isTopCeo(o.title);
                    const comp = breakdown ? officerCompFor(o.name, breakdown.officers) : null;
                    const bonusTotal =
                      comp && (comp.bonus !== null || comp.nonEquityIncentive !== null)
                        ? (comp.bonus ?? 0) + (comp.nonEquityIncentive ?? 0)
                        : null;
                    return (
                      <tr
                        key={o.name}
                        className={`border-b border-zinc-50 text-sm last:border-b-0 dark:border-zinc-800/50 ${ceoRow ? "bg-zinc-50/60 dark:bg-zinc-800/30" : ""}`}
                      >
                        <td className={`px-4 py-2.5 ${ceoRow ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
                          {o.name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/, "")}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">{o.title}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">{o.age ?? "—"}</td>
                        {breakdown ? (
                          <>
                            <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300">
                              {fmtMoney(comp?.salary ?? null)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300">
                              {fmtMoney(bonusTotal)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-zinc-700 dark:text-zinc-300">
                              {fmtMoney(comp?.stockAwards ?? null)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100">
                              {fmtMoney(comp?.total ?? null)}
                            </td>
                          </>
                        ) : (
                          <td className="px-4 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">{fmtMoney(o.totalPay)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {breakdown?.bonusPlanNote && (
              <p className="border-t border-zinc-100 px-6 py-2.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <span className="font-medium text-zinc-600 dark:text-zinc-300">What the bonus rewards:</span>{" "}
                {breakdown.bonusPlanNote}
              </p>
            )}
          </div>
        );
      })()}

      {/* Insider pulse */}
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-8">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Insider buys ({net?.period ?? "6m"})
              </p>
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                {net?.buyCount ?? "—"}
                <span className="ml-1.5 text-xs font-normal text-zinc-400">
                  {fmtShares(net?.buyShares ?? null)} sh
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Insider sells ({net?.period ?? "6m"})
              </p>
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                {net?.sellCount ?? "—"}
                <span className="ml-1.5 text-xs font-normal text-zinc-400">
                  {fmtShares(net?.sellShares ?? null)} sh
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Held by insiders</p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {data.yahoo.insidersPercentHeld !== null
                  ? `${(data.yahoo.insidersPercentHeld * 100).toFixed(2)}%`
                  : "—"}
              </p>
            </div>
          </div>
          {netVerdict && (
            <div className={`rounded-full border px-4 py-1.5 text-sm font-medium ${netVerdict.color}`}>
              {netVerdict.label}
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          Scheduled selling (10b5-1 plans) is routine for executives paid in stock — open-market
          purchases are the strong signal.
        </p>
      </div>

      {/* CEO ownership over time */}
      {ceoSeries.length >= 2 && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            CEO direct ownership{ceoName ? ` — ${ceoName}` : ""}
          </p>
          <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
            Shares owned after each SEC Form 4 filing
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ceoSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmtShares(v)}
                  width={54}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(24,24,27,0.95)",
                    border: "1px solid rgba(63,63,70,0.5)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#e4e4e7",
                  }}
                  formatter={(value: unknown) => [fmtShares(Number(value)), "Shares"]}
                  labelFormatter={(label: unknown) => String(label)}
                />
                <Line type="stepAfter" dataKey="shares" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* CEO compensation */}
      {data.sec?.ceoComp && data.sec.ceoComp.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                CEO compensation
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                From the proxy statement&apos;s Pay-versus-Performance disclosure
              </p>
            </div>
            {data.sec.proxyUrl && (
              <a
                href={data.sec.proxyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline dark:text-blue-400"
              >
                Proxy filing ↗
              </a>
            )}
          </div>
          <div className="overflow-x-auto px-6 py-3">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="text-left text-[11px] text-zinc-400 dark:text-zinc-500">
                  <th className="py-1 font-medium">FY</th>
                  <th className="py-1 text-right font-medium">Total comp (SCT)</th>
                  <th className="py-1 text-right font-medium">Actually paid</th>
                </tr>
              </thead>
              <tbody>
                {[...data.sec.ceoComp].reverse().map((c) => (
                  <tr
                    key={c.fiscalYear}
                    className="border-t border-zinc-50 text-xs dark:border-zinc-800/50"
                  >
                    <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{c.fiscalYear}</td>
                    <td className="py-1.5 text-right font-medium text-zinc-900 dark:text-zinc-100">
                      {fmtMoney(c.totalComp)}
                    </td>
                    <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-300">
                      {fmtMoney(c.compActuallyPaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 pb-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              &ldquo;Total comp&rdquo; is the Summary Compensation Table figure (equity at
              grant-date value); &ldquo;actually paid&rdquo; marks equity awards to market — it
              swings with the stock. The Yahoo &ldquo;Pay&rdquo; column above excludes equity
              awards entirely, which is why it looks far smaller. For what the bonus rewards,
              see the brief below or the proxy&apos;s CD&amp;A section.
            </p>
          </div>
        </div>
      )}

      {/* Insider activity by person */}
      {data.sec?.available && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Insider activity by person
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Open-market buys and sells over the last 12 months of filings
              {insiderAgg.windowFrom && ` (${insiderAgg.windowFrom} → ${insiderAgg.windowTo})`} —
              grants, option exercises, and tax withholding excluded. Direct holdings only:
              founders often hold most shares via trusts (indirect), tracked separately on
              Form 4
            </p>
          </div>
          {insiderAgg.people.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No discretionary open-market buys or sells in the parsed filings — only
              compensation mechanics (grants, withholding). That itself is normal.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Insider</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bought</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sold</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <MetricTooltip
                        label="Stake change (12m)"
                        description="Change in the person's direct holding over the window. This is the honest 'are they dumping?' number: an exec who exercises options and sells them the same day shows big Sold totals but ~0% stake change — their actual exposure didn't move. −30% means they really cut their stake by a third."
                      >
                        <span>Stake change</span>
                      </MetricTooltip>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">Stake now</th>
                    <th className="px-4 py-2.5 text-right font-medium">Net value</th>
                  </tr>
                </thead>
                <tbody>
                  {insiderAgg.people.map((p) => {
                    const netValue = p.boughtValue - p.soldValue;
                    return (
                      <tr
                        key={p.owner}
                        className="border-b border-zinc-50 text-sm last:border-b-0 dark:border-zinc-800/50"
                      >
                        <td className="px-4 py-2.5">
                          <p className="text-sm text-zinc-900 dark:text-zinc-100">
                            {p.owner}
                            {p.isCeo && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                CEO
                              </span>
                            )}
                          </p>
                          {p.role && (
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{p.role}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                          {p.boughtShares > 0 ? fmtShares(p.boughtShares) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">
                          {p.soldShares > 0 ? fmtShares(p.soldShares) : "—"}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-medium ${stakeChangeColor(p.stakeChange)}`}>
                          {p.stakeChange !== null
                            ? `${p.stakeChange > 0 ? "+" : ""}${(p.stakeChange * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                          {p.currentStake !== null ? fmtShares(p.currentStake) : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${netValue > 0 ? "text-emerald-600 dark:text-emerald-400" : netValue < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                          {netValue !== 0 ? `${netValue > 0 ? "+" : "-"}${fmtMoney(Math.abs(netValue)).replace("-", "")}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Overall */}
                  <tr className="border-t border-zinc-200 bg-zinc-50/60 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-800/30">
                    <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100">
                      All insiders
                    </td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                      {insiderAgg.totals.boughtShares > 0 ? fmtShares(insiderAgg.totals.boughtShares) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-600 dark:text-red-400">
                      {insiderAgg.totals.soldShares > 0 ? fmtShares(insiderAgg.totals.soldShares) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${stakeChangeColor(insiderAgg.totals.stakeChange)}`}>
                      {insiderAgg.totals.stakeChange !== null
                        ? `${insiderAgg.totals.stakeChange > 0 ? "+" : ""}${(insiderAgg.totals.stakeChange * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className={`px-4 py-2.5 text-right ${insiderAgg.totals.boughtValue - insiderAgg.totals.soldValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {(() => {
                        const net = insiderAgg.totals.boughtValue - insiderAgg.totals.soldValue;
                        return net !== 0 ? `${net > 0 ? "+" : "-"}${fmtMoney(Math.abs(net)).replace("-", "")}` : "—";
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Raw filings (demoted) */}
      {data.sec?.available && (
        <details className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer select-none px-6 py-4 text-sm font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
            Raw insider filings
            <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              individual transactions from the last {data.sec.form4Parsed} Form 4s
            </span>
          </summary>
          <div className="flex items-center justify-end border-t border-zinc-100 px-6 py-3 dark:border-zinc-800">
            <div className="flex gap-1">
              {(
                [
                  { value: "trades", label: "Buys & sells" },
                  { value: "all", label: "All" },
                ] as { value: TxFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTxFilter(f.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    txFilter === f.value
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {visibleTx.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No open-market buys or sells in the parsed filings — switch to &ldquo;All&rdquo;
              to see grants and withholding.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Insider</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 text-right font-medium">Shares</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTx.map((t, i) => (
                    <tr
                      key={`${t.filingUrl}-${i}`}
                      className="border-b border-zinc-50 text-sm last:border-b-0 dark:border-zinc-800/50"
                    >
                      <td className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">{t.date}</td>
                      <td className="px-3 py-2.5">
                        <a
                          href={t.filingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
                        >
                          {t.owner}
                          {t.isCeo && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              CEO
                            </span>
                          )}
                        </a>
                        {t.role && (
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t.role}</p>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-xs font-medium ${CODE_COLORS[t.code] ?? "text-zinc-500 dark:text-zinc-400"}`}>
                        {t.codeLabel}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {fmtShares(t.shares)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {t.price && t.price > 0 ? `$${t.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {t.value && t.value > 0 ? fmtMoney(t.value) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}

      {!data.sec?.available && data.sec?.unavailableReason && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.sec.unavailableReason}</p>
        </div>
      )}

      {/* Executive changes */}
      {data.sec && data.sec.execChanges.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Executive &amp; board changes
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            8-K filings reporting officer/director departures or appointments (Item 5.02)
          </p>
          <div className="flex flex-wrap gap-2">
            {data.sec.execChanges.map((e) => (
              <a
                key={e.filingUrl}
                href={e.filingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                {e.date} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Management brief (LLM) */}
      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Management brief
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              AI-researched Rule #1 assessment — tenure, candor, capital allocation, recent
              statements
              {data.briefGeneratedAt &&
                ` · generated ${new Date(data.briefGeneratedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
            </p>
          </div>
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {briefLoading ? "Researching…" : data.brief ? "Refresh" : "Generate"}
          </button>
        </div>
        <div className="px-6 py-5">
          {briefError && (
            <p className="mb-3 text-sm text-red-600 dark:text-red-400">{briefError}</p>
          )}
          {!data.brief && !briefLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No brief generated yet. It researches the CEO&apos;s background, track record, and
              recent public statements from current web sources (takes ~30 seconds).
            </p>
          )}
          {briefLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-4 w-full rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-4 w-5/6 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          )}
          {data.brief && !briefLoading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {data.brief.ceoName && (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    CEO: {data.brief.ceoName}
                    {data.brief.ceoSince ? ` (since ${data.brief.ceoSince})` : ""}
                  </span>
                )}
                {data.brief.founderLed !== null && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      data.brief.founderLed
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {data.brief.founderLed ? "Founder-led" : "Professional CEO"}
                  </span>
                )}
              </div>

              <Markdown components={MD_COMPONENTS}>{asMarkdown(data.brief.assessment)}</Markdown>

              {asMarkdown(data.brief.compensation) && (
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Compensation &amp; incentives
                  </h3>
                  <Markdown components={MD_COMPONENTS}>{asMarkdown(data.brief.compensation)}</Markdown>
                </div>
              )}

              {asMarkdown(data.brief.recentStatements) && (
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Recent statements
                  </h3>
                  <Markdown components={MD_COMPONENTS}>{asMarkdown(data.brief.recentStatements)}</Markdown>
                </div>
              )}

              {(data.brief.positives.length > 0 || data.brief.redFlags.length > 0) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.brief.positives.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <p className="mb-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Positives
                      </p>
                      <ul className="space-y-1">
                        {data.brief.positives.map((p) => (
                          <li key={p} className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                            • {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.brief.redFlags.length > 0 && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                      <p className="mb-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                        Red flags
                      </p>
                      <ul className="space-y-1">
                        {data.brief.redFlags.map((r) => (
                          <li key={r} className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Sources: SEC EDGAR Form 4 / 8-K filings (deterministic), Yahoo Finance officer &amp;
        holder data, and AI web research for the brief. The brief may contain errors — verify
        anything load-bearing against the linked filings.
      </p>
    </div>
  );
}
