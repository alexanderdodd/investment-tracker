/**
 * SIC-based peer discovery module.
 *
 * Discovers peer companies using SEC EDGAR SIC codes, then filters by
 * market cap proximity, filing recency, and curated overrides.
 *
 * See: .claude/features/peer-registry-creation/02-peer-discovery-strategy.md
 */

import { getSubmissions } from "../sec-edgar/client";
import { fetchMarketData } from "../market-data/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerCandidate {
  ticker: string;
  companyName: string;
  cik: string;
  sic: string;
  sicDescription: string;
  matchLevel: "sic_4digit" | "sic_3digit" | "curated_add";
  marketCap: number | null;
  lastFilingDate: string | null;
  /** Per-peer quality score (0-1), computed later */
  qualityScore?: number;
}

// ---------------------------------------------------------------------------
// Simplify SIC description for EDGAR full-text search
// ---------------------------------------------------------------------------

function simplifySectorSearch(sicDescription: string): string {
  // Map verbose SIC descriptions to simpler search terms that match filing text
  const simplifications: Record<string, string> = {
    "Fire, Marine & Casualty Insurance": "property casualty insurance",
    "Pharmaceutical Preparations": "pharmaceutical",
    "Semiconductors & Related Devices": "semiconductor",
    "Electronic Computers": "computer hardware",
    "Retail-Drug Stores and Proprietary Stores": "retail pharmacy",
    "Services-Prepackaged Software": "software",
    "Services-Computer Programming, Data Processing": "technology services",
    "National Commercial Banks-State": "commercial banking",
    "State Commercial Banks-Federal Reserve": "commercial banking",
    "Crude Petroleum & Natural Gas": "oil gas exploration",
    "Electric Services": "electric utility",
    "Telephone Communications": "telecommunications",
  };

  if (simplifications[sicDescription]) {
    return simplifications[sicDescription];
  }

  // Generic simplification: take the most distinctive words
  // Remove common prefixes like "Services-", "Retail-", etc.
  let simplified = sicDescription
    .replace(/^(Services|Retail|Wholesale)-/i, "")
    .replace(/[&,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If still long, take just the first two meaningful words
  const words = simplified.split(" ").filter(w => w.length > 3 && !["and", "the", "for", "with"].includes(w.toLowerCase()));
  if (words.length > 2) {
    simplified = words.slice(0, 2).join(" ");
  }

  return simplified;
}

// ---------------------------------------------------------------------------
// SIC-based company ticker map with SIC codes
// ---------------------------------------------------------------------------

interface TickerExchangeEntry {
  cik: number;
  name: string;
  ticker: string;
  exchange: string;
  sic: string;
}

let sicTickerMap: TickerExchangeEntry[] | null = null;

async function loadSicTickerMap(): Promise<TickerExchangeEntry[]> {
  if (sicTickerMap) return sicTickerMap;

  try {
    // company_tickers_exchange.json includes SIC codes
    const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      headers: { "User-Agent": "investment-tracker/1.0 (research)" },
    });
    const data = await res.json();

    // Format: { fields: [...], data: [[cik, name, ticker, exchange, sic], ...] }
    const fields: string[] = data.fields;
    const rows: (string | number)[][] = data.data;

    const cikIdx = fields.indexOf("cik");
    const nameIdx = fields.indexOf("name");
    const tickerIdx = fields.indexOf("ticker");
    const exchangeIdx = fields.indexOf("exchange");
    const sicIdx = fields.indexOf("sic"); // may not exist in all versions

    sicTickerMap = rows.map(row => ({
      cik: Number(row[cikIdx]),
      name: String(row[nameIdx]),
      ticker: String(row[tickerIdx]),
      exchange: String(row[exchangeIdx]),
      sic: sicIdx >= 0 ? String(row[sicIdx]) : "",
    }));

    return sicTickerMap;
  } catch (err) {
    console.warn("Failed to load company_tickers_exchange.json:", err);
    sicTickerMap = [];
    return sicTickerMap;
  }
}

// ---------------------------------------------------------------------------
// Curated overrides for known problem cases
// ---------------------------------------------------------------------------

const CURATED_OVERRIDES: Record<string, { add: string[]; remove: string[]; notes: string }> = {
  MU: {
    add: ["WDC"],
    remove: ["NVDA", "AMD", "INTC", "QCOM", "AVGO", "TXN", "MCHP"],
    notes: "Memory is a distinct sub-segment of SIC 3674. Remove logic/analog chip companies.",
  },
};

// ---------------------------------------------------------------------------
// Main discovery function
// ---------------------------------------------------------------------------

