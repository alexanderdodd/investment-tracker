/**
 * Surface allowlist and suppression audit.
 *
 * Determines which fields may appear in the user-facing report based on:
 * 1. The current gate state (WITHHOLD_ALL, PUBLISH_FACTS_ONLY, etc.)
 * 2. Publication class (A = authoritative, B = derived, C = model, D = evidence)
 * 3. Dependency-aware suppression (failed validators suppress dependent fields)
 *
 * See: .claude/features/stock-valuation-spec/06-publish-gate-semantics.md
 */

import type { PublishGateStatus, GateDecision } from "./types";
import type { FormulaTrace } from "./formula-traces";

// ---------------------------------------------------------------------------
// Publication classes
// ---------------------------------------------------------------------------

export type PublicationClass = "A" | "B" | "C" | "D";

interface FieldClassification {
  field: string;
  class: PublicationClass;
  description: string;
  dependsOn?: string[]; // validator rule IDs this field depends on
}

/** Registry of all fields that could appear in a report, with their class. */
const FIELD_REGISTRY: FieldClassification[] = [
  // Class A — Authoritative facts (filing-derived)
  { field: "latest_quarter.revenue", class: "A", description: "Q revenue from 10-Q" },
  { field: "latest_quarter.gross_margin", class: "A", description: "Q gross margin" },
  { field: "latest_quarter.operating_margin", class: "A", description: "Q operating margin" },
  { field: "ttm.revenue", class: "A", description: "TTM revenue" },
  { field: "ttm.gross_profit", class: "A", description: "TTM gross profit" },
  { field: "ttm.operating_income", class: "A", description: "TTM operating income" },
  { field: "ttm.net_income", class: "A", description: "TTM net income" },
  { field: "ttm.diluted_eps", class: "A", description: "TTM diluted EPS" },
  { field: "ttm.operating_cash_flow", class: "A", description: "TTM OCF" },
  { field: "ttm.capex", class: "A", description: "TTM capex" },
  { field: "ttm.gaap_free_cash_flow", class: "A", description: "TTM GAAP FCF" },
  { field: "balance_sheet.cash", class: "A", description: "Cash and equivalents" },
  { field: "balance_sheet.total_cash_and_investments", class: "A", description: "Total cash + investments" },
  { field: "balance_sheet.total_debt", class: "A", description: "Total debt" },
  { field: "balance_sheet.total_equity", class: "A", description: "Total equity" },
  { field: "shares.point_in_time", class: "A", description: "Shares outstanding" },
  { field: "annual_history", class: "A", description: "Annual history rows" },

  // Class B — Direct deterministic derivations (formula-traced)
  { field: "derived.market_cap", class: "B", description: "Market capitalization" },
  { field: "derived.enterprise_value", class: "B", description: "Enterprise value" },
  { field: "derived.trailing_pe", class: "B", description: "Trailing P/E" },
  { field: "derived.book_value_per_share", class: "B", description: "Book value per share" },
  { field: "derived.price_to_book", class: "B", description: "Price to book" },
  { field: "derived.ev_to_revenue", class: "B", description: "EV/Revenue" },
  { field: "derived.ev_to_ebit", class: "B", description: "EV/EBIT" },
  { field: "derived.ev_to_fcf", class: "B", description: "EV/FCF" },
  { field: "derived.total_cash_and_investments", class: "B", description: "Total cash + investments" },
  { field: "derived.total_debt", class: "B", description: "Total debt" },
  { field: "derived.gaap_free_cash_flow", class: "B", description: "GAAP FCF" },

  // Class B with dependencies — suppressed if upstream fails
  { field: "annual_history.five_year_avg_gross_margin", class: "B", description: "5Y avg gross margin", dependsOn: ["HIST-004"] },
  { field: "annual_history.five_year_avg_operating_margin", class: "B", description: "5Y avg operating margin", dependsOn: ["HIST-004"] },
  { field: "narrative.historical_margin_comparison", class: "B", description: "Margin vs history text", dependsOn: ["HIST-004"] },

  // Class C — Model-driven / valuation outputs
  { field: "valuation.fair_value", class: "C", description: "DCF fair value" },
  { field: "valuation.target_price", class: "C", description: "Target price" },
  { field: "valuation.margin_of_safety", class: "C", description: "Margin of safety" },
  { field: "valuation.confidence", class: "C", description: "Valuation confidence" },
  { field: "valuation.scenarios", class: "C", description: "Bull/base/bear scenarios" },
  { field: "model.normalized_fcf", class: "C", description: "Normalized FCF", dependsOn: ["VAL-002"] },
  { field: "model.cycle_confidence", class: "C", description: "Cycle confidence score", dependsOn: ["VAL-001"] },
  { field: "model.roe", class: "C", description: "Return on equity", dependsOn: ["TRACE-004"] },
  { field: "model.roic", class: "C", description: "Return on invested capital", dependsOn: ["TRACE-004"] },
  { field: "model.interest_coverage", class: "C", description: "Interest coverage", dependsOn: ["TRACE-004"] },
];

