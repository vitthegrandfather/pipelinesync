import type {
  NormalizedLead,
  RoutingField,
  RoutingOperator,
  RoutingResult,
  RuleEvaluation,
} from "./types.ts";

export interface RoutingRuleInput {
  id: string;
  public_id: string;
  name: string;
  priority: number;
  enabled: boolean;
  field: string;
  operator: string;
  comparison_value: string | null;
  integration_id: string;
  integration_name: string;
  provider: string;
  stop_processing: boolean;
}

function fieldValue(lead: NormalizedLead, field: string): string | number | null {
  const key = field as RoutingField;
  const value = lead[key as keyof NormalizedLead];
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  return String(value);
}

export function evaluateOperator(
  actual: string | number | null,
  operator: string,
  expected: string | null,
): boolean {
  const op = operator as RoutingOperator;
  const empty = actual === null || actual === "";
  switch (op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "equals":
      if (empty) return false;
      return String(actual).toLowerCase() === String(expected ?? "").toLowerCase();
    case "does_not_equal":
      if (empty) return true;
      return String(actual).toLowerCase() !== String(expected ?? "").toLowerCase();
    case "contains":
      if (empty) return false;
      return String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "greater_than": {
      if (actual === null || actual === "") return false;
      const n = typeof actual === "number" ? actual : Number(actual);
      const m = Number(expected);
      return Number.isFinite(n) && Number.isFinite(m) && n > m;
    }
    case "less_than": {
      if (actual === null || actual === "") return false;
      const n = typeof actual === "number" ? actual : Number(actual);
      const m = Number(expected);
      return Number.isFinite(n) && Number.isFinite(m) && n < m;
    }
    default:
      return false;
  }
}

export function routeLead(
  lead: NormalizedLead,
  rules: RoutingRuleInput[],
  fallback: { id: string; name: string; provider: string },
): RoutingResult {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  const evaluation_log: RuleEvaluation[] = [];
  let matched: RoutingRuleInput | null = null;

  for (const rule of ordered) {
    if (!rule.enabled) {
      evaluation_log.push({
        rule_id: rule.id,
        public_id: rule.public_id,
        name: rule.name,
        priority: rule.priority,
        field: rule.field,
        operator: rule.operator,
        comparison_value: rule.comparison_value,
        matched: false,
        skipped: true,
        skip_reason: "disabled",
        detail: "Rule is disabled and was not evaluated.",
      });
      continue;
    }
    const actual = fieldValue(lead, rule.field);
    const didMatch = evaluateOperator(actual, rule.operator, rule.comparison_value);
    evaluation_log.push({
      rule_id: rule.id,
      public_id: rule.public_id,
      name: rule.name,
      priority: rule.priority,
      field: rule.field,
      operator: rule.operator,
      comparison_value: rule.comparison_value,
      matched: didMatch,
      skipped: false,
      detail: didMatch
        ? `${rule.field} ${rule.operator} ${rule.comparison_value ?? ""} matched ${String(actual)}.`
        : `${rule.field}=${String(actual)} did not match.`,
    });
    if (didMatch) {
      matched = rule;
      if (rule.stop_processing) break;
    }
  }

  if (!matched) {
    return {
      matched_rule_id: null,
      matched_rule_public_id: null,
      matched_rule_name: null,
      integration_id: fallback.id,
      integration_name: fallback.name,
      provider: fallback.provider,
      reason: "No enabled routing rule matched. Assigned to the default sandbox destination.",
      evaluation_log,
    };
  }

  return {
    matched_rule_id: matched.id,
    matched_rule_public_id: matched.public_id,
    matched_rule_name: matched.name,
    integration_id: matched.integration_id,
    integration_name: matched.integration_name,
    provider: matched.provider,
    reason: `Matched rule ${matched.public_id} (${matched.name}) at priority ${matched.priority}.`,
    evaluation_log,
  };
}
