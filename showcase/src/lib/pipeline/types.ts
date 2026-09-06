export const SUPPORTED_COUNTRIES = [
  "US",
  "GB",
  "DE",
  "FR",
  "CA",
  "AU",
  "NL",
  "IE",
  "ES",
  "IT",
  "SE",
  "NO",
  "DK",
  "PL",
  "UA",
  "IN",
  "SG",
  "AE",
  "JP",
  "PT",
  "CH",
  "AT",
  "BE",
  "FI",
  "CZ",
  "RO",
  "ZA",
  "NZ",
  "MX",
] as const;

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export const LEAD_STATUSES = ["accepted", "qualified", "duplicate"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "queued",
  "processing",
  "delivered",
  "failed",
  "retry_scheduled",
  "dead_letter",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ROUTING_OPERATORS = [
  "equals",
  "does_not_equal",
  "contains",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
] as const;
export type RoutingOperator = (typeof ROUTING_OPERATORS)[number];

export const ROUTING_FIELDS = [
  "budget",
  "country",
  "service",
  "source",
  "currency",
  "company",
  "email",
  "utm_source",
  "utm_campaign",
] as const;
export type RoutingField = (typeof ROUTING_FIELDS)[number];

export const PROVIDERS = ["hubspot", "pipedrive", "zoho", "webhook"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonMap = { [key: string]: JsonValue };

export type DuplicateReason = "normalized_email" | "normalized_phone" | "external_id";


export interface LeadIntakeInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  country?: string | null;
  service?: string | null;
  budget?: number | string | null;
  currency?: string | null;
  message?: string | null;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  external_id?: string | null;
  metadata?: JsonMap | null;
}

export interface NormalizedLead {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  normalized_email: string | null;
  phone: string | null;
  normalized_phone: string | null;
  company: string | null;
  job_title: string | null;
  country: string | null;
  service: string | null;
  budget: number | null;
  currency: string | null;
  message: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  external_id: string | null;
  metadata: JsonMap | null;
}

export interface RuleEvaluation {
  rule_id: string;
  public_id: string;
  name: string;
  priority: number;
  field: string;
  operator: string;
  comparison_value: string | null;
  matched: boolean;
  skipped: boolean;
  skip_reason?: string;
  detail: string;
}

export interface RoutingResult {
  matched_rule_id: string | null;
  matched_rule_public_id: string | null;
  matched_rule_name: string | null;
  integration_id: string;
  integration_name: string;
  provider: string;
  reason: string;
  evaluation_log: RuleEvaluation[];
}

export interface PipelineStep {
  id: string;
  label: string;
  status: "ok" | "warn" | "error" | "pending";
  timestamp: string;
  detail?: string;
}

export interface CRMResult {
  ok: boolean;
  provider: Provider;
  contact_id?: string;
  deal_id?: string;
  payload: JsonMap;
  error_code?: string;
  error_message?: string;
  duration_ms: number;
}

export interface IntegrationHealth {
  status: "healthy" | "degraded" | "down";
  provider: Provider;
  mode: "sandbox";
  latency_ms: number;
  message: string;
  checked_at: string;
}

export interface IntakeResult {
  lead_id: string;
  lead_internal_id: string;
  status: LeadStatus;
  duplicate: boolean;
  duplicate_of_id: string | null;
  duplicate_reason: DuplicateReason | null;
  assigned_destination: string;
  delivery_status: DeliveryStatus;
  delivery_id: string;
  steps: PipelineStep[];
  replayed?: boolean;
}

export const FIELD_LIMITS = {
  first_name: 80,
  last_name: 80,
  email: 254,
  phone: 32,
  company: 160,
  job_title: 120,
  service: 120,
  message: 4000,
  source: 80,
  utm: 120,
  external_id: 120,
  country: 2,
  currency: 3,
} as const;
