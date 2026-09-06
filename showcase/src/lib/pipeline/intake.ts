import { getAdapter } from "./adapters.ts";
import { processDelivery } from "./delivery.ts";
import { formatPublicId, newId, sha256Hex } from "./ids.ts";
import { IntakeValidationError, normalizeLead, payloadHash } from "./normalize.ts";
import { routeLead, type RoutingRuleInput } from "./routing.ts";
import type {
  DeliveryStatus,
  IntakeResult,
  LeadIntakeInput,
  LeadStatus,
  PipelineStep,
  Provider,
} from "./types.ts";
import type { Sql } from "@/lib/db";

async function nextPublic(
  sql: Sql,
  userId: string,
  kind: "lead" | "delivery" | "rule",
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await sql.query<{ value: number }>(
    `insert into id_counters (user_id, kind, value)
     values ($1, $2, 1)
     on conflict (user_id, kind)
     do update set value = id_counters.value + 1
     returning value`,
    [userId, kind],
  );
  const n = Number(rows[0]?.value ?? 1);
  const start = kind === "lead" ? 1000 : kind === "delivery" ? 4800 : 10;
  return formatPublicId(kind, start + n, year);
}

function step(id: string, label: string, status: PipelineStep["status"], detail?: string): PipelineStep {
  return { id, label, status, timestamp: new Date().toISOString(), detail };
}

