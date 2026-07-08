/**
 * Management / insider data from SEC EDGAR.
 *
 * Parses recent Form 4 (insider transaction) filings for officer/director
 * trades and the CEO's ownership over time, and surfaces executive-change
 * 8-Ks (Item 5.02). Deterministic — no LLM involvement.
 */

import {
  resolveTickerToCIK,
  getSubmissions,
  fetchFilingDocument,
  filingIndexUrl,
} from "./client";

// Form 4s are frequent filers' paperwork; cap how many XMLs we pull per
// build to stay polite with EDGAR (~15s at the throttled rate).
const MAX_FORM4_FETCHES = 120;
const MAX_EXEC_CHANGE_EVENTS = 10;

/** SEC transaction codes → what they actually mean for signal purposes */
export const TRANSACTION_CODE_LABELS: Record<string, string> = {
  P: "Open-market purchase",
  S: "Sale",
  A: "Grant / award",
  M: "Option exercise",
  F: "Tax withholding",
  G: "Gift",
  D: "Disposition to issuer",
  C: "Conversion",
  X: "Option exercise (in-the-money)",
  W: "Will / inheritance",
  J: "Other",
};

export interface InsiderTransaction {
  /** Transaction date (YYYY-MM-DD) */
  date: string;
  owner: string;
  role: string | null;
  isCeo: boolean;
  isOfficer: boolean;
  isDirector: boolean;
  code: string;
  codeLabel: string;
  /** true = shares acquired, false = disposed */
  acquired: boolean;
  shares: number | null;
  price: number | null;
  value: number | null;
  /** Direct shares owned after the transaction (per the filing) */
  sharesOwnedAfter: number | null;
  filingUrl: string;
}

export interface CeoOwnershipPoint {
  date: string;
  owner: string;
  shares: number;
}

export interface ExecChangeEvent {
  date: string;
  filingUrl: string;
}

export interface CeoCompYear {
  /** Calendar year the fiscal year ends in */
  fiscalYear: number;
  /** Summary Compensation Table total (ecd:PeoTotalCompAmt) — grant-date value */
  totalComp: number;
  /** "Compensation actually paid" (ecd:PeoActuallyPaidCompAmt) — equity marked to market */
  compActuallyPaid: number | null;
}

export interface ManagementPayload {
  ticker: string;
  companyName: string | null;
  cik: string | null;
  available: boolean;
  unavailableReason: string | null;
  transactions: InsiderTransaction[];
  /** CEO direct ownership after each of their transactions, chronological */
  ceoOwnership: CeoOwnershipPoint[];
  /** 8-K filings with Item 5.02 (officer/director departures & appointments) */
  execChanges: ExecChangeEvent[];
  /** CEO pay per fiscal year, from the proxy statement's tagged
   *  Pay-versus-Performance disclosure (one DEF 14A covers ~5 years) */
  ceoComp: CeoCompYear[];
  /** Link to the proxy statement the comp data came from */
  proxyUrl: string | null;
  form4Available: number;
  form4Parsed: number;
}

// ---------------------------------------------------------------------------
// Minimal XML value extraction.
// EDGAR ownership documents are machine-generated and highly regular, so
// targeted tag extraction is reliable without an XML parser dependency.
// ---------------------------------------------------------------------------

function tagValue(xml: string, tag: string): string | null {
  // Matches <tag>text</tag> or <tag><value>text</value></tag>
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  const inner = m[1];
  const v = inner.match(/<value>([\s\S]*?)<\/value>/);
  return (v ? v[1] : inner).trim();
}

function tagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
  return blocks;
}

