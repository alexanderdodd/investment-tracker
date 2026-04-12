# Key risks specification

## Problem

The `keyRisks` field in structured insights is only populated from QA validation issues. When all QA checks pass (which is the desired state), the Key Risks section is empty. This leaves users without critical risk context alongside the valuation verdict.

## Requirement

Key risks must be deterministically derived from the company's financial data, cycle position, and valuation context — not from QA failures or LLM invention.

## Risk categories

### 1. Cycle risks (from financial model)
- **Peak cycle risk**: If cycle state is `peak` or `above_mid`, flag that current profitability may not be sustainable
- **Margin reversion risk**: If current margins exceed 5Y average by >50%, flag mean-reversion risk with the historical range
- **Revenue concentration in up-cycle**: If revenue growth is >30% YoY in a cyclical sector, flag potential reversal

### 2. Valuation risks (from fair value synthesis)
- **Valuation uncertainty**: If confidence is LOW, explain why the fair value estimate has wide error bars
- **Method disagreement**: If primary methods disagree by >25%, flag that different valuation approaches give very different answers
- **Price vs fair value divergence**: If price is >2x or <0.5x the mid fair value, flag extreme over/undervaluation risk

### 3. Balance sheet risks (from canonical facts)
- **Leverage risk**: If debt/equity > 1.0 or debt/EBITDA > 3.0
- **Liquidity risk**: If current debt exceeds cash
- **Capital intensity risk**: If capex/revenue > 25% in cyclical sector

### 4. Industry/structural risks (from sector classification)
- **Cyclical industry**: Always flag for cyclical sectors
- **Technology disruption**: Flag for tech/semiconductor sectors
- **Geopolitical exposure**: Flag for companies with significant international operations

## Output format

```typescript
interface KeyRisk {
  label: string;       // Short title (e.g., "Peak Cycle Risk")
  detail: string;      // 1-2 sentence explanation with data
  severity: "high" | "medium" | "low";
  category: "cycle" | "valuation" | "balance_sheet" | "industry";
}
```

## Rules

1. All risks must be derived from deterministic data — no LLM-generated risks
2. Include at least 2 risks for any cyclical company at peak
3. Maximum 7 risks to avoid noise
4. Order by severity (high first)
5. Each risk must cite specific data points (margins, ratios, etc.)

## Acceptance criteria

| ID | Requirement | Pass condition |
|---|---|---|
| `RISK-001` | Key risks populated | At least 2 risks for MU at peak cycle |
| `RISK-002` | Risks are deterministic | Same inputs produce same risks |
| `RISK-003` | Risks cite data | Each risk references specific metrics |
| `RISK-004` | No LLM-generated risks | Risks come from code, not narrative |
| `RISK-005` | Risks ordered by severity | High severity risks appear first |