export async function ingestLead(
  sql: Sql,
  userId: string,
  input: LeadIntakeInput,
  options: {
    idempotencyKey?: string | null;
    simulateFailure?: boolean;
    processNow?: boolean;
    actor?: { type: string; id: string };
  } = {},
): Promise<IntakeResult> {
  const steps: PipelineStep[] = [step("received", "Payload received", "ok", "Intake endpoint accepted the request.")];

  const hash = payloadHash(input);
  if (options.idempotencyKey) {
    const existing = await sql.query<{ payload_hash: string; lead_id: string; response: unknown }>(
      `select payload_hash, lead_id, response from idempotency_records where user_id = $1 and key = $2`,
      [userId, options.idempotencyKey],
    );
    if (existing[0]) {
      if (existing[0].payload_hash !== hash) {
        throw Object.assign(new IntakeValidationError(
          "duplicate_idempotency_key",
          "This idempotency key was used with a different payload.",
        ), { httpStatus: 409 });
      }
      const replay = existing[0].response as IntakeResult;
      return { ...replay, replayed: true };
    }
  }

  const normalized = normalizeLead(input);
  steps.push(step("validated", "Input validated", "ok", "Required contact fields and types passed validation."));
  steps.push(
    step(
      "normalized",
      "Contact data normalized",
      "ok",
      `Email ${normalized.normalized_email ?? "—"} · Phone ${normalized.normalized_phone ?? "—"} · Country ${normalized.country ?? "—"}.`,
    ),
  );

  let duplicateOf: string | null = null;
  let duplicateReason: IntakeResult["duplicate_reason"] = null;
  if (normalized.normalized_email) {
    const hit = await sql.query<{ id: string }>(
      `select id from leads where user_id = $1 and normalized_email = $2 order by created_at asc limit 1`,
      [userId, normalized.normalized_email],
    );
    if (hit[0]) {
      duplicateOf = hit[0].id;
      duplicateReason = "normalized_email";
    }
  }
  if (!duplicateOf && normalized.normalized_phone) {
    const hit = await sql.query<{ id: string }>(
      `select id from leads where user_id = $1 and normalized_phone = $2 order by created_at asc limit 1`,
      [userId, normalized.normalized_phone],
    );
    if (hit[0]) {
      duplicateOf = hit[0].id;
      duplicateReason = "normalized_phone";
    }
  }
  if (!duplicateOf && normalized.external_id && normalized.source) {
    const hit = await sql.query<{ id: string }>(
      `select id from leads where user_id = $1 and source = $2 and external_id = $3 order by created_at asc limit 1`,
      [userId, normalized.source, normalized.external_id],
    );
    if (hit[0]) {
      duplicateOf = hit[0].id;
      duplicateReason = "external_id";
    }
  }

  steps.push(
    step(
      "deduped",
      "Duplicate rules evaluated",
      duplicateOf ? "warn" : "ok",
      duplicateOf
        ? `Matched existing lead by ${duplicateReason?.replace("normalized_", "")}.`
        : "No email, phone, or source+external ID match.",
    ),
  );

  const rules = await sql.query<{
    id: string;
    public_id: string;
    name: string;
    priority: number;
    enabled: boolean;
    field: string;
    operator: string;
    comparison_value: string | null;
    integration_id: string;
    stop_processing: boolean;
    integration_name: string;
    provider: string;
  }>(
    `select r.id, r.public_id, r.name, r.priority, r.enabled, r.field, r.operator,
            r.comparison_value, r.integration_id, r.stop_processing,
            i.name as integration_name, i.provider
     from routing_rules r
     join integrations i on i.id = r.integration_id
     where r.user_id = $1
     order by r.priority asc`,
    [userId],
  );
  const fallbackRow = await sql.query<{ id: string; name: string; provider: string }>(
    `select id, name, provider from integrations where user_id = $1 and provider = 'webhook' limit 1`,
    [userId],
  );
  const fallback = fallbackRow[0] ?? { id: rules[rules.length - 1]?.integration_id ?? "", name: "Default CRM Sandbox", provider: "webhook" };
  const ruleInputs: RoutingRuleInput[] = rules.map((r) => ({
    id: r.id,
    public_id: r.public_id,
    name: r.name,
    priority: Number(r.priority),
    enabled: Boolean(r.enabled),
    field: r.field,
    operator: r.operator,
    comparison_value: r.comparison_value,
    integration_id: r.integration_id,
    integration_name: r.integration_name,
    provider: r.provider,
    stop_processing: Boolean(r.stop_processing),
  }));
  const decision = routeLead(normalized, ruleInputs, fallback);
  steps.push(
    step(
      "routed",
      "Routing rule matched",
      "ok",
      `${decision.integration_name}. ${decision.reason}`,
    ),
  );

  const status: LeadStatus = duplicateOf ? "duplicate" : (normalized.budget ?? 0) >= 5000 ? "qualified" : "accepted";
  const leadId = newId("lead");
  const publicId = await nextPublic(sql, userId, "lead");
  const idempotencyHash = options.idempotencyKey ? await sha256Hex(options.idempotencyKey) : null;

  await sql.query(
    `insert into leads (
       id, user_id, public_id, first_name, last_name, email, normalized_email, phone, normalized_phone,
       company, job_title, country, service, budget, currency, message, source, external_id,
       utm_source, utm_medium, utm_campaign, metadata, original_payload, status,
       duplicate_of_id, duplicate_reason, duplicate_detected_at, idempotency_key, idempotency_payload_hash
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,
       $24,$25,$26,$27,$28,$29
     )`,
    [
      leadId,
      userId,
      publicId,
      normalized.first_name,
      normalized.last_name,
      normalized.email,
      normalized.normalized_email,
      normalized.phone,
      normalized.normalized_phone,
      normalized.company,
      normalized.job_title,
      normalized.country,
      normalized.service,
      normalized.budget,
      normalized.currency,
      normalized.message,
      normalized.source,
      normalized.external_id,
      normalized.utm_source,
      normalized.utm_medium,
      normalized.utm_campaign,
      JSON.stringify(normalized.metadata),
      JSON.stringify(input),
      status,
      duplicateOf,
      duplicateReason,
      duplicateOf ? new Date().toISOString() : null,
      options.idempotencyKey ?? null,
      idempotencyHash,
    ],
  );

  await sql.query(
    `insert into routing_decisions (id, user_id, lead_id, matched_rule_id, integration_id, reason, evaluation_log)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      newId("rd"),
      userId,
      leadId,
      decision.matched_rule_id,
      decision.integration_id,
      decision.reason,
      JSON.stringify(decision.evaluation_log),
    ],
  );

  const deliveryId = newId("dlv");
  const deliveryPublic = await nextPublic(sql, userId, "delivery");
  await sql.query(
    `insert into deliveries (
       id, user_id, public_id, lead_id, integration_id, status, attempt_count, force_fail
     ) values ($1,$2,$3,$4,$5,'queued',0,$6)`,
    [deliveryId, userId, deliveryPublic, leadId, decision.integration_id, Boolean(options.simulateFailure)],
  );

  await sql.query(
    `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data)
     values ($1,$2,$3,$4,'lead',$5,'lead.accepted',$6::jsonb)`,
    [
      newId("aud"),
      userId,
      options.actor?.type ?? "api",
      options.actor?.id ?? "intake",
      leadId,
      JSON.stringify({ public_id: publicId, duplicate: Boolean(duplicateOf) }),
    ],
  );
  await sql.query(
    `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data)
     values ($1,$2,'system','router','lead',$3,'lead.routed',$4::jsonb)`,
    [newId("aud"), userId, leadId, JSON.stringify({ destination: decision.integration_name, reason: decision.reason })],
  );

  steps.push(step("queued", "Delivery queued", "ok", `Job ${deliveryPublic} created for ${decision.integration_name}.`));

  let deliveryStatus: DeliveryStatus = "queued";
  if (options.processNow !== false) {
    const processed = await processDelivery(sql, userId, deliveryId, {
      simulateNow: true,
      forceSuccess: false,
    });
    deliveryStatus = processed.status;
    if (processed.status === "delivered") {
      const adapter = getAdapter(decision.provider as Provider);
      const health = await adapter.healthCheck();
      steps.push(
        step(
          "delivered",
          "Sandbox CRM accepted the lead",
          "ok",
          `${decision.integration_name} (${health.mode}) stored the contact.`,
        ),
      );
    } else {
      steps.push(
        step(
          "delivered",
          "Sandbox CRM rejected the lead",
          "error",
          processed.error ?? "Provider returned a sandbox failure.",
        ),
      );
    }
  }

  const result: IntakeResult = {
    lead_id: publicId,
    lead_internal_id: leadId,
    status,
    duplicate: Boolean(duplicateOf),
    duplicate_of_id: duplicateOf,
    duplicate_reason: duplicateReason,
    assigned_destination: decision.integration_name,
    delivery_status: deliveryStatus,
    delivery_id: deliveryPublic,
    steps,
  };

  if (options.idempotencyKey) {
    await sql.query(
      `insert into idempotency_records (id, user_id, key, payload_hash, lead_id, response)
       values ($1,$2,$3,$4,$5,$6::jsonb)
       on conflict (user_id, key) do nothing`,
      [newId("idem"), userId, options.idempotencyKey, hash, leadId, JSON.stringify(result)],
    );
  }

  return result;
}
