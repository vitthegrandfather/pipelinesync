import { getAdapter, mapPayload } from "./adapters.ts";
import { formatPublicId, newId, sha256Hex } from "./ids.ts";
import { normalizeLead } from "./normalize.ts";
import { routeLead, type RoutingRuleInput } from "./routing.ts";
import type { DeliveryStatus, LeadIntakeInput, LeadStatus, Provider } from "./types.ts";
import type { Sql } from "@/lib/db";

interface SeedLead {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  country: string;
  service: string;
  budget: number;
  currency: string;
  message: string;
  source: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  external_id: string;
  days_ago: number;
  hours: number;
  delivery: DeliveryStatus;
  force_fail?: boolean;
  duplicate_of?: number;
  duplicate_reason?: "normalized_email" | "normalized_phone" | "external_id";
}

const SEED_LEADS: SeedLead[] = [
  {
    first_name: "Maya",
    last_name: "Chen",
    email: "maya.chen@example.com",
    phone: "+44 20 7946 0958",
    company: "Northstar Studio",
    job_title: "Operations Manager",
    country: "GB",
    service: "CRM integration",
    budget: 8500,
    currency: "USD",
    message:
      "We need to connect three website forms to our CRM and preserve campaign attribution.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "crm_automation_q3",
    external_id: "FORM-10482",
    days_ago: 1,
    hours: 10,
    delivery: "delivered",
  },
  {
    first_name: "James",
    last_name: "Whitfield",
    email: "james.whitfield@example.com",
    phone: "+1 415 555 0142",
    company: "Helio Analytics",
    job_title: "Director of Revenue Operations",
    country: "US",
    service: "CRM integration",
    budget: 14000,
    currency: "USD",
    message: "Looking for a durable intake layer between six product sites and HubSpot.",
    source: "webinar",
    utm_source: "linkedin",
    utm_medium: "social",
    utm_campaign: "revops_webinar",
    external_id: "WEB-2201",
    days_ago: 2,
    hours: 15,
    delivery: "delivered",
  },
  {
    first_name: "Priya",
    last_name: "Nair",
    email: "priya.nair@example.com",
    phone: "+91 80 4567 2210",
    company: "Brightline Ops",
    job_title: "Head of Automation",
    country: "IN",
    service: "Business automation",
    budget: 3900,
    currency: "USD",
    message: "Need routing rules for inbound demo requests from APAC landing pages.",
    source: "website",
    utm_source: "google",
    utm_medium: "organic",
    utm_campaign: "automation_guide",
    external_id: "FORM-11820",
    days_ago: 3,
    hours: 8,
    delivery: "delivered",
  },
  {
    first_name: "Oliver",
    last_name: "Grant",
    email: "oliver.grant@example.com",
    phone: "+44 161 496 0288",
    company: "Thames Digital",
    job_title: "Marketing Operations Lead",
    country: "GB",
    service: "Website forms",
    budget: 2400,
    currency: "USD",
    message: "UK website forms currently dump into a shared inbox. We want Pipedrive.",
    source: "partner",
    external_id: "PARTNER-44",
    days_ago: 4,
    hours: 11,
    delivery: "delivered",
  },
  {
    first_name: "Sofia",
    last_name: "Alvarez",
    email: "sofia.alvarez@example.com",
    phone: "+34 91 123 4580",
    company: "Campo Norte",
    job_title: "COO",
    country: "ES",
    service: "CRM integration",
    budget: 7200,
    currency: "USD",
    message: "Connecting event registrations and outbound sequences into one pipeline.",
    source: "website",
    utm_source: "bing",
    utm_medium: "cpc",
    utm_campaign: "iberia_crm",
    external_id: "FORM-3301",
    days_ago: 5,
    hours: 9,
    delivery: "delivered",
  },
  {
    first_name: "Henrik",
    last_name: "Larsen",
    email: "henrik.larsen@example.com",
    phone: "+47 21 55 12 90",
    company: "Fjord Systems",
    job_title: "IT Manager",
    country: "NO",
    service: "Business automation",
    budget: 4100,
    currency: "USD",
    message: "We want webhook automation for partner-sourced leads.",
    source: "inbound",
    external_id: "INB-902",
    days_ago: 6,
    hours: 14,
    delivery: "delivered",
  },
  {
    first_name: "Amina",
    last_name: "Diallo",
    email: "amina.diallo@example.com",
    phone: "+27 21 555 0199",
    company: "Harbor Collective",
    job_title: "Founder",
    country: "ZA",
    service: "Lead capture",
    budget: 1800,
    currency: "USD",
    message: "Small studio looking to stop losing form submissions.",
    source: "website",
    external_id: "FORM-4410",
    days_ago: 2,
    hours: 18,
    delivery: "failed",
    force_fail: true,
  },
  {
    first_name: "Kenji",
    last_name: "Mori",
    email: "kenji.mori@example.com",
    phone: "+81 3 1234 7788",
    company: "Shibuya Labs",
    job_title: "Product Operations",
    country: "JP",
    service: "Data migration",
    budget: 9600,
    currency: "USD",
    message: "Need a migration path from spreadsheets into a CRM with attribution intact.",
    source: "linkedin",
    utm_source: "linkedin",
    utm_medium: "paid",
    utm_campaign: "apac_migration",
    external_id: "LI-1882",
    days_ago: 7,
    hours: 7,
    delivery: "delivered",
  },
  {
    first_name: "Claire",
    last_name: "Dubois",
    email: "claire.dubois@example.com",
    phone: "+33 1 42 68 5301",
    company: "Atelier Nord",
    job_title: "Revenue Manager",
    country: "FR",
    service: "Business automation",
    budget: 2600,
    currency: "USD",
    message: "Automate assignment of inbound demo requests by language and region.",
    source: "referral",
    external_id: "REF-77",
    days_ago: 8,
    hours: 12,
    delivery: "delivered",
  },
  {
    first_name: "Ryan",
    last_name: "O'Connell",
    email: "ryan.oconnell@example.com",
    phone: "+353 1 555 0144",
    company: "Liffey Software",
    job_title: "Growth Lead",
    country: "IE",
    service: "Website forms",
    budget: 1500,
    currency: "USD",
    message: "Two marketing sites, one CRM. Forms currently go nowhere useful.",
    source: "website",
    external_id: "FORM-5521",
    days_ago: 0,
    hours: 2,
    delivery: "queued",
  },
  {
    first_name: "Nina",
    last_name: "Berg",
    email: "nina.berg@example.com",
    phone: "+31 20 555 0188",
    company: "Canalstraat Studio",
    job_title: "Operations Director",
    country: "NL",
    service: "CRM integration",
    budget: 5500,
    currency: "USD",
    message: "Need HubSpot-ready payloads from Typeform and a custom site.",
    source: "webinar",
    utm_source: "email",
    utm_medium: "nurture",
    utm_campaign: "benelux_ops",
    external_id: "WEB-441",
    days_ago: 9,
    hours: 16,
    delivery: "delivered",
  },
  {
    first_name: "Tomasz",
    last_name: "Kowalski",
    email: "tomasz.kowalski@example.com",
    phone: "+48 22 555 0190",
    company: "Baltic Grid",
    job_title: "Support Lead",
    country: "PL",
    service: "Customer support tooling",
    budget: 900,
    currency: "USD",
    message: "Exploring a light-weight lead intake for a regional support team.",
    source: "inbound",
    external_id: "INB-331",
    days_ago: 3,
    hours: 20,
    delivery: "failed",
    force_fail: true,
  },
  {
    first_name: "Emily",
    last_name: "Walsh",
    email: "emily.walsh@example.com",
    phone: "+1 617 555 0194",
    company: "Redwood Retail",
    job_title: "CRM Administrator",
    country: "US",
    service: "Website forms",
    budget: 4800,
    currency: "USD",
    message: "Replace Zapier with something we can audit and retry.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "ops_tooling",
    external_id: "FORM-9001",
    days_ago: 10,
    hours: 13,
    delivery: "delivered",
  },
  {
    first_name: "Maya",
    last_name: "Chen",
    email: "maya.chen@example.com",
    phone: "+44 20 7946 1100",
    company: "Northstar Studio",
    job_title: "Operations Manager",
    country: "GB",
    service: "CRM integration",
    budget: 8500,
    currency: "USD",
    message: "Second submission from the pricing page.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "crm_automation_q3",
    external_id: "FORM-10499",
    days_ago: 1,
    hours: 6,
    delivery: "delivered",
    duplicate_of: 0,
    duplicate_reason: "normalized_email",
  },
  {
    first_name: "Ollie",
    last_name: "Grant",
    email: "o.grant@thamesdigital.example",
    phone: "+44 161 496 0288",
    company: "Thames Digital",
    job_title: "Marketing Operations Lead",
    country: "GB",
    service: "Website forms",
    budget: 2400,
    currency: "USD",
    message: "Follow-up from the partner portal using a different email.",
    source: "partner",
    external_id: "PARTNER-45",
    days_ago: 3,
    hours: 17,
    delivery: "delivered",
    duplicate_of: 3,
    duplicate_reason: "normalized_phone",
  },
  {
    first_name: "Lucas",
    last_name: "Ferreira",
    email: "lucas.ferreira@example.com",
    phone: "+351 21 555 0177",
    company: "Lisbon Stack",
    job_title: "COO",
    country: "PT",
    service: "Business automation",
    budget: 3300,
    currency: "USD",
    message: "Automate partner and inbound leads into one owner queue.",
    source: "partner",
    external_id: "PARTNER-91",
    days_ago: 11,
    hours: 10,
    delivery: "delivered",
  },
  {
    first_name: "Sara",
    last_name: "Lindqvist",
    email: "sara.lindqvist@example.com",
    phone: "+46 8 555 0122",
    company: "Norrsken Apps",
    job_title: "Head of Growth",
    country: "SE",
    service: "CRM integration",
    budget: 11200,
    currency: "USD",
    message: "Enterprise CRM project across four brands. Attribution is non-negotiable.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "nordics_enterprise",
    external_id: "FORM-7004",
    days_ago: 12,
    hours: 9,
    delivery: "delivered",
  },
  {
    first_name: "Daniel",
    last_name: "Cho",
    email: "daniel.cho@example.com",
    phone: "+65 6555 0193",
    company: "Meridian Cloud",
    job_title: "Solutions Architect",
    country: "SG",
    service: "Data migration",
    budget: 6700,
    currency: "USD",
    message: "Moving historical leads from a legacy CSV dump without losing source.",
    source: "linkedin",
    utm_source: "linkedin",
    utm_medium: "sponsored",
    utm_campaign: "sea_migration",
    external_id: "LI-440",
    days_ago: 13,
    hours: 11,
    delivery: "delivered",
  },
  {
    first_name: "Hannah",
    last_name: "Brooks",
    email: "hannah.brooks@example.com",
    phone: "+1 416 555 0160",
    company: "Maple & Pine",
    job_title: "Operations Coordinator",
    country: "CA",
    service: "Lead capture",
    budget: 2200,
    currency: "USD",
    message: "Need a retry-capable webhook for the careers and contact forms.",
    source: "website",
    external_id: "FORM-2219",
    days_ago: 0,
    hours: 4,
    delivery: "queued",
  },
  {
    first_name: "Matteo",
    last_name: "Ricci",
    email: "matteo.ricci@example.com",
    phone: "+39 02 555 0166",
    company: "Quattro Forme",
    job_title: "Digital Operations",
    country: "IT",
    service: "Business automation",
    budget: 4400,
    currency: "USD",
    message: "Route Italian and English forms to different owners automatically.",
    source: "webinar",
    utm_source: "email",
    utm_medium: "invite",
    utm_campaign: "milan_ops",
    external_id: "WEB-118",
    days_ago: 6,
    hours: 19,
    delivery: "delivered",
  },
  {
    first_name: "Grace",
    last_name: "Adeyemi",
    email: "grace.adeyemi@example.com",
    phone: "+27 11 555 0133",
    company: "Cape Route",
    job_title: "Managing Partner",
    country: "ZA",
    service: "CRM integration",
    budget: 8000,
    currency: "USD",
    message: "Three regional sites, one CRM, strict duplicate handling.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "africa_crm",
    external_id: "FORM-8120",
    days_ago: 4,
    hours: 8,
    delivery: "delivered",
  },
  {
    first_name: "Ben",
    last_name: "Hart",
    email: "ben.hart@example.com",
    phone: "+61 2 5550 1788",
    company: "Dockside Analytics",
    job_title: "RevOps Analyst",
    country: "AU",
    service: "Lead capture",
    budget: 1100,
    currency: "USD",
    message: "Simple intake with source tracking for a consulting site.",
    source: "referral",
    external_id: "REF-12",
    days_ago: 8,
    hours: 5,
    delivery: "delivered",
  },
];