function numValue(xml: string, tag: string): number | null {
  const raw = tagValue(xml, tag);
  if (raw === null || raw === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

interface ParsedForm4 {
  transactions: InsiderTransaction[];
}

function isCeoTitle(title: string | null): boolean {
  if (!title) return false;
  // Company CEO only — divisional titles like "CEO, Microsoft Commercial"
  // must not match. Strip combined prefixes (Chairman & CEO, President and
  // CEO, Interim CEO) and require nothing else to remain.
  const stripped = title
    .toLowerCase()
    .replace(/\b(chairman|vice chairman|president|director|interim)\b/g, "")
    .replace(/\band\b/g, " ")
    .replace(/[&,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "ceo" || stripped === "chief executive officer";
}

function parseForm4(xml: string, filingUrl: string): ParsedForm4 {
  const ownerBlock = tagBlocks(xml, "reportingOwner")[0] ?? "";
  const rawName = tagValue(ownerBlock, "rptOwnerName") ?? "Unknown";
  // EDGAR names are "LAST FIRST MIDDLE" all-caps; keep as-is but tidy spacing
  const owner = rawName.replace(/\s+/g, " ").trim();
  const isOfficer = tagValue(ownerBlock, "isOfficer") === "1" || tagValue(ownerBlock, "isOfficer") === "true";
  const isDirector = tagValue(ownerBlock, "isDirector") === "1" || tagValue(ownerBlock, "isDirector") === "true";
  const role = tagValue(ownerBlock, "officerTitle") || (isDirector ? "Director" : null);
  const isCeo = isCeoTitle(role);

  const transactions: InsiderTransaction[] = [];
  for (const tx of tagBlocks(xml, "nonDerivativeTransaction")) {
    const code = tagValue(tx, "transactionCode") ?? "J";
    const shares = numValue(tx, "transactionShares");
    const price = numValue(tx, "transactionPricePerShare");
    const acquired = (tagValue(tx, "transactionAcquiredDisposedCode") ?? "A") === "A";
    const date = tagValue(tx, "transactionDate") ?? "";
    // Only count direct holdings for the ownership series — indirect
    // (trusts, family) double-counts across filings
    const ownership = tagValue(tx, "directOrIndirectOwnership");
    const after = ownership === "D" ? numValue(tx, "sharesOwnedFollowingTransaction") : null;

    transactions.push({
      date,
      owner,
      role,
      isCeo,
      isOfficer,
      isDirector,
      code,
      codeLabel: TRANSACTION_CODE_LABELS[code] ?? `Code ${code}`,
      acquired,
      shares,
      price,
      value: shares !== null && price !== null ? shares * price : null,
      sharesOwnedAfter: after,
      filingUrl,
    });
  }
  return { transactions };
}

// ---------------------------------------------------------------------------
// CEO compensation from the proxy statement's inline XBRL.
// The Pay-versus-Performance disclosure (required since 2022) is tagged with
// the ecd taxonomy inside the DEF 14A HTML — data.sec.gov's structured APIs
// don't aggregate it, so we extract the tags directly.
// ---------------------------------------------------------------------------

function parseProxyCeoComp(html: string): CeoCompYear[] {
  const factRe =
    /<ix:nonfraction[^>]*name="ecd:(PeoTotalCompAmt|PeoActuallyPaidCompAmt)"[^>]*contextref="([^"]+)"[^>]*>([\s\S]*?)<\/ix:nonfraction>/gi;
  const facts: { tag: string; ctx: string; value: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = factRe.exec(html)) !== null) {
    const raw = m[3].replace(/<[^>]+>/g, "").replace(/[,$\s]/g, "");
    const value = parseFloat(raw);
    if (!isNaN(value)) facts.push({ tag: m[1], ctx: m[2], value });
  }
  if (facts.length === 0) return [];

  const ctxRe =
    /<xbrli:context id="([^"]+)">[\s\S]*?<xbrli:startdate>([^<]+)<\/xbrli:startdate>[\s\S]*?<xbrli:enddate>([^<]+)<\/xbrli:enddate>[\s\S]*?<\/xbrli:context>/gi;
  const ctxEndYear = new Map<string, number>();
  while ((m = ctxRe.exec(html)) !== null) {
    ctxEndYear.set(m[1], parseInt(m[3].substring(0, 4), 10));
  }

  const byYear = new Map<number, { total?: number; paid?: number }>();
  for (const f of facts) {
    const year = ctxEndYear.get(f.ctx);
    if (year === undefined) continue;
    const entry = byYear.get(year) ?? {};
    if (f.tag === "PeoTotalCompAmt") entry.total = f.value;
    else entry.paid = f.value;
    byYear.set(year, entry);
  }

  return Array.from(byYear.entries())
    .filter(([, e]) => e.total !== undefined)
    .map(([fiscalYear, e]) => ({
      fiscalYear,
      totalComp: e.total!,
      compActuallyPaid: e.paid ?? null,
    }))
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export async function buildManagementData(ticker: string): Promise<ManagementPayload> {
  const upper = ticker.toUpperCase();

  let cik: string;
  try {
    cik = await resolveTickerToCIK(upper);
  } catch {
    return {
      ticker: upper,
      companyName: null,
      cik: null,
      available: false,
      unavailableReason: "Not an SEC filer — insider filings (Form 4) are only available for US-listed companies.",
      transactions: [],
      ceoOwnership: [],
      execChanges: [],
      ceoComp: [],
      proxyUrl: null,
      form4Available: 0,
      form4Parsed: 0,
    };
  }

  const submissions = await getSubmissions(cik);
  const recent = submissions.filings.recent;

  const form4Refs: { accession: string; doc: string; filed: string }[] = [];
  const execChanges: ExecChangeEvent[] = [];
  let proxyRef: { accession: string; doc: string } | null = null;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "DEF 14A" && !proxyRef) {
      proxyRef = { accession: recent.accessionNumber[i], doc: recent.primaryDocument[i] };
    }
    if (recent.form[i] === "4" && form4Refs.length < MAX_FORM4_FETCHES) {
      form4Refs.push({
        accession: recent.accessionNumber[i],
        doc: recent.primaryDocument[i],
        filed: recent.filingDate[i],
      });
    }
    if (
      recent.form[i] === "8-K" &&
      (recent.items?.[i] ?? "").includes("5.02") &&
      execChanges.length < MAX_EXEC_CHANGE_EVENTS
    ) {
      execChanges.push({
        date: recent.filingDate[i],
        filingUrl: filingIndexUrl(cik, recent.accessionNumber[i]),
      });
    }
  }

  const form4Available = recent.form.filter((f) => f === "4").length;

  const transactions: InsiderTransaction[] = [];
  let parsed = 0;
  for (const ref of form4Refs) {
    try {
      const xml = await fetchFilingDocument(cik, ref.accession, ref.doc);
      const url = filingIndexUrl(cik, ref.accession);
      transactions.push(...parseForm4(xml, url).transactions);
      parsed++;
    } catch {
      // Skip unparseable/missing filings — count reported via form4Parsed
    }
  }

  transactions.sort((a, b) => (a.date < b.date ? 1 : -1));

  // CEO compensation from the latest proxy statement (5 years per filing)
  let ceoComp: CeoCompYear[] = [];
  let proxyUrl: string | null = null;
  if (proxyRef) {
    try {
      const proxyHtml = await fetchFilingDocument(cik, proxyRef.accession, proxyRef.doc);
      ceoComp = parseProxyCeoComp(proxyHtml);
      proxyUrl = filingIndexUrl(cik, proxyRef.accession);
    } catch {
      // Comp data is a bonus — don't fail the whole payload over it
    }
  }

  // CEO ownership over time: direct shares after each CEO transaction
  const ceoOwnership: CeoOwnershipPoint[] = transactions
    .filter((t) => t.isCeo && t.sharesOwnedAfter !== null && t.date)
    .map((t) => ({ date: t.date, owner: t.owner, shares: t.sharesOwnedAfter! }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    ticker: upper,
    companyName: submissions.name ?? null,
    cik,
    available: transactions.length > 0,
    unavailableReason:
      transactions.length > 0 ? null : "No parseable Form 4 (insider transaction) filings found.",
    transactions,
    ceoOwnership,
    execChanges,
    ceoComp,
    proxyUrl,
    form4Available,
    form4Parsed: parsed,
  };
}
