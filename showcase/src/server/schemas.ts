import { z } from "zod";

export const leadFilterSchema = z.object({
  q: z.string().optional().default(""),
  status: z.string().optional().default(""),
  duplicate: z.enum(["all", "yes", "no"]).optional().default("all"),
  source: z.string().optional().default(""),
  service: z.string().optional().default(""),
  country: z.string().optional().default(""),
  destination: z.string().optional().default(""),
  delivery_status: z.string().optional().default(""),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  sort: z.string().optional().default("created_at"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(12),
});

export const intakeSchema = z.object({
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  job_title: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  service: z.string().optional().nullable(),
  budget: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().nullable(),
  simulate_failure: z.boolean().optional().default(false),
  idempotency_key: z.string().optional().nullable(),
});

export const ruleSchema = z.object({
  name: z.string().min(2).max(120),
  priority: z.number().int().min(1).max(9999),
  enabled: z.boolean(),
  field: z.string().min(1),
  operator: z.string().min(1),
  comparison_value: z.string().nullable().optional(),
  integration_id: z.string().min(1),
  stop_processing: z.boolean(),
});

export const simulateSchema = z.object({
  lead_id: z.string().optional(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  service: z.string().optional().nullable(),
  budget: z.union([z.number(), z.string()]).optional().nullable(),
  currency: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});
