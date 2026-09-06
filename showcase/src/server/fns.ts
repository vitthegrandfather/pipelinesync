import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getAdapter } from "@/lib/pipeline/adapters";
import { toCsv } from "@/lib/pipeline/csv";
import { processDelivery } from "@/lib/pipeline/delivery";
import { formatPublicId, newId } from "@/lib/pipeline/ids";
import { ingestLead } from "@/lib/pipeline/intake";
import { IntakeValidationError, normalizeLead } from "@/lib/pipeline/normalize";
import { routeLead, type RoutingRuleInput } from "@/lib/pipeline/routing";
import { resetWorkspace } from "@/lib/pipeline/seed";
import type { JsonMap, Provider } from "@/lib/pipeline/types";
import { num, toIso } from "@/lib/utils";
import { intakeSchema, leadFilterSchema, ruleSchema, simulateSchema } from "./schemas";
import { bool, parseJson, str, withWorkspace } from "./workspace";

function httpError(code: string, message: string, status = 400) {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    const totals = await sql.query<{
      total: number;
      qualified: number;
      duplicates: number;
    }>(
      `select
         count(*)::int as total,
         count(*) filter (where status = 'qualified')::int as qualified,
         count(*) filter (where duplicate_of_id is not null)::int as duplicates
       from leads where user_id = $1`,
      [context.userId],
    );
    const deliveries = await sql.query<{
      delivered: number;
      failed: number;
      queued: number;
      processing: number;
      retry_scheduled: number;
      dead_letter: number;
    }>(
      `select
         count(*) filter (where status = 'delivered')::int as delivered,
         count(*) filter (where status in ('failed','dead_letter'))::int as failed,
         count(*) filter (where status = 'queued')::int as queued,
         count(*) filter (where status = 'processing')::int as processing,
         count(*) filter (where status = 'retry_scheduled')::int as retry_scheduled,
         count(*) filter (where status = 'dead_letter')::int as dead_letter
       from deliveries
       where user_id = $1`,
      [context.userId],
    );
    const avgRow = await sql.query<{ avg_ms: number | null }>(
      `select avg(duration_ms)::float as avg_ms from delivery_attempts where user_id = $1`,
      [context.userId],
    );
    const volume = await sql.query<{ day: string; count: number }>(
      `select created_at::date::text as day, count(*)::int as count
       from leads
       where user_id = $1 and created_at >= (now() - interval '14 days')
       group by 1
       order by 1`,
      [context.userId],
    );
    const sources = await sql.query<{ source: string; count: number }>(
      `select coalesce(source, 'unknown') as source, count(*)::int as count
       from leads where user_id = $1
       group by 1 order by 2 desc`,
      [context.userId],
    );
    const recent = await sql.query<Record<string, unknown>>(
      `select l.public_id, l.first_name, l.last_name, l.company, l.service, l.source, l.status,
              l.created_at, i.name as destination, d.status as delivery_status,
              l.duplicate_of_id is not null as duplicate
       from leads l
       left join routing_decisions rd on rd.lead_id = l.id
       left join integrations i on i.id = rd.integration_id
       left join deliveries d on d.lead_id = l.id
       where l.user_id = $1
       order by l.created_at desc
       limit 8`,
      [context.userId],
    );
    const failures = await sql.query<Record<string, unknown>>(
      `select d.public_id, l.public_id as lead_public_id, i.name as provider, d.status,
              d.error_message, d.attempt_count, d.created_at, d.id
       from deliveries d
       join leads l on l.id = d.lead_id
       join integrations i on i.id = d.integration_id
       where d.user_id = $1 and d.status in ('failed','dead_letter','retry_scheduled')
       order by d.updated_at desc
       limit 6`,
      [context.userId],
    );
    const t = totals[0] ?? { total: 0, qualified: 0, duplicates: 0 };
    const d = deliveries[0] ?? {
      delivered: 0,
      failed: 0,
      queued: 0,
      processing: 0,
      retry_scheduled: 0,
      dead_letter: 0,
    };
    const delivered = num(d.delivered);
    const failed = num(d.failed);
    const denom = delivered + failed;
    return {
      metrics: {
        total_leads: num(t.total),
        qualified_leads: num(t.qualified),
        duplicate_rate: num(t.total) ? (num(t.duplicates) / num(t.total)) * 100 : 0,
        delivery_success_rate: denom ? (delivered / denom) * 100 : 0,
        failed_deliveries: failed,
        avg_delivery_ms: avgRow[0]?.avg_ms ? Math.round(Number(avgRow[0].avg_ms)) : 0,
      },
      volume: fillVolume(volume.map((v) => ({ day: String(v.day), count: num(v.count) }))),
      sources: sources.map((s) => ({ source: String(s.source), count: num(s.count) })),
      delivery_breakdown: {
        delivered,
        queued: num(d.queued),
        processing: num(d.processing),
        failed,
        retry_scheduled: num(d.retry_scheduled),
        dead_letter: num(d.dead_letter),
      },
      recent_leads: recent.map(mapListLead),
      recent_failures: failures.map((f) => ({
        id: String(f.id),
        public_id: String(f.public_id),
        lead_public_id: String(f.lead_public_id),
        provider: String(f.provider),
        status: String(f.status),
        error_message: f.error_message ? String(f.error_message) : null,
        attempt_count: num(f.attempt_count),
        created_at: toIso(f.created_at),
      })),
    };
  });

