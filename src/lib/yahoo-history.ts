import { normalizeCurrency } from "@/lib/currency";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/**
 * Fetch the daily closing price for a ticker on (or the last trading day
 * before) a target date, normalised to the major currency unit. Returns null
 * if no data is available.
 */
export async function fetchHistoricalClose(
  ticker: string,
  date: Date
): Promise<{ close: number; currency: string } | null> {
  const target = date.getTime();
  // Window: a week before (to catch weekends/holidays) to two days after.
  const period1 = Math.floor((target - 8 * 86400_000) / 1000);
  const period2 = Math.floor((target + 2 * 86400_000) / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps?.length || !closes?.length) return null;

    const { currency, divisor } = normalizeCurrency(result?.meta?.currency);
    // End of the target day (UTC) — pick the latest close at or before it.
    const cutoff = target + 86400_000;
    let chosen: number | null = null;
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] * 1000 <= cutoff && closes[i] != null) {
        chosen = closes[i] as number;
      }
    }
    // If nothing on/before the date, fall back to the earliest available close.
    if (chosen == null) {
      chosen = closes.find((c) => c != null) ?? null;
    }
    if (chosen == null) return null;

    return { close: chosen / divisor, currency };
  } catch {
    return null;
  }
}