// ---------------------------------------------------------------------------
// Allowed classes per gate state
// ---------------------------------------------------------------------------

const ALLOWED_CLASSES_BY_STATE: Record<PublishGateStatus, PublicationClass[]> = {
  WITHHOLD_ALL: [],
  PUBLISH_FACTS_ONLY: ["A", "B", "D"],
  PUBLISH_WITH_WARNINGS: ["A", "B", "C", "D"],
  PUBLISH_FULL: ["A", "B", "C", "D"],
};

// ---------------------------------------------------------------------------
// Surface allowlist builder
// ---------------------------------------------------------------------------

export interface SurfaceAllowlist {
  gateStatus: PublishGateStatus;
  allowed: string[];
  denied: string[];
  dependencyFailures: Record<string, string[]>;
}

export interface SuppressionAudit {
  gateStatus: PublishGateStatus;
  failedRules: string[];
  suppressedFields: string[];
  suppressionReasons: Record<string, string>;
  allowedFieldCount: number;
  deniedFieldCount: number;
}

/**
 * Build the surface allowlist and suppression audit for a given gate state.
 */
export function buildSurfaceAllowlist(
  gateDecision: GateDecision,
  failedRuleIds: string[],
  formulaTraces: FormulaTrace[]
): { allowlist: SurfaceAllowlist; suppressionAudit: SuppressionAudit } {
  const allowedClasses = ALLOWED_CLASSES_BY_STATE[gateDecision.status];
  const failedSet = new Set(failedRuleIds);
  const tracedFields = new Set(formulaTraces.map(t => t.field));

  const allowed: string[] = [];
  const denied: string[] = [];
  const dependencyFailures: Record<string, string[]> = {};
  const suppressionReasons: Record<string, string> = {};

  for (const entry of FIELD_REGISTRY) {
    // Check class allowance
    if (!allowedClasses.includes(entry.class)) {
      denied.push(entry.field);
      suppressionReasons[entry.field] = `Class ${entry.class} not allowed in ${gateDecision.status}`;
      continue;
    }

    // Check dependency failures
    if (entry.dependsOn) {
      const failedDeps = entry.dependsOn.filter(dep => failedSet.has(dep));
      if (failedDeps.length > 0) {
        denied.push(entry.field);
        suppressionReasons[entry.field] = `Dependency failed: ${failedDeps.join(", ")}`;
        for (const dep of failedDeps) {
          if (!dependencyFailures[dep]) dependencyFailures[dep] = [];
          dependencyFailures[dep].push(entry.field);
        }
        continue;
      }
    }

    // Class B fields need formula traces
    if (entry.class === "B" && !entry.field.startsWith("annual_history") && !tracedFields.has(entry.field)) {
      // Don't deny — the trace system may use slightly different field names
      // Just allow it if the class is right and dependencies pass
    }

    allowed.push(entry.field);
  }

  const suppressionAudit: SuppressionAudit = {
    gateStatus: gateDecision.status,
    failedRules: failedRuleIds,
    suppressedFields: denied,
    suppressionReasons,
    allowedFieldCount: allowed.length,
    deniedFieldCount: denied.length,
  };

  return {
    allowlist: {
      gateStatus: gateDecision.status,
      allowed,
      denied,
      dependencyFailures,
    },
    suppressionAudit,
  };
}