function fillVolume(rows: { day: string; count: number }[]) {
  const map = new Map(rows.map((r) => [r.day, r.count]));
  const out: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

function mapListLead(row: Record<string, unknown>) {
  return {
    public_id: String(row.public_id),
    first_name: row.first_name ? String(row.first_name) : "",
    last_name: row.last_name ? String(row.last_name) : "",
    company: row.company ? String(row.company) : "",
    service: row.service ? String(row.service) : "",
    source: row.source ? String(row.source) : "",
    status: String(row.status ?? "accepted"),
    created_at: toIso(row.created_at),
    destination: row.destination ? String(row.destination) : "—",
    delivery_status: row.delivery_status ? String(row.delivery_status) : "queued",
    duplicate: bool(row.duplicate),
  };
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => leadFilterSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    const where: string[] = ["l.user_id = $1"];
    const params: unknown[] = [context.userId];
    const add = (value: unknown, sqlFrag: string) => {
      params.push(value);
      where.push(sqlFrag.replaceAll("?", `$${params.length}`));
    };
    if (data.q) {
      const term = `%${data.q.toLowerCase()}%`;
      params.push(term, term, term, term);
      const a = params.length - 3;
      const b = params.length - 2;
      const c = params.length - 1;
      const d = params.length;
      where.push(
        `(lower(coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,'')) like $${a} or lower(coalesce(l.email,'')) like $${b} or lower(coalesce(l.company,'')) like $${c} or lower(l.public_id) like $${d})`,
      );
    }
    if (data.status) add(data.status, `l.status = ?`);
    if (data.duplicate === "yes") where.push(`l.duplicate_of_id is not null`);
    if (data.duplicate === "no") where.push(`l.duplicate_of_id is null`);
    if (data.source) add(data.source, `l.source = ?`);
    if (data.service) add(data.service, `l.service = ?`);
    if (data.country) add(data.country, `l.country = ?`);
    if (data.destination) add(data.destination, `i.name = ?`);
    if (data.delivery_status) add(data.delivery_status, `d.status = ?`);
    if (data.from) add(data.from, `l.created_at >= ?::timestamptz`);
    if (data.to) add(`${data.to}T23:59:59Z`, `l.created_at <= ?::timestamptz`);

    const allowedSort: Record<string, string> = {
      created_at: "l.created_at",
      public_id: "l.public_id",
      company: "l.company",
      service: "l.service",
      source: "l.source",
    };
    const sortCol = allowedSort[data.sort] ?? "l.created_at";
    const dir = data.dir === "asc" ? "asc" : "desc";
    const whereSql = where.join(" and ");
    const count = await sql.query<{ n: number }>(
      `select count(*)::int as n
       from leads l
       left join routing_decisions rd on rd.lead_id = l.id
       left join integrations i on i.id = rd.integration_id
       left join deliveries d on d.lead_id = l.id
       where ${whereSql}`,
      params,
    );
    const offset = (data.page - 1) * data.page_size;
    const rows = await sql.query<Record<string, unknown>>(
      `select l.public_id, l.first_name, l.last_name, l.company, l.service, l.source, l.status,
              l.created_at, i.name as destination, d.status as delivery_status,
              l.duplicate_of_id is not null as duplicate, l.country, l.email
       from leads l
       left join routing_decisions rd on rd.lead_id = l.id
       left join integrations i on i.id = rd.integration_id
       left join deliveries d on d.lead_id = l.id
       where ${whereSql}
       order by ${sortCol} ${dir}
       limit ${Number(data.page_size)} offset ${Number(offset)}`,
      params,
    );
    const facets = await sql.query<{
      sources: string;
      services: string;
      countries: string;
    }>(
      `select
         coalesce((select string_agg(distinct source, ',') from leads where user_id = $1 and source is not null), '') as sources,
         coalesce((select string_agg(distinct service, ',') from leads where user_id = $1 and service is not null), '') as services,
         coalesce((select string_agg(distinct country, ',') from leads where user_id = $1 and country is not null), '') as countries`,
      [context.userId],
    );
    return {
      items: rows.map(mapListLead),
      total: num(count[0]?.n),
      page: data.page,
      page_size: data.page_size,
      facets: {
        sources: splitCsv(facets[0]?.sources),
        services: splitCsv(facets[0]?.services),
        countries: splitCsv(facets[0]?.countries),
      },
    };
  });

function splitCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

export const getLead = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((leadId: string) => leadId)
  .handler(async ({ context, data: leadId }) => {
    const sql = await withWorkspace(context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select l.*, i.name as destination, i.provider, i.mode as integration_mode,
              d.id as delivery_internal_id, d.public_id as delivery_public_id, d.status as delivery_status,
              d.attempt_count, d.provider_contact_id, d.provider_deal_id, d.error_code, d.error_message,
              d.request_payload as delivery_request, d.response_payload as delivery_response, d.next_retry_at,
              rd.reason as routing_reason, rd.evaluation_log, rd.matched_rule_id, rd.created_at as routed_at,
              r.public_id as matched_rule_public_id, r.name as matched_rule_name,
              orig.public_id as duplicate_of_public_id
       from leads l
       left join routing_decisions rd on rd.lead_id = l.id
       left join routing_rules r on r.id = rd.matched_rule_id
       left join integrations i on i.id = rd.integration_id
       left join deliveries d on d.lead_id = l.id
       left join leads orig on orig.id = l.duplicate_of_id
       where l.user_id = $1 and l.public_id = $2`,
      [context.userId, leadId],
    );
    const row = rows[0];
    if (!row) throw httpError("not_found", "Lead not found.", 404);
    const attempts = row.delivery_internal_id
      ? await sql.query<Record<string, unknown>>(
          `select attempt_number, status, request_payload, response_payload, error_message, duration_ms, created_at
           from delivery_attempts where delivery_id = $1 order by attempt_number`,
          [row.delivery_internal_id],
        )
      : [];
    const audit = await sql.query<Record<string, unknown>>(
      `select actor_type, actor_id, event_type, event_data, created_at
       from audit_events
       where user_id = $1 and (entity_id = $2 or entity_id = $3)
       order by created_at asc`,
      [context.userId, row.id, row.delivery_internal_id ?? ""],
    );
    const duplicates = await sql.query<{ public_id: string }>(
      `select public_id from leads where user_id = $1 and duplicate_of_id = $2`,
      [context.userId, row.id],
    );
    return {
      id: String(row.id),
      public_id: String(row.public_id),
      first_name: str(row.first_name),
      last_name: str(row.last_name),
      email: str(row.email),
      normalized_email: str(row.normalized_email),
      phone: str(row.phone),
      normalized_phone: str(row.normalized_phone),
      company: str(row.company),
      job_title: str(row.job_title),
      country: str(row.country),
      service: str(row.service),
      budget: row.budget === null ? null : num(row.budget),
      currency: str(row.currency),
      message: str(row.message),
      source: str(row.source),
      external_id: str(row.external_id),
      utm_source: str(row.utm_source),
      utm_medium: str(row.utm_medium),
      utm_campaign: str(row.utm_campaign),
      metadata: parseJson<JsonMap | null>(row.metadata, null),
      original_payload: parseJson<JsonMap>(row.original_payload, {}),
      status: String(row.status),
      duplicate: Boolean(row.duplicate_of_id),
      duplicate_of_id: row.duplicate_of_public_id ? String(row.duplicate_of_public_id) : null,
      duplicate_reason: str(row.duplicate_reason),
      duplicate_detected_at: row.duplicate_detected_at ? toIso(row.duplicate_detected_at) : null,
      related_duplicates: duplicates.map((d) => d.public_id),
      created_at: toIso(row.created_at),
      destination: row.destination ? String(row.destination) : null,
      provider: str(row.provider),
      integration_mode: str(row.integration_mode) ?? "sandbox",
      routing: {
        reason: row.routing_reason ? String(row.routing_reason) : null,
        matched_rule: row.matched_rule_public_id
          ? { public_id: String(row.matched_rule_public_id), name: String(row.matched_rule_name) }
          : null,
        evaluation_log: parseJson<
          {
            rule_id: string;
            public_id: string;
            name: string;
            priority: number;
            field: string;
            operator: string;
            comparison_value: string | null;
            matched: boolean;
            skipped: boolean;
            detail: string;
          }[]
        >(row.evaluation_log, []),
        routed_at: row.routed_at ? toIso(row.routed_at) : null,
      },
      delivery: row.delivery_public_id
        ? {
            id: String(row.delivery_internal_id),
            public_id: String(row.delivery_public_id),
            status: String(row.delivery_status),
            attempt_count: num(row.attempt_count),
            provider_contact_id: str(row.provider_contact_id),
            provider_deal_id: str(row.provider_deal_id),
            error_code: str(row.error_code),
            error_message: str(row.error_message),
            request_payload: parseJson<JsonMap>(row.delivery_request, {}),
            response_payload: parseJson<JsonMap>(row.delivery_response, {}),
            next_retry_at: row.next_retry_at ? toIso(row.next_retry_at) : null,
            attempts: attempts.map((a) => ({
              attempt_number: num(a.attempt_number),
              status: String(a.status),
              request_payload: parseJson<JsonMap>(a.request_payload, {}),
              response_payload: parseJson<JsonMap>(a.response_payload, {}),
              error_message: str(a.error_message),
              duration_ms: a.duration_ms ? num(a.duration_ms) : null,
              created_at: toIso(a.created_at),
            })),
          }
        : null,
      audit: audit.map((a) => ({
        actor_type: String(a.actor_type),
        actor_id: a.actor_id ? String(a.actor_id) : null,
        event_type: String(a.event_type),
        event_data: parseJson<JsonMap>(a.event_data, {}),
        created_at: toIso(a.created_at),
      })),
    };
  });

export const submitIntake = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => intakeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    try {
      const { simulate_failure, idempotency_key, ...payload } = data;
      return await ingestLead(sql, context.userId, payload, {
        idempotencyKey: idempotency_key ?? `ui_${newId("idem")}`,
        simulateFailure: Boolean(simulate_failure),
        processNow: true,
        actor: { type: "user", id: context.userId },
      });
    } catch (err) {
      if (err instanceof IntakeValidationError) {
        const status = (err as IntakeValidationError & { httpStatus?: number }).httpStatus ?? 422;
        throw httpError(err.code, err.message, status);
      }
      throw err;
    }
  });

export const exportLeadsCsv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => leadFilterSchema.parse(input ?? {}))
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select l.public_id, l.first_name, l.last_name, l.email, l.phone, l.company, l.job_title,
              l.country, l.service, l.budget, l.currency, l.source, l.status,
              i.name as destination, d.status as delivery_status, l.utm_source, l.utm_campaign,
              l.created_at, l.duplicate_of_id is not null as duplicate
       from leads l
       left join routing_decisions rd on rd.lead_id = l.id
       left join integrations i on i.id = rd.integration_id
       left join deliveries d on d.lead_id = l.id
       where l.user_id = $1
       order by l.created_at desc`,
      [context.userId],
    );
    const csv = toCsv(
      [
        "lead_id",
        "first_name",
        "last_name",
        "email",
        "phone",
        "company",
        "job_title",
        "country",
        "service",
        "budget",
        "currency",
        "source",
        "status",
        "destination",
        "delivery_status",
        "utm_source",
        "utm_campaign",
        "duplicate",
        "created_at",
      ],
      rows.map((r) => [
        r.public_id,
        r.first_name,
        r.last_name,
        r.email,
        r.phone,
        r.company,
        r.job_title,
        r.country,
        r.service,
        r.budget,
        r.currency,
        r.source,
        r.status,
        r.destination,
        r.delivery_status,
        r.utm_source,
        r.utm_campaign,
        bool(r.duplicate) ? "yes" : "no",
        toIso(r.created_at),
      ]),
    );
    return { csv, filename: "pipelinesync-leads.csv" };
  });

