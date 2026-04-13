import { generateText } from "ai";
import { openrouter } from "./ai";
import { getDb } from "../db/index";
import { sectorValueStocks } from "../db/schema";
import { SECTORS, SECTOR_ETFS, type SectorName } from "./sectors";
import { SECTOR_HOLDINGS } from "./sector-holdings";

interface ValueEntry {
  ticker: string;
  companyName: string;
  rationale: string;
  metricLabel: string;
  metricValue: string;
}

function parseJsonFromAI(text: string): ValueEntry[] {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed.slice(0, 10).map((item: Record<string, unknown>) => ({
    ticker: String(item.ticker ?? ""),
    companyName: String(item.companyName ?? ""),
    rationale: String(item.rationale ?? ""),
    metricLabel: String(item.metricLabel ?? ""),
    metricValue: String(item.metricValue ?? ""),
  }));
}

const SECTOR_VALUE_CRITERIA: Record<string, string> = {
  Financials: `- Low price-to-book ratio relative to sector peers
- Strong return on equity (ROE) despite low valuation
- Consistent dividend yield above sector average
- Stable or growing book value per share`,

  Technology: `- Low forward P/E or EV/EBITDA relative to sector peers
- Strong free cash flow generation relative to market cap
- Price-to-sales ratio well below sector average
- Solid operating margins that the market may be undervaluing`,

  "Communication Services": `- Low forward P/E or price-to-sales relative to sector peers
- Strong free cash flow yield
- Dividend yield above sector average (if applicable)
- Undervalued content or subscriber base relative to peers`,

  Energy: `- Low EV/EBITDA or price-to-cash-flow relative to sector peers
- Strong free cash flow yield
- Sustainable dividend with low payout ratio
- Reserve value not fully reflected in share price`,

  Utilities: `- Low P/E ratio relative to sector peers
- Dividend yield above sector average
- Stable regulated earnings with room for rate base growth
- Below-average price-to-book for the sector`,

  "Consumer Staples": `- Low forward P/E relative to sector peers
- Strong free cash flow generation
- Dividend yield above sector average with consistent growth
- Brand value or market position not fully reflected in valuation`,

  "Consumer Discretionary": `- Low forward P/E or EV/EBITDA relative to sector peers
- Strong free cash flow yield
- Price-to-sales ratio well below sector average
- Undervalued brand equity or market position`,

  Industrials: `- Low EV/EBITDA relative to sector peers
- Strong return on invested capital (ROIC)
- Below-average price-to-earnings with stable or growing backlog
- Free cash flow yield above sector median`,

  "Health Care": `- Low forward P/E or EV/EBITDA relative to sector peers
- Strong free cash flow generation
- Pipeline or product portfolio value not reflected in share price
- Dividend yield or buyback yield above sector average`,

  Materials: `- Low EV/EBITDA or price-to-book relative to sector peers
- Strong free cash flow through the cycle
- Asset replacement value above current market cap
- Dividend yield above sector average`,

  "Real Estate": `- Price below net asset value (NAV) or low price-to-FFO
- Dividend yield above sector average
- High-quality property portfolio trading at a discount
- Strong occupancy rates with below-peer valuation`,
};

export async function generateAllValueStocks(onlySector?: SectorName) {
  const db = getDb();
  const results: { sector: string; success: boolean; error?: string }[] = [];
  const sectors = onlySector ? [onlySector] : SECTORS;

  for (const sector of sectors) {
    const ticker = SECTOR_ETFS[sector];
    const holdings = SECTOR_HOLDINGS[ticker] ?? [];
    const excludeList = holdings.map((h) => h.symbol).join(", ");
    const criteria = SECTOR_VALUE_CRITERIA[sector] ?? SECTOR_VALUE_CRITERIA["Industrials"];

    const prompt = `You are a value investing analyst identifying undervalued stocks. For the ${sector} sector (tracked by the ${ticker} ETF), identify 10 potential value stocks that are NOT among these top holdings: ${excludeList}.

Value investing criteria specific to ${sector}:
${criteria}

General requirements:
- Must be publicly traded on US exchanges
- Should have established business operations (not speculative or pre-revenue)
- Focus on companies where the current market price appears to undervalue the business fundamentals
- Prefer companies with a margin of safety — strong balance sheets, consistent earnings, or tangible asset backing

Return ONLY a JSON array with exactly 10 objects in this format:
[{"ticker": "SYMBOL", "companyName": "Full Company Name", "rationale": "1-2 sentence explanation of why this company appears undervalued", "metricLabel": "Key Value Metric (e.g. Forward P/E, P/B Ratio, FCF Yield, Dividend Yield)", "metricValue": "The metric value (e.g. 8.5x, 1.2x, 7.8%, 3.4%)"}]

Use current market data. Be specific with numbers. Return ONLY the JSON array, no other text.`;

    try {
      const { text } = await generateText({
        model: openrouter()("google/gemini-2.5-flash:online"),
        prompt,
      });

      const stocks = parseJsonFromAI(text);

      if (stocks.length === 0) {
        throw new Error("AI returned no valid entries");
      }

      const batchTime = new Date();
      await db.insert(sectorValueStocks).values(
        stocks.map((stock, i) => ({
          sector,
          ticker: stock.ticker,
          companyName: stock.companyName,
          rationale: stock.rationale,
          metricLabel: stock.metricLabel,
          metricValue: stock.metricValue,
          rank: i + 1,
          generatedAt: batchTime,
        }))
      );

      results.push({ sector, success: true });
    } catch (err) {
      results.push({
        sector,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
