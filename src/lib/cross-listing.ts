/**
 * Cross-listing identity for the Big Five screen.
 *
 * A company can appear under many tickers — its primary listing (a US SEC
 * filer, or a European ESEF filer) plus a spray of foreign shadow listings
 * (ORCL.VI, 1YD0.F, …). The shadow listings build their fundamentals from the
 * thin Yahoo fallback, so they carry unreliable growth, valuations and scores.
 *
 * These helpers let a query (a) collapse a company's listings to one row and
 * (b) suppress the untrustworthy Yahoo shadow listings whenever a real
 * filing-sourced sibling exists — keyed off `source`/`cik` on big_five_screen.
 */

import { sql, type SQL } from "drizzle-orm";

// Trailing legal-entity suffixes stripped so the same company matches across
// venues despite naming drift ("ORACLE CORP" vs "Oracle Corporation"). Applied
// twice to catch two trailing tokens ("… Group Ltd").
const SUFFIX =
  "\\s+(corporation|corp|incorporated|inc|company|co|limited|ltd|plc|ag|sa|nv|spa|ab|asa|oyj|group|holding|holdings)\\.?$";

/** Normalized company key for a table alias's (company_name, ticker) pair. */
export function normNameSql(alias: string): SQL {
  const col = sql.raw(`coalesce(${alias}.company_name, ${alias}.ticker)`);
  return sql`regexp_replace(regexp_replace(regexp_replace(lower(${col}), ${SUFFIX}, '', 'g'), ${SUFFIX}, '', 'g'), '[^a-z0-9]', '', 'g')`;
}

/** True when a row's fundamentals came from a real filing (SEC or ESEF). */
export function isFilingSql(alias: string): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.source in ('sec', 'esef') or ${a}.cik is not null)`;
}

/**
 * Ranking for "keep one listing per company": filing sources first, then the
 * un-suffixed (primary) ticker, so dedup favours the real listing.
 */
export function primaryRankSql(alias: string): SQL {
  const a = sql.raw(alias);
  return sql`(case
    when ${isFilingSql(alias)} then 3
    when ${a}.ticker !~ '^[0-9]' then 2
    when position('.' in ${a}.ticker) = 0 then 1
    else 0 end)`;
}

/**
 * Condition (for the `big_five_screen` table, unaliased) that keeps a row
 * unless it's a non-filing shadow listing of a company that DOES have a
 * filing-sourced listing somewhere. The inner set is uncorrelated, so Postgres
 * evaluates it once.
 */
export function keepPrimaryListingSql(): SQL {
  return sql`(
    ${isFilingSql("big_five_screen")}
    or ${normNameSql("big_five_screen")} not in (
      select ${normNameSql("f")}
      from big_five_screen f
      where f.available and ${isFilingSql("f")}
    )
  )`;
}

// Currencies whose presence in a company's listing group reveals a non-European
// HOME market — used to drop European-venue shadow listings of US/Asian giants
// (Oracle, Tencent …) from the Europe/UK region filter. USD is deliberately
// excluded: genuine European companies commonly carry a USD ADR.
const NON_EUROPEAN_HOME_CURRENCIES = [
  "HKD", "JPY", "CNY", "CNH", "KRW", "TWD", "SGD", "INR", "THB", "IDR", "MYR", "PHP",
];

/**
 * Condition (for the unaliased `big_five_screen`) admitting only listings whose
 * company's HOME market is European: no SEC filer in the group (US home) and no
 * sibling quoted in an Asian home currency (Asian home). Layer this on top of
 * the currency-based region filter so region=eu/uk shows real European names,
 * not relisted foreign shadows.
 */
export function europeanHomeSql(): SQL {
  const asian = sql.join(
    NON_EUROPEAN_HOME_CURRENCIES.map((c) => sql`${c}`),
    sql`, `
  );
  return sql`not exists (
    select 1 from big_five_screen g
    where ${normNameSql("g")} = ${normNameSql("big_five_screen")}
      and (g.cik is not null or g.currency in (${asian}))
  )`;
}