export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        provider: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    const params: unknown[] = [context.userId];
    const where = ["d.user_id = $1"];
    if (data.status) {
      params.push(data.status);
      where.push(`d.status = $${params.length}`);
    }
    if (data.provider) {
      params.push(data.provider);
      where.push(`i.provider = $${params.length}`);
    }
    const rows = await sql.query<Record<string, unknown>>(
      `select d.id, d.public_id, l.public_id as lead_public_id, i.name as provider, i.provider as provider_key,
              d.status, d.attempt_count, d.error_message, d.next_retry_at, d.created_at, d.updated_at,
              (select max(duration_ms) from delivery_attempts a where a.delivery_id = d.id) as duration_ms
       from deliveries d
       join leads l on l.id = d.lead_id
       join integrations i on i.id = d.integration_id
       where ${where.join(" and ")}
       order by d.created_at desc
       limit 100`,
      params,
    );
    return rows.map((r) => ({
      id: String(r.id),
      public_id: String(r.public_id),
      lead_public_id: String(r.lead_public_id),
      provider: String(r.provider),
      provider_key: String(r.provider_key),
      status: String(r.status),
      attempt_count: num(r.attempt_count),
      error_message: r.error_message ? String(r.error_message) : null,
      duration_ms: r.duration_ms ? num(r.duration_ms) : null,
      next_retry_at: r.next_retry_at ? toIso(r.next_retry_at) : null,
      created_at: toIso(r.created_at),
    }));
  });

