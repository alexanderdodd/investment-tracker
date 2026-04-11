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
// SEC requires User-Agent in format "Company Name Contact@email.com"
const USER_AGENT = "InvestmentTracker support@investment-tracker.app";
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

  try {
    const res = await throttledFetch("https://www.sec.gov/files/company_tickers.json");
    const data: Record<string, { cik_str: number; ticker: string; title: string }> =
      await res.json();

    tickerToCikMap = {};
    for (const entry of Object.values(data)) {
      tickerToCikMap[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
    }
    return tickerToCikMap;
  } catch {
    // Fallback: return empty map, individual lookups will use search API
    tickerToCikMap = {};
    return tickerToCikMap;
  }
}

/**
 * Resolve ticker to CIK using the company_tickers.json file,
 * with fallback to EDGAR's full-text search API.
 */
export async function resolveTickerToCIK(ticker: string): Promise<string> {
  const upper = ticker.toUpperCase();

  // Try the bulk ticker map first
  const map = await loadTickerMap();
  if (map[upper]) return map[upper];

  // Fallback: use EDGAR company search API
  const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${upper}%22&dateRange=custom&forms=10-K&from=0&size=1`;
  try {
    const res = await throttledFetch(searchUrl);
    const data = await res.json();
    const hits = data?.hits?.hits;
    if (hits && hits.length > 0) {
      // Extract CIK from the accession number or _source
      const source = hits[0]._source || hits[0];
      const entityName = source?.entity_name;
      const fileNum = source?.file_num;
      // Try to get CIK from the filing index
      if (source?.entity_id) {
        return String(source.entity_id).padStart(10, "0");
      }
    }
  } catch {
    // Search API also failed
  }

  // Fallback: try the company tickers exchange JSON
  try {
    const res = await throttledFetch(`${BASE}/submissions/CIK${upper.padStart(10, "0")}.json`);
    const data = await res.json();
    if (data?.cik) {
      return String(data.cik).padStart(10, "0");
    }
  } catch {
    // Direct CIK lookup failed
  }

  // Last resort: try EDGAR company search
  try {
    const searchRes = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${upper}%22&forms=10-K`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      // Parse CIK from results if available
      const firstHit = data?.hits?.hits?.[0];
      if (firstHit?._source?.entity_id) {
        return String(firstHit._source.entity_id).padStart(10, "0");
      }
    }
  } catch {
    // All fallbacks exhausted
  }

  throw new Error(`No CIK found for ticker: ${ticker}. SEC EDGAR lookup failed.`);
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
