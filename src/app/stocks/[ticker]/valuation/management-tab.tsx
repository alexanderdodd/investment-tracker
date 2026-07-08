"use client";

import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
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

interface ManagementSec {
  available: boolean;
  unavailableReason: string | null;
  transactions: InsiderTransaction[];
  ceoOwnership: { date: string; owner: string; shares: number }[];
  execChanges: { date: string; filingUrl: string }[];
  form4Available: number;
  form4Parsed: number;
}

interface ManagementBrief {
  ceoName: string | null;
  ceoSince: string | null;
  founderLed: boolean | null;
  assessment: string;
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
      {data.yahoo.officers.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Leadership</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Officers and latest reported compensation (Yahoo Finance)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 text-right font-medium">Age</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pay</th>
                </tr>
              </thead>
              <tbody>
                {data.yahoo.officers.slice(0, 8).map((o) => {
                  const ceoRow = isTopCeo(o.title);
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
                      <td className="px-4 py-2.5 text-right text-sm text-zinc-700 dark:text-zinc-300">{fmtMoney(o.totalPay)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* Insider transactions */}
      {data.sec?.available && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Insider transactions
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                From the last {data.sec.form4Parsed} SEC Form 4 filings
              </p>
            </div>
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
              No open-market buys or sells in the parsed filings — only grants and tax
              withholding. Switch to &ldquo;All&rdquo; to see them.
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
        </div>
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

              <Markdown components={MD_COMPONENTS}>{data.brief.assessment}</Markdown>

              {data.brief.recentStatements && (
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Recent statements
                  </h3>
                  <Markdown components={MD_COMPONENTS}>{data.brief.recentStatements}</Markdown>
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