export async function discoverPeers(
  subjectTicker: string,
  subjectSic: string,
  subjectMarketCap: number,
  subjectSicDescription?: string,
  options?: { maxCandidates?: number; skipMarketData?: boolean }
): Promise<PeerCandidate[]> {
  const maxCandidates = options?.maxCandidates ?? 8;
  const upper = subjectTicker.toUpperCase();
  const override = CURATED_OVERRIDES[upper];

  let candidates: PeerCandidate[] = [];

  if (subjectSic.length >= 4) {
    // Use EDGAR full-text search to find companies in the same sector
    // Simplify the sector name for better search results
    try {
      const rawSector = subjectSicDescription || subjectSic;
      // Extract the most distinctive keyword(s) from the SIC description
      const sectorForSearch = simplifySectorSearch(rawSector);
      const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(sectorForSearch)}%22&forms=10-K&dateRange=custom&startdt=2025-06-01&enddt=2026-12-31&from=0&size=50`;
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": "investment-tracker/1.0 research@example.com" },
      });

      if (res.ok) {
        const data = await res.json();
        const hits = data?.hits?.hits ?? [];

        const seen = new Set<string>();
        for (const hit of hits) {
          const src = hit._source || hit;
          // Extract ticker from display_names like "PEPSICO INC  (PEP)  (CIK ...)"
          const displayNames: string[] = src.display_names ?? [];
          for (const dn of displayNames) {
            const tickerMatch = dn.match(/\(([A-Z]{1,5}(?:[-][A-Z])?)\)\s+\(CIK/);
            if (!tickerMatch) continue;
            const peerTicker = tickerMatch[1];
            if (peerTicker === upper || seen.has(peerTicker)) continue;
            seen.add(peerTicker);

            const nameMatch = dn.match(/^(.+?)\s+\(/);
            const companyName = nameMatch ? nameMatch[1].trim() : peerTicker;
            const cikMatch = dn.match(/CIK\s+(\d+)/);
            const cik = cikMatch ? cikMatch[1].padStart(10, "0") : "";

            candidates.push({
              ticker: peerTicker,
              companyName,
              cik,
              sic: subjectSic,
              sicDescription: "",
              matchLevel: "sic_4digit",
              marketCap: null,
              lastFilingDate: null,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Peer discovery: EDGAR search failed for SIC ${subjectSic}:`, err);
    }

    // If EDGAR search didn't work, try the ticker map as fallback
    if (candidates.length === 0) {
      const allTickers = await loadSicTickerMap();
      const hasSic = allTickers.some(t => t.sic && t.sic.length >= 4);
      if (hasSic) {
        const sic4 = subjectSic.substring(0, 4);
        const exact = allTickers.filter(t =>
          t.sic.substring(0, 4) === sic4 &&
          t.ticker.toUpperCase() !== upper &&
          t.exchange !== ""
        );
        for (const t of exact.slice(0, 30)) {
          candidates.push({
            ticker: t.ticker, companyName: t.name,
            cik: String(t.cik).padStart(10, "0"), sic: t.sic,
            sicDescription: "", matchLevel: "sic_4digit",
            marketCap: null, lastFilingDate: null,
          });
        }
      }
    }
  }

  // Apply curated overrides
  if (override) {
    const removeSet = new Set(override.remove.map(t => t.toUpperCase()));
    candidates = candidates.filter(c => !removeSet.has(c.ticker.toUpperCase()));

    for (const addTicker of override.add) {
      if (!candidates.some(c => c.ticker.toUpperCase() === addTicker.toUpperCase())) {
        candidates.push({
          ticker: addTicker,
          companyName: "",
          cik: "",
          sic: "",
          sicDescription: "",
          matchLevel: "curated_add",
          marketCap: null,
          lastFilingDate: null,
        });
      }
    }
  }

  // Fetch market cap for top candidates to apply size filter
  if (!options?.skipMarketData) {
    const topCandidates = candidates.slice(0, 15);
    const marketDataPromises = topCandidates.map(async (c) => {
      try {
        const md = await fetchMarketData(c.ticker);
        c.marketCap = md.marketCap;
        c.companyName = c.companyName || c.ticker; // fill in if missing
      } catch {
        // Market data unavailable — keep candidate with null market cap
      }
    });
    await Promise.all(marketDataPromises);
  }

  // Market cap filter: 0.1x – 10x of subject
  if (subjectMarketCap > 0) {
    const minCap = subjectMarketCap * 0.1;
    const maxCap = subjectMarketCap * 10;
    candidates = candidates.filter(c =>
      c.marketCap === null || // keep candidates without market data (they'll get lower quality)
      (c.marketCap >= minCap && c.marketCap <= maxCap)
    );
  }

  // Sort by: matchLevel quality, then market cap proximity
  candidates.sort((a, b) => {
    const levelOrder = { sic_4digit: 0, curated_add: 1, sic_3digit: 2 };
    const aLevel = levelOrder[a.matchLevel] ?? 3;
    const bLevel = levelOrder[b.matchLevel] ?? 3;
    if (aLevel !== bLevel) return aLevel - bLevel;

    // Within same level, sort by market cap proximity
    if (a.marketCap && b.marketCap && subjectMarketCap > 0) {
      const aRatio = Math.min(a.marketCap, subjectMarketCap) / Math.max(a.marketCap, subjectMarketCap);
      const bRatio = Math.min(b.marketCap, subjectMarketCap) / Math.max(b.marketCap, subjectMarketCap);
      return bRatio - aRatio; // closer to 1.0 is better
    }
    return 0;
  });

  return candidates.slice(0, maxCandidates);
}
