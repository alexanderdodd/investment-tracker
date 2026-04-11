/**
 * SEC EDGAR API client.
 *
 * Endpoints used:
 *   - data.sec.gov/submissions/CIK##########.json   (filing history)
 *   - data.sec.gov/api/xbrl/companyfacts/CIK##########.json (all XBRL facts)
 *
 * Rate limit: 10 requests/sec.  SEC requires a descriptive User-Agent header.
 */

const BASE = "https://data.sec.gov";
const USER_AGENT = "InvestmentTracker/1.0 (investment-tracker-app)";
const MIN_REQUEST_INTERVAL_MS = 120; // ~8 req/s to stay safely under 10

let lastRequestTime = 0;

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`SEC EDGAR ${res.status}: ${url}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// CIK resolution
// ---------------------------------------------------------------------------

let tickerToCikMap: Record<string, string> | null = null;

async function loadTickerMap(): Promise<Record<string, string>> {
  if (tickerToCikMap) return tickerToCikMap;

  const res = await throttledFetch(`${BASE}/files/company_tickers.json`);
  const data: Record<string, { cik_str: number; ticker: string; title: string }> =
    await res.json();

  tickerToCikMap = {};
  for (const entry of Object.values(data)) {
    tickerToCikMap[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
  }
  return tickerToCikMap;
}

export async function resolveTickerToCIK(ticker: string): Promise<string> {
  const map = await loadTickerMap();
  const cik = map[ticker.toUpperCase()];
  if (!cik) throw new Error(`No CIK found for ticker: ${ticker}`);
  return cik;
}

// ---------------------------------------------------------------------------
// Submissions (filing history)
// ---------------------------------------------------------------------------

export interface EdgarSubmissions {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string; // "0831" → August
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

export async function getSubmissions(cik: string): Promise<EdgarSubmissions> {
  const res = await throttledFetch(`${BASE}/submissions/CIK${cik}.json`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Company Facts (all XBRL data)
// ---------------------------------------------------------------------------

export interface XbrlUnit {
  start?: string;
  end?: string;
  instant?: string;
  val: number;
  accn: string;
  fy: number;
  fp: string; // "Q1", "Q2", "Q3", "FY"
  form: string;
  filed: string;
  frame?: string; // "CY2025Q2" etc.
}

export interface XbrlConcept {
  label: string;
  description: string;
  units: Record<string, XbrlUnit[]>; // keyed by unit e.g. "USD", "USD/shares", "shares"
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, XbrlConcept>;
    dei?: Record<string, XbrlConcept>;
    [taxonomy: string]: Record<string, XbrlConcept> | undefined;
  };
}

export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const res = await throttledFetch(
    `${BASE}/api/xbrl/companyfacts/CIK${cik}.json`
  );
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers: find latest filings of a specific type
// ---------------------------------------------------------------------------

export interface FilingRef {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
}

export function findLatestFilings(
  submissions: EdgarSubmissions,
  formType: string,
  limit = 1
): FilingRef[] {
  const { recent } = submissions.filings;
  const results: FilingRef[] = [];

  for (let i = 0; i < recent.form.length && results.length < limit; i++) {
    if (recent.form[i] === formType) {
      results.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        form: recent.form[i],
        primaryDocument: recent.primaryDocument[i],
      });
    }
  }
  return results;
}