export const retryDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await withWorkspace(context.userId);
    const row = await sql.query<{ id: string; status: string }>(
      `select id, status from deliveries where user_id = $1 and (id = $2 or public_id = $2)`,
      [context.userId, id],
    );
    if (!row[0]) throw httpError("not_found", "Delivery not found.", 404);
    return processDelivery(sql, context.userId, row[0].id, { simulateNow: true, forceSuccess: true });
  });

export const simulateFailureOnDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await withWorkspace(context.userId);
    const row = await sql.query<{ id: string }>(
      `select id from deliveries where user_id = $1 and (id = $2 or public_id = $2)`,
      [context.userId, id],
    );
    if (!row[0]) throw httpError("not_found", "Delivery not found.", 404);
    await sql.query(`update deliveries set force_fail = true, status = 'queued', updated_at = now() where id = $1`, [
      row[0].id,
    ]);
    return processDelivery(sql, context.userId, row[0].id, { simulateNow: true, forceSuccess: false });
  });

export const listRules = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select r.*, i.name as destination, i.provider
       from routing_rules r
       join integrations i on i.id = r.integration_id
       where r.user_id = $1
       order by r.priority asc`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      public_id: String(r.public_id),
      name: String(r.name),
      priority: num(r.priority),
      enabled: bool(r.enabled),
      field: String(r.field),
      operator: String(r.operator),
      comparison_value: r.comparison_value ? String(r.comparison_value) : "",
      integration_id: String(r.integration_id),
      destination: String(r.destination),
      provider: String(r.provider),
      stop_processing: bool(r.stop_processing),
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    }));
  });

const saveRuleSchema = ruleSchema.extend({ id: z.string().optional() });

export const saveRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => saveRuleSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    if (data.id) {
      await sql.query(
        `update routing_rules
         set name=$3, priority=$4, enabled=$5, field=$6, operator=$7, comparison_value=$8,
             integration_id=$9, stop_processing=$10, updated_at=now()
         where id=$1 and user_id=$2`,
        [
          data.id,
          context.userId,
          data.name,
          data.priority,
          data.enabled,
          data.field,
          data.operator,
          data.comparison_value ?? null,
          data.integration_id,
          data.stop_processing,
        ],
      );
      return { id: data.id };
    }
    const count = await sql.query<{ n: number }>(
      `select coalesce(max(value),0)::int as n from id_counters where user_id=$1 and kind='rule'`,
      [context.userId],
    );
    await sql.query(
      `insert into id_counters (user_id, kind, value) values ($1,'rule',1)
       on conflict (user_id, kind) do update set value = id_counters.value + 1`,
      [context.userId],
    );
    const n = num(count[0]?.n) + 1;
    const id = newId("rule");
    await sql.query(
      `insert into routing_rules (
         id, user_id, public_id, name, priority, enabled, field, operator, comparison_value,
         integration_id, stop_processing
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        context.userId,
        formatPublicId("rule", 10 + n),
        data.name,
        data.priority,
        data.enabled,
        data.field,
        data.operator,
        data.comparison_value ?? null,
        data.integration_id,
        data.stop_processing,
      ],
    );
    return { id };
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await withWorkspace(context.userId);
    await sql.query(`delete from routing_rules where id = $1 and user_id = $2`, [id, context.userId]);
    return { ok: true };
  });

