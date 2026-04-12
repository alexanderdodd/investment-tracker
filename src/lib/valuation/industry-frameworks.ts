/**
 * Industry framework selection.
 *
 * Determines the correct valuation template based on sector/industry,
 * controlling which methods are used, which peers are allowed, and
 * how normalization works.
 */

import type { IndustryFramework } from "./types";

export function selectFramework(sector: string, industry: string): IndustryFramework {
  const lower = `${sector} ${industry}`.toLowerCase();

  if (lower.includes("semiconductor") || lower.includes("memory") || lower.includes("electronic component")) {
    return {
      type: "semiconductor",
      primaryMethods: ["normalized_fcff_dcf", "ev_ebit_normalized", "reverse_dcf"],
      secondaryMethods: ["pb_sanity"],
      disallowedPeers: ["NVDA", "AMD", "AMZN", "GOOGL", "MSFT"],
      normalizationRules: "Use mid-cycle margins. If current gross margin exceeds 5Y avg by >15pp, flag as cycle peak and normalize.",
      keyMetrics: ["bit_shipment_growth", "asp_trends", "cost_per_bit", "hbm_mix", "cycle_position", "capacity_utilization"],
      cycleRelevant: true,
      allowedPeerMultiples: ["ev_ebitda", "ev_revenue", "pb"],
    };
  }

  if (lower.includes("bank") || lower.includes("savings institution") || lower.includes("financial") || lower.includes("insurance")) {
    return {
      type: "financial",
      primaryMethods: ["residual_income", "justified_ptbv", "pe_roe"],
      secondaryMethods: ["pe_relative"],
      disallowedPeers: [],
      normalizationRules: "Normalize credit costs and provisions through cycle. Use tangible book value.",
      keyMetrics: ["roe", "rotce", "nim", "cet1", "efficiency_ratio", "provisions"],
      cycleRelevant: true,
      allowedPeerMultiples: ["pe", "pb"],
    };
  }

  if (lower.includes("beverage") || lower.includes("food") || lower.includes("household") || lower.includes("tobacco") || lower.includes("consumer staple")) {
    return {
      type: "consumer_staples",
      primaryMethods: ["fcff_dcf", "ddm", "pe_relative"],
      secondaryMethods: ["ev_ebitda_relative"],
      disallowedPeers: [],
      normalizationRules: "Normalize for FX, M&A, and restructuring. Focus on organic revenue growth.",
      keyMetrics: ["organic_growth", "pricing_vs_volume", "fcf_yield", "dividend_growth", "payout_ratio"],
      cycleRelevant: false,
      allowedPeerMultiples: ["pe", "pb", "ev_ebitda"],
    };
  }

  if (lower.includes("software") || lower.includes("saas") || lower.includes("data processing") || lower.includes("internet")) {
    return {
      type: "growth_tech",
      primaryMethods: ["ev_revenue", "ev_gross_profit", "rule_of_40", "reverse_dcf"],
      secondaryMethods: ["fcff_dcf"],
      disallowedPeers: [],
      normalizationRules: "SBC is a real cost. If unprofitable including SBC, state explicitly.",
      keyMetrics: ["revenue_growth", "gross_margin", "rule_of_40", "sbc_pct", "fcf_margin"],
      cycleRelevant: false,
      allowedPeerMultiples: ["ev_revenue", "pb"],
    };
  }

  if (lower.includes("reit") || lower.includes("real estate investment")) {
    return {
      type: "reit",
      primaryMethods: ["affo_yield", "nav", "cap_rate"],
      secondaryMethods: ["pe_relative"],
      disallowedPeers: [],
      normalizationRules: "GAAP EPS is not primary. Use AFFO and NAV.",
      keyMetrics: ["affo", "nav", "occupancy", "cap_rate", "debt_to_ebitda"],
      cycleRelevant: false,
      allowedPeerMultiples: ["pb", "ev_ebitda"],
    };
  }

  if (lower.includes("oil") || lower.includes("gas") || lower.includes("petroleum") || lower.includes("mining") || lower.includes("metal")) {
    return {
      type: "commodity_cyclical",
      primaryMethods: ["normalized_fcff_dcf", "ev_ebitda_normalized", "nav"],
      secondaryMethods: ["reverse_dcf"],
      disallowedPeers: [],
      normalizationRules: "Normalize for commodity price cycles. Use mid-cycle commodity price assumptions.",
      keyMetrics: ["reserve_life", "production_growth", "finding_costs", "breakeven_price"],
      cycleRelevant: true,
      allowedPeerMultiples: ["ev_ebitda", "pb"],
    };
  }

  if (lower.includes("utility") || lower.includes("electric") || lower.includes("gas distribution")) {
    return {
      type: "utility",
      primaryMethods: ["fcff_dcf", "ddm", "pe_relative"],
      secondaryMethods: ["ev_ebitda_relative"],
      disallowedPeers: [],
      normalizationRules: "Focus on rate base growth, allowed ROE, and regulatory environment.",
      keyMetrics: ["rate_base_growth", "allowed_roe", "payout_ratio", "capex_plan", "regulatory_environment"],
      cycleRelevant: false,
      allowedPeerMultiples: ["pe", "ev_ebitda"],
    };
  }

  // Default
  return {
    type: "general",
    primaryMethods: ["fcff_dcf", "pe_relative", "ev_ebitda_relative", "reverse_dcf"],
    secondaryMethods: [],
    disallowedPeers: [],
    normalizationRules: "Check whether current margins and growth are above or below 5-year averages.",
    keyMetrics: ["revenue_growth", "operating_margin", "roic", "fcf_yield", "debt_ebitda"],
    cycleRelevant: false,
    allowedPeerMultiples: ["pe", "pb", "ev_ebitda", "ev_revenue"],
  };
}