function daysAgo(days: number, hours: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hours, (days * 7) % 60, 0, 0);
  return d;
}

async function nextPublic(
  sql: Sql,
  userId: string,
  kind: "lead" | "delivery" | "rule",
  year = 2026,
): Promise<string> {
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

export async function ensureWorkspace(sql: Sql, userId: string): Promise<void> {
  const existing = await sql.query<{ user_id: string }>(
    `select user_id from workspaces where user_id = $1`,
    [userId],
  );
  if (existing.length > 0) {
    const leadCount = await sql.query<{ n: number }>(
      `select count(*)::int as n from leads where user_id = $1`,
      [userId],
    );
    if (Number(leadCount[0]?.n ?? 0) > 0) return;
  }
  await seedWorkspace(sql, userId);
}

export async function resetWorkspace(sql: Sql, userId: string): Promise<void> {
  await sql.query(`delete from delivery_attempts where user_id = $1`, [userId]);
  await sql.query(`delete from deliveries where user_id = $1`, [userId]);
  await sql.query(`delete from routing_decisions where user_id = $1`, [userId]);
  await sql.query(`delete from audit_events where user_id = $1`, [userId]);
  await sql.query(`delete from idempotency_records where user_id = $1`, [userId]);
  await sql.query(`delete from leads where user_id = $1`, [userId]);
  await sql.query(`delete from routing_rules where user_id = $1`, [userId]);
  await sql.query(`delete from integrations where user_id = $1`, [userId]);
  await sql.query(`delete from api_keys where user_id = $1`, [userId]);
  await sql.query(`delete from id_counters where user_id = $1`, [userId]);
  await sql.query(`delete from workspaces where user_id = $1`, [userId]);
  await seedWorkspace(sql, userId);
}

async function seedWorkspace(sql: Sql, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await sql.query(
    `insert into workspaces (user_id, seeded_at, created_at) values ($1, $2, $2)
     on conflict (user_id) do update set seeded_at = excluded.seeded_at`,
    [userId, now],
  );

  const demoKey = `ps_demo_${userId.replace(/[^a-z0-9]/gi, "").slice(0, 8)}4f82`;
  const keyHash = await sha256Hex(demoKey);
  await sql.query(
    `insert into api_keys (id, user_id, name, key_hash, key_prefix, key_last4, active, created_at)
     values ($1,$2,$3,$4,$5,$6,true,$7)`,
    [newId("key"), userId, "Website forms", keyHash, "ps_demo_", "4f82", now],
  );

  const integrations = [
    { provider: "hubspot" as Provider, name: "HubSpot Sandbox", success: 8, fail: 0 },
    { provider: "pipedrive" as Provider, name: "Pipedrive Sandbox", success: 3, fail: 0 },
    { provider: "zoho" as Provider, name: "Zoho CRM Sandbox", success: 5, fail: 0 },
    { provider: "webhook" as Provider, name: "Default CRM Sandbox", success: 2, fail: 2 },
  ];
  const integrationIds: Record<string, string> = {};
  for (const item of integrations) {
    const id = newId("int");
    integrationIds[item.provider] = id;
    await sql.query(
      `insert into integrations (
         id, user_id, public_id, provider, name, mode, enabled, config, health_status,
         last_checked_at, last_success_at, success_count, failure_count, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'sandbox',true,'{}'::jsonb,'healthy',$6,$6,$7,$8,$6,$6)`,
      [id, userId, `INT-${item.provider}`, item.provider, item.name, now, item.success, item.fail],
    );
  }

  const ruleDefs = [
    {
      name: "Enterprise CRM projects",
      priority: 10,
      field: "budget",
      operator: "greater_than",
      value: "4999.99",
      provider: "hubspot",
    },
    {
      name: "United Kingdom leads",
      priority: 20,
      field: "country",
      operator: "equals",
      value: "GB",
      provider: "pipedrive",
    },
    {
      name: "Business automation requests",
      priority: 30,
      field: "service",
      operator: "contains",
      value: "automation",
      provider: "zoho",
    },
    {
      name: "Default catch-all",
      priority: 1000,
      field: "email",
      operator: "is_not_empty",
      value: null,
      provider: "webhook",
    },
  ];
  const ruleRows: RoutingRuleInput[] = [];
  for (const def of ruleDefs) {
    const id = newId("rule");
    const publicId = await nextPublic(sql, userId, "rule");
    const integrationId = integrationIds[def.provider]!;
    await sql.query(
      `insert into routing_rules (
         id, user_id, public_id, name, priority, enabled, field, operator,
         comparison_value, integration_id, stop_processing, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,true,$10,$10)`,
      [id, userId, publicId, def.name, def.priority, def.field, def.operator, def.value, integrationId, now],
    );
    ruleRows.push({
      id,
      public_id: publicId,
      name: def.name,
      priority: def.priority,
      enabled: true,
      field: def.field,
      operator: def.operator,
      comparison_value: def.value,
      integration_id: integrationId,
      integration_name: integrations.find((i) => i.provider === def.provider)?.name ?? def.provider,
      provider: def.provider,
      stop_processing: true,
    });
  }

  const leadIds: string[] = [];
  const leadPublic: string[] = [];

  for (let i = 0; i < SEED_LEADS.length; i += 1) {
    const fixture = SEED_LEADS[i]!;
    const created = daysAgo(fixture.days_ago, fixture.hours);
    const createdIso = created.toISOString();
    const payload: LeadIntakeInput = { ...fixture };
    const normalized = normalizeLead(payload);
    const id = newId("lead");
    const publicId = await nextPublic(sql, userId, "lead");
    leadIds.push(id);
    leadPublic.push(publicId);

    let duplicateOf: string | null = null;
    if (fixture.duplicate_of !== undefined) {
      duplicateOf = leadIds[fixture.duplicate_of] ?? null;
    }
    const status: LeadStatus = duplicateOf
      ? "duplicate"
      : (normalized.budget ?? 0) >= 5000
        ? "qualified"
        : "accepted";

    await sql.query(
      `insert into leads (
         id, user_id, public_id, first_name, last_name, email, normalized_email,
         phone, normalized_phone, company, job_title, country, service, budget, currency,
         message, source, external_id, utm_source, utm_medium, utm_campaign, metadata,
         original_payload, status, duplicate_of_id, duplicate_reason, duplicate_detected_at,
         created_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
         $22::jsonb,$23::jsonb,$24,$25,$26,$27,$28,$28
       )`,
      [
        id,
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
        JSON.stringify({ seeded: true }),
        JSON.stringify(payload),
        status,
        duplicateOf,
        fixture.duplicate_reason ?? null,
        duplicateOf ? createdIso : null,
        createdIso,
      ],
    );

    const fallback = {
      id: integrationIds.webhook!,
      name: "Default CRM Sandbox",
      provider: "webhook",
    };
    const decision = routeLead(normalized, ruleRows, fallback);
    await sql.query(
      `insert into routing_decisions (id, user_id, lead_id, matched_rule_id, integration_id, reason, evaluation_log, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        newId("rd"),
        userId,
        id,
        decision.matched_rule_id,
        decision.integration_id,
        decision.reason,
        JSON.stringify(decision.evaluation_log),
        createdIso,
      ],
    );

    const deliveryId = newId("dlv");
    const deliveryPublic = await nextPublic(sql, userId, "delivery");
    const adapter = getAdapter(decision.provider as Provider, Boolean(fixture.force_fail));
    const dto = { ...normalized, public_id: publicId, source: normalized.source };
    let contactId: string | null = null;
    let dealId: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let requestPayload: unknown = mapPayload(decision.provider as Provider, dto);
    let responsePayload: unknown = { sandbox: true };
    let duration = 210;

    if (fixture.delivery === "delivered" || fixture.delivery === "failed") {
      const contact = await adapter.createOrUpdateContact(dto);
      duration = contact.duration_ms;
      requestPayload = contact.payload;
      responsePayload = contact.payload;
      if (contact.ok) {
        const deal = await adapter.createDeal(dto, contact);
        contactId = contact.contact_id ?? null;
        dealId = deal.deal_id ?? null;
        responsePayload = { contact: contact.payload, deal: deal.payload };
        duration += deal.duration_ms;
      } else {
        errorCode = contact.error_code ?? "sandbox_error";
        errorMessage = contact.error_message ?? "Sandbox delivery failed";
      }
    }

    const attemptCount = fixture.delivery === "queued" ? 0 : fixture.delivery === "failed" ? 3 : 1;
    await sql.query(
      `insert into deliveries (
         id, user_id, public_id, lead_id, integration_id, status, attempt_count,
         provider_contact_id, provider_deal_id, request_payload, response_payload,
         error_code, error_message, next_retry_at, force_fail, created_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$16
       )`,
      [
        deliveryId,
        userId,
        deliveryPublic,
        id,
        decision.integration_id,
        fixture.delivery,
        attemptCount,
        contactId,
        dealId,
        JSON.stringify(requestPayload),
        JSON.stringify(responsePayload),
        errorCode,
        errorMessage,
        fixture.delivery === "failed" ? null : null,
        Boolean(fixture.force_fail),
        createdIso,
      ],
    );

    if (fixture.delivery !== "queued") {
      const attempts = fixture.delivery === "failed" ? 3 : 1;
      for (let a = 1; a <= attempts; a += 1) {
        const ok = fixture.delivery === "delivered";
        await sql.query(
          `insert into delivery_attempts (
             id, user_id, delivery_id, attempt_number, status, request_payload, response_payload,
             error_message, duration_ms, created_at
           ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
          [
            newId("att"),
            userId,
            deliveryId,
            a,
            ok ? "delivered" : "failed",
            JSON.stringify(requestPayload),
            JSON.stringify(responsePayload),
            ok ? null : errorMessage,
            duration + a * 40,
            new Date(created.getTime() + a * 30_000).toISOString(),
          ],
        );
      }
    }

    await sql.query(
      `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data, created_at)
       values ($1,$2,'system','seed','lead',$3,'lead.accepted',$4::jsonb,$5)`,
      [newId("aud"), userId, id, JSON.stringify({ public_id: publicId, source: normalized.source }), createdIso],
    );
    await sql.query(
      `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data, created_at)
       values ($1,$2,'system','router','lead',$3,'lead.routed',$4::jsonb,$5)`,
      [
        newId("aud"),
        userId,
        id,
        JSON.stringify({ destination: decision.integration_name, reason: decision.reason }),
        createdIso,
      ],
    );
    if (fixture.delivery !== "queued") {
      await sql.query(
        `insert into audit_events (id, user_id, actor_type, actor_id, entity_type, entity_id, event_type, event_data, created_at)
         values ($1,$2,'system','worker','delivery',$3,$4,$5::jsonb,$6)`,
        [
          newId("aud"),
          userId,
          deliveryId,
          fixture.delivery === "delivered" ? "delivery.delivered" : "delivery.failed",
          JSON.stringify({ status: fixture.delivery }),
          createdIso,
        ],
      );
    }
  }
}

export { SEED_LEADS };