export const toggleRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    await sql.query(`update routing_rules set enabled=$3, updated_at=now() where id=$1 and user_id=$2`, [
      data.id,
      context.userId,
      data.enabled,
    ]);
    return { ok: true };
  });

export const simulateRouting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => simulateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    let payload = { ...data };
    if (data.lead_id) {
      const row = await sql.query<Record<string, unknown>>(
        `select * from leads where user_id=$1 and public_id=$2`,
        [context.userId, data.lead_id],
      );
      if (!row[0]) throw httpError("not_found", "Lead not found.", 404);
      payload = {
        first_name: row[0].first_name as string,
        last_name: row[0].last_name as string,
        email: row[0].email as string,
        phone: row[0].phone as string,
        company: row[0].company as string,
        country: row[0].country as string,
        service: row[0].service as string,
        budget: row[0].budget as number,
        currency: row[0].currency as string,
        source: row[0].source as string,
      };
    }
    const normalized = normalizeLead(payload);
    const rules = await sql.query<Record<string, unknown>>(
      `select r.*, i.name as integration_name, i.provider
       from routing_rules r join integrations i on i.id = r.integration_id
       where r.user_id=$1 order by r.priority`,
      [context.userId],
    );
    const fallback = await sql.query<{ id: string; name: string; provider: string }>(
      `select id, name, provider from integrations where user_id=$1 and provider='webhook' limit 1`,
      [context.userId],
    );
    const ruleInputs: RoutingRuleInput[] = rules.map((r) => ({
      id: String(r.id),
      public_id: String(r.public_id),
      name: String(r.name),
      priority: num(r.priority),
      enabled: bool(r.enabled),
      field: String(r.field),
      operator: String(r.operator),
      comparison_value: r.comparison_value ? String(r.comparison_value) : null,
      integration_id: String(r.integration_id),
      integration_name: String(r.integration_name),
      provider: String(r.provider),
      stop_processing: bool(r.stop_processing),
    }));
    return {
      normalized,
      decision: routeLead(
        normalized,
        ruleInputs,
        fallback[0] ?? { id: "", name: "Default CRM Sandbox", provider: "webhook" },
      ),
    };
  });

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    const rows = await sql.query<Record<string, unknown>>(
      `select * from integrations where user_id=$1 order by name`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      public_id: String(r.public_id),
      provider: String(r.provider) as Provider,
      name: String(r.name),
      mode: String(r.mode),
      enabled: bool(r.enabled),
      health_status: String(r.health_status),
      last_checked_at: r.last_checked_at ? toIso(r.last_checked_at) : null,
      last_success_at: r.last_success_at ? toIso(r.last_success_at) : null,
      success_count: num(r.success_count),
      failure_count: num(r.failure_count),
    }));
  });

