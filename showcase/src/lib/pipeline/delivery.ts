import { getAdapter, mapPayload } from "./adapters.ts";
import { newId } from "./ids.ts";
import type { CRMResult, DeliveryStatus, JsonMap, NormalizedLead, Provider } from "./types.ts";
import type { Sql } from "@/lib/db";

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];
const MAX_ATTEMPTS = 3;

export function nextRetryAt(attemptCount: number, now = Date.now()): Date | null {
  const delay = RETRY_DELAYS_MS[attemptCount - 1];
  if (!delay) return null;
  return new Date(now + delay);
}

export async function processDelivery(
  sql: Sql,
  userId: string,
  deliveryId: string,
  options: { simulateNow?: boolean; forceSuccess?: boolean } = {},
): Promise<{ status: DeliveryStatus; error?: string }> {
  const claimed = await sql.query<{
    id: string;
    lead_id: string;
    integration_id: string;
    status: DeliveryStatus;
    attempt_count: number;
    force_fail: boolean;
  }>(
    `update deliveries
     set status = 'processing', updated_at = now()
     where id = $1 and user_id = $2
       and status in ('queued', 'failed', 'retry_scheduled', 'dead_letter')
     returning id, lead_id, integration_id, status, attempt_count, force_fail`,
    [deliveryId, userId],
  );
  if (claimed.length === 0) {
    const current = await sql.query<{ status: DeliveryStatus }>(
      `select status from deliveries where id = $1 and user_id = $2`,
      [deliveryId, userId],
    );
    return { status: current[0]?.status ?? "queued", error: "Delivery is already being processed." };
  }

  const delivery = claimed[0]!;
  const integration = await sql.query<{ provider: Provider; name: string }>(
    `select provider, name from integrations where id = $1 and user_id = $2`,
    [delivery.integration_id, userId],
  );
  const lead = await sql.query<{
    public_id: string;
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
    budget: string | number | null;
    currency: string | null;
    message: string | null;
    source: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    external_id: string | null;
    metadata: unknown;
  }>(`select * from leads where id = $1 and user_id = $2`, [delivery.lead_id, userId]);

  const row = lead[0];
  const provider = integration[0]?.provider ?? "webhook";
  const attemptNumber = Number(delivery.attempt_count) + 1;
  const fail = delivery.force_fail && !options.forceSuccess;
  const adapter = getAdapter(provider, fail);
  const dto: NormalizedLead & { public_id: string; source: string | null } = {
    first_name: row?.first_name ?? null,
    last_name: row?.last_name ?? null,
    email: row?.email ?? null,
    normalized_email: row?.normalized_email ?? null,
    phone: row?.phone ?? null,
    normalized_phone: row?.normalized_phone ?? null,
    company: row?.company ?? null,
    job_title: row?.job_title ?? null,
    country: row?.country ?? null,
    service: row?.service ?? null,
    budget: row?.budget === null || row?.budget === undefined ? null : Number(row.budget),
    currency: row?.currency ?? null,
    message: row?.message ?? null,
    source: row?.source ?? null,
    utm_source: row?.utm_source ?? null,
    utm_medium: row?.utm_medium ?? null,
    utm_campaign: row?.utm_campaign ?? null,
    external_id: row?.external_id ?? null,
    metadata: (row?.metadata as JsonMap) ?? null,
    public_id: row?.public_id ?? "LD-000000",
  };

  const requestPayload = mapPayload(provider, dto);
  const started = Date.now();
  let contact: CRMResult;
  let deal: CRMResult | null = null;
  try {
    contact = await adapter.createOrUpdateContact(dto);
    if (contact.ok) deal = await adapter.createDeal(dto, contact);
  } catch (err) {
    contact = {
      ok: false,
      provider,
      payload: {},
      error_code: "adapter_exception",
      error_message: err instanceof Error ? err.message : "Unknown adapter error",
      duration_ms: Date.now() - started,
    };
  }
  const duration = (contact.duration_ms ?? 0) + (deal?.duration_ms ?? 0);
  const ok = Boolean(contact.ok && deal?.ok);

  await sql.query(
    `insert into delivery_attempts (
       id, user_id, delivery_id, attempt_number, status, request_payload, response_payload,
       error_message, duration_ms, created_at
     ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,now())`,
    [
      newId("att"),
      userId,
      deliveryId,
      attemptNumber,
      ok ? "delivered" : "failed",
      JSON.stringify(requestPayload),
      JSON.stringify({ contact: contact.payload, deal: deal?.payload ?? null }),
      ok ? null : contact.error_message,
      duration,
    ],
  );

  if (ok) {
    await sql.query(
      `update deliveries
       set status = 'delivered',
           attempt_count = $3,
           provider_contact_id = $4,
           provider_deal_id = $5,
           request_payload = $6::jsonb,
           response_payload = $7::jsonb,
           error_code = null,
           error_message = null,
           next_retry_at = null,
           force_fail = false,
           updated_at = now()
       where id = $1 and user_id = $2`,
      [
        deliveryId,
        userId,
        attemptNumber,
        contact.contact_id ?? null,
        deal?.deal_id ?? null,
        JSON.stringify(requestPayload),
        JSON.stringify({ contact: contact.payload, deal: deal?.payload ?? null }),
      ],
    );
    await sql.query(
      `update integrations
       set success_count = success_count + 1, last_success_at = now(), health_status = 'healthy', updated_at = now()
       where id = $1 and user_id = $2`,
      [delivery.integration_id, userId],
    );
    await sql.query(
      `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data)
       values ($1,$2,'system','worker','delivery',$3,'delivery.delivered',$4::jsonb)`,
      [
        newId("aud"),
        userId,
        deliveryId,
        JSON.stringify({ attempt: attemptNumber, contact_id: contact.contact_id, deal_id: deal?.deal_id }),
      ],
    );
    return { status: "delivered" };
  }

  const retryAt = nextRetryAt(attemptNumber);
  const terminal = attemptNumber >= MAX_ATTEMPTS;
  const status: DeliveryStatus = terminal ? "dead_letter" : options.simulateNow ? "failed" : "retry_scheduled";

  await sql.query(
    `update deliveries
     set status = $3,
         attempt_count = $4,
         request_payload = $5::jsonb,
         response_payload = $6::jsonb,
         error_code = $7,
         error_message = $8,
         next_retry_at = $9,
         updated_at = now()
     where id = $1 and user_id = $2`,
    [
      deliveryId,
      userId,
      status,
      attemptNumber,
      JSON.stringify(requestPayload),
      JSON.stringify(contact.payload),
      contact.error_code ?? "sandbox_error",
      contact.error_message ?? "Delivery failed",
      terminal ? null : retryAt?.toISOString() ?? null,
    ],
  );
  await sql.query(
    `update integrations
     set failure_count = failure_count + 1, health_status = 'degraded', updated_at = now()
     where id = $1 and user_id = $2`,
    [delivery.integration_id, userId],
  );
  await sql.query(
    `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data)
     values ($1,$2,'system','worker','delivery',$3,$4,$5::jsonb)`,
    [
      newId("aud"),
      userId,
      deliveryId,
      terminal ? "delivery.dead_letter" : "delivery.failed",
      JSON.stringify({ attempt: attemptNumber, error: contact.error_message, next_status: status }),
    ],
  );
  return { status, error: contact.error_message };
}

export { MAX_ATTEMPTS, RETRY_DELAYS_MS };
