/**
 * Formula trace builder for surfaced derived metrics.
 *
 * Every non-primitive numeric field that appears in the user-facing report
 * must have a machine-readable formula trace showing:
 * - the formula used
 * - the input values and whether they are validated
 * - the period scope and share basis
 *
 * See: .claude/features/stock-valuation-spec/05-deterministic-validation-framework.md (Group H)
 */

import type { CanonicalFacts, FinancialModelOutputs } from "./types";

export interface FormulaTraceInput {
  field: string;
  value: number | null;
  validated: boolean;
}

export interface FormulaTrace {
  field: string;
  formula: string;
  result: number | null;
  inputs: FormulaTraceInput[];
  periodScope: string;
  shareBasis: string | null;
}

/**
 * Build formula traces for all derived metrics that may appear in the report.
 */
export function buildFormulaTraces(
  facts: CanonicalFacts,
  model: FinancialModelOutputs
): FormulaTrace[] {
  const traces: FormulaTrace[] = [];

  // Market cap = price × point-in-time shares
  traces.push({
    field: "derived.market_cap",
    formula: "price × point_in_time_shares",
    result: facts.marketCap.value,
    inputs: [
      { field: "market.current_price", value: facts.currentPrice.value, validated: facts.currentPrice.value !== null },
      { field: "shares.point_in_time", value: facts.sharesOutstanding.value, validated: facts.sharesOutstanding.value !== null },
    ],
    periodScope: "point_in_time",
    shareBasis: "point_in_time_shares",
  });

  // Enterprise value = market cap + total debt - total cash/investments
  traces.push({
    field: "derived.enterprise_value",
    formula: "market_cap + total_debt - total_cash_and_investments",
    result: facts.enterpriseValue.value,
    inputs: [
      { field: "derived.market_cap", value: facts.marketCap.value, validated: facts.marketCap.value !== null },
      { field: "balance_sheet.total_debt", value: facts.totalDebt.value, validated: facts.totalDebt.value !== null },
      { field: "balance_sheet.total_cash_and_investments", value: facts.totalCashAndInvestments.value, validated: facts.totalCashAndInvestments.value !== null },
    ],
    periodScope: "point_in_time + latest_balance_sheet",
    shareBasis: null,
  });

  // Trailing P/E = price / TTM diluted EPS
  traces.push({
    field: "derived.trailing_pe",
    formula: "price / ttm_diluted_eps",
    result: facts.trailingPE.value,
    inputs: [
      { field: "market.current_price", value: facts.currentPrice.value, validated: facts.currentPrice.value !== null },
      { field: "ttm.diluted_eps", value: facts.ttmDilutedEPS.value, validated: facts.ttmDilutedEPS.value !== null },
    ],
    periodScope: "TTM",
    shareBasis: "weighted_average_diluted",
  });

  // Book value per share = total equity / point-in-time shares
  traces.push({
    field: "derived.book_value_per_share",
    formula: "total_equity / point_in_time_shares",
    result: facts.bookValuePerShare.value,
    inputs: [
      { field: "balance_sheet.total_equity", value: facts.totalEquity.value, validated: facts.totalEquity.value !== null },
      { field: "shares.point_in_time", value: facts.sharesOutstanding.value, validated: facts.sharesOutstanding.value !== null },
    ],
    periodScope: "point_in_time",
    shareBasis: "point_in_time_shares",
  });

  // P/B = price / book value per share
  traces.push({
    field: "derived.price_to_book",
    formula: "price / book_value_per_share",
    result: facts.priceToBook.value,
    inputs: [
      { field: "market.current_price", value: facts.currentPrice.value, validated: facts.currentPrice.value !== null },
      { field: "derived.book_value_per_share", value: facts.bookValuePerShare.value, validated: facts.bookValuePerShare.value !== null },
    ],
    periodScope: "point_in_time",
    shareBasis: "point_in_time_shares",
  });

  // EV/Revenue = EV / TTM revenue
  traces.push({
    field: "derived.ev_to_revenue",
    formula: "enterprise_value / ttm_revenue",
    result: facts.evToRevenue.value,
    inputs: [
      { field: "derived.enterprise_value", value: facts.enterpriseValue.value, validated: facts.enterpriseValue.value !== null },
      { field: "ttm.revenue", value: facts.ttmRevenue.value, validated: facts.ttmRevenue.value !== null },
    ],
    periodScope: "TTM",
    shareBasis: null,
  });

  // EV/EBIT = EV / TTM operating income
  const evEbit = facts.enterpriseValue.value !== null && facts.ttmOperatingIncome.value !== null && facts.ttmOperatingIncome.value !== 0
    ? facts.enterpriseValue.value / facts.ttmOperatingIncome.value
    : null;
  traces.push({
    field: "derived.ev_to_ebit",
    formula: "enterprise_value / ttm_operating_income",
    result: evEbit,
    inputs: [
      { field: "derived.enterprise_value", value: facts.enterpriseValue.value, validated: facts.enterpriseValue.value !== null },
      { field: "ttm.operating_income", value: facts.ttmOperatingIncome.value, validated: facts.ttmOperatingIncome.value !== null },
    ],
    periodScope: "TTM",
    shareBasis: null,
  });

  // EV/FCF = EV / TTM GAAP FCF
  const evFcf = facts.enterpriseValue.value !== null && facts.ttmFCF.value !== null && facts.ttmFCF.value !== 0
    ? facts.enterpriseValue.value / facts.ttmFCF.value
    : null;
  traces.push({
    field: "derived.ev_to_fcf",
    formula: "enterprise_value / ttm_gaap_free_cash_flow",
    result: evFcf,
    inputs: [
      { field: "derived.enterprise_value", value: facts.enterpriseValue.value, validated: facts.enterpriseValue.value !== null },
      { field: "ttm.gaap_free_cash_flow", value: facts.ttmFCF.value, validated: facts.ttmFCF.value !== null },
    ],
    periodScope: "TTM",
    shareBasis: null,
  });

  // EV/EBITDA = EV / (TTM operating income + TTM D&A)
  const ttmDA = facts.ttmDA.value;
  const ebitda = facts.ttmOperatingIncome.value !== null && ttmDA !== null
    ? facts.ttmOperatingIncome.value + ttmDA
    : null;
  const evEbitda = facts.enterpriseValue.value !== null && ebitda !== null && ebitda !== 0
    ? facts.enterpriseValue.value / ebitda
    : null;
  traces.push({
    field: "derived.ev_to_ebitda",
    formula: "enterprise_value / (ttm_operating_income + ttm_depreciation_amortization)",
    result: evEbitda,
    inputs: [
      { field: "derived.enterprise_value", value: facts.enterpriseValue.value, validated: facts.enterpriseValue.value !== null },
      { field: "ttm.operating_income", value: facts.ttmOperatingIncome.value, validated: facts.ttmOperatingIncome.value !== null },
      { field: "ttm.depreciation_amortization", value: ttmDA, validated: ttmDA !== null },
    ],
    periodScope: "TTM",
    shareBasis: null,
  });

  // GAAP FCF = OCF - CapEx
  traces.push({
    field: "derived.gaap_free_cash_flow",
    formula: "ttm_ocf - ttm_capex",
    result: facts.ttmFCF.value,
    inputs: [
      { field: "ttm.operating_cash_flow", value: facts.ttmOCF.value, validated: facts.ttmOCF.value !== null },
      { field: "ttm.capex", value: facts.ttmCapex.value, validated: facts.ttmCapex.value !== null },
    ],
    periodScope: "TTM",
    shareBasis: null,
  });

  // Total cash and investments = cash + ST investments + LT investments
  // Derive LT investments from: total - cash - ST investments
  const ltInvestments = facts.totalCashAndInvestments.value !== null && facts.cash.value !== null
    ? facts.totalCashAndInvestments.value - facts.cash.value - (facts.shortTermInvestments.value ?? 0)
    : null;
  traces.push({
    field: "derived.total_cash_and_investments",
    formula: "cash + short_term_investments + long_term_investments",
    result: facts.totalCashAndInvestments.value,
    inputs: [
      { field: "balance_sheet.cash", value: facts.cash.value, validated: facts.cash.value !== null },
      { field: "balance_sheet.short_term_investments", value: facts.shortTermInvestments.value, validated: true },
      { field: "balance_sheet.long_term_investments", value: ltInvestments, validated: true },
    ],
    periodScope: "point_in_time",
    shareBasis: null,
  });

  // Total debt = current debt + long-term debt
  traces.push({
    field: "derived.total_debt",
    formula: "current_debt + long_term_debt",
    result: facts.totalDebt.value,
    inputs: [
      { field: "balance_sheet.current_debt", value: facts.currentDebt.value, validated: true },
      { field: "balance_sheet.long_term_debt", value: facts.longTermDebt.value, validated: true },
    ],
    periodScope: "point_in_time",
    shareBasis: null,
  });

  // Guarded metrics — only traced if they have values and model data
  if (model.roe !== null) {
    traces.push({
      field: "model.roe",
      formula: "ttm_net_income / total_equity",
      result: model.roe,
      inputs: [
        { field: "ttm.net_income", value: facts.ttmNetIncome.value, validated: facts.ttmNetIncome.value !== null },
        { field: "balance_sheet.total_equity", value: facts.totalEquity.value, validated: facts.totalEquity.value !== null },
      ],
      periodScope: "TTM / point_in_time",
      shareBasis: null,
    });
  }

  if (model.roic !== null) {
    traces.push({
      field: "model.roic",
      formula: "nopat / invested_capital",
      result: model.roic,
      inputs: [
        { field: "ttm.operating_income", value: facts.ttmOperatingIncome.value, validated: facts.ttmOperatingIncome.value !== null },
        { field: "balance_sheet.total_equity", value: facts.totalEquity.value, validated: facts.totalEquity.value !== null },
        { field: "balance_sheet.total_debt", value: facts.totalDebt.value, validated: facts.totalDebt.value !== null },
      ],
      periodScope: "TTM / point_in_time",
      shareBasis: null,
    });
  }

  return traces;
}

/**
 * Check if a field has a formula trace.
 */
export function hasTrace(traces: FormulaTrace[], field: string): boolean {
  return traces.some(t => t.field === field);
}

/**
 * Check if all inputs for a trace are validated.
 */
export function traceFullyValidated(trace: FormulaTrace): boolean {
  return trace.inputs.every(i => i.validated);
}