export const toggleIntegration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await withWorkspace(context.userId);
    await sql.query(`update integrations set enabled=$3, updated_at=now() where id=$1 and user_id=$2`, [
      data.id,
      context.userId,
      data.enabled,
    ]);
    return { ok: true };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await withWorkspace(context.userId);
    const row = await sql.query<{ provider: Provider }>(
      `select provider from integrations where id=$1 and user_id=$2`,
      [id, context.userId],
    );
    if (!row[0]) throw httpError("not_found", "Integration not found.", 404);
    const health = await getAdapter(row[0].provider).healthCheck();
    await sql.query(
      `update integrations set health_status=$3, last_checked_at=$4, updated_at=now() where id=$1 and user_id=$2`,
      [id, context.userId, health.status, health.checked_at],
    );
    return health;
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    const keys = await sql.query<Record<string, unknown>>(
      `select id, name, key_prefix, key_last4, active, last_used_at, created_at from api_keys where user_id=$1`,
      [context.userId],
    );
    return {
      api_keys: keys.map((k) => ({
        id: String(k.id),
        name: String(k.name),
        masked: `${k.key_prefix}${"•".repeat(8)}${k.key_last4}`,
        active: bool(k.active),
        last_used_at: k.last_used_at ? toIso(k.last_used_at) : null,
        created_at: toIso(k.created_at),
      })),
    };
  });

export const resetDemo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    await resetWorkspace(sql, context.userId);
    return { ok: true };
  });

export const searchLeads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => q)
  .handler(async ({ context, data: q }) => {
    const sql = await withWorkspace(context.userId);
    if (!q.trim()) return [];
    const rows = await sql.query<{
      public_id: string;
      first_name: string;
      last_name: string;
      company: string;
    }>(
      `select public_id, first_name, last_name, company from leads
       where user_id=$1 and (
         lower(public_id) like $2 or lower(coalesce(first_name,'')||' '||coalesce(last_name,'')) like $2
         or lower(coalesce(company,'')) like $2 or lower(coalesce(email,'')) like $2
       )
       order by created_at desc limit 8`,
      [context.userId, `%${q.toLowerCase()}%`],
    );
    return rows;
  });

export const listLeadOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await withWorkspace(context.userId);
    return sql.query<{ public_id: string; first_name: string; last_name: string; company: string }>(
      `select public_id, first_name, last_name, company from leads where user_id=$1 order by created_at desc limit 50`,
      [context.userId],
    );
  });
