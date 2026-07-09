/**
 * ESEF client — filings.xbrl.org, the closest thing Europe has to EDGAR.
 *
 * EU/EEA (and UK) listed companies must file inline-XBRL annual reports
 * (ESEF mandate, ifrs-full taxonomy) with their national registries;
 * filings.xbrl.org aggregates them with pre-extracted xBRL-JSON facts.
 * Coverage starts ~2020 and notably EXCLUDES Germany (closed registry)
 * and Switzerland (not in the EU) — those route via ADR 20-Fs instead.
 */

const BASE = "https://filings.xbrl.org";
const UA = "InvestmentTracker support@investment-tracker.app";

export interface EsefFilingRef {
  periodEnd: string; // "2024-12-31"
  country: string | null;
  jsonUrl: string | null;
}

export interface EsefEntity {
  lei: string;
  name: string;
}

/** xBRL-JSON: facts keyed by id, each with dimensions + value */
export interface EsefFacts {
  facts: Record<
    string,
    {
      dimensions: Record<string, string> & {
        concept?: string;
        period?: string;
        unit?: string;
      };
      value: string | number | null;
    }
  >;
}

async function get(path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`filings.xbrl.org ${res.status}: ${path}`);
  return res;
}

/** Case-insensitive entity search by (partial) legal name */
export async function searchEsefEntities(name: string): Promise<EsefEntity[]> {
  const filter = encodeURIComponent(
    JSON.stringify([{ name: "name", op: "ilike", val: `%${name}%` }])
  );
  const res = await get(`/api/entities?page%5Bsize%5D=10&filter=${filter}`);
  const json = await res.json();
  return (json.data ?? []).map(
    (e: { attributes: { identifier: string; name: string } }) => ({
      lei: e.attributes.identifier,
      name: e.attributes.name,
    })
  );
}

export async function getEsefFilings(lei: string): Promise<EsefFilingRef[]> {
  const res = await get(`/api/entities/${encodeURIComponent(lei)}/filings`);
  const json = await res.json();
  const filings: EsefFilingRef[] = (json.data ?? []).map(
    (f: { attributes: { period_end?: string; country?: string; json_url?: string } }) => ({
      periodEnd: f.attributes.period_end ?? "",
      country: f.attributes.country ?? null,
      jsonUrl: f.attributes.json_url ?? null,
    })
  );
  return filings
    .filter((f) => f.periodEnd && f.jsonUrl)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1));
}

export async function fetchEsefFacts(jsonUrl: string): Promise<EsefFacts> {
  const res = await get(jsonUrl);
  return res.json();
}

/**
 * Resolve a company name (from Yahoo) to an ESEF entity. Tries the full
 * name, then progressively drops legal-form suffixes; requires the match to
 * actually have filings. Returns null when the company isn't in ESEF
 * (German/Swiss/US listings, etc.).
 */
export async function resolveEsefEntity(
  companyName: string
): Promise<{ entity: EsefEntity; filings: EsefFilingRef[] } | null> {
  // ESEF entity names are diacritic-free upper case ("LVMH MOET HENNESSY…")
  // while Yahoo uses display names ("LVMH Moët Hennessy - Louis Vuitton,
  // Société Européenne") — fold diacritics before matching
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normalize = (s: string) => fold(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  const folded = fold(companyName);
  const candidates: string[] = [folded];
  const stripped = folded
    .replace(/\b(N\.?V\.?|S\.?A\.?|SE|PLC|AG|A\/S|ASA|AB|OYJ|SpA|S\.p\.A\.|Societe Europeenne|Aktiengesellschaft|Holding(s)?|Group|Corporation|Inc\.?)\b/gi, "")
    .replace(/[,.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && stripped !== folded) candidates.push(stripped);
  // Progressively shorter prefixes ("LVMH Moet Hennessy…" → "LVMH Moet" → "LVMH")
  const words = stripped.split(" ").filter(Boolean);
  if (words.length > 2) candidates.push(words.slice(0, 2).join(" "));
  if (words.length > 1 && words[0].length >= 4) candidates.push(words[0]);

  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    let entities: EsefEntity[];
    try {
      entities = await searchEsefEntities(candidate);
    } catch {
      continue;
    }
    // Prefer the entity whose normalized name best matches the query
    const target = normalize(companyName);
    entities.sort((a, b) => {
      const aScore = target.startsWith(normalize(a.name).slice(0, 8)) ? 0 : 1;
      const bScore = target.startsWith(normalize(b.name).slice(0, 8)) ? 0 : 1;
      return aScore - bScore || a.name.length - b.name.length;
    });
    for (const entity of entities.slice(0, 3)) {
      try {
        const filings = await getEsefFilings(entity.lei);
        if (filings.length > 0) return { entity, filings };
      } catch {
        // try next candidate entity
      }
    }
  }
  return null;
}
