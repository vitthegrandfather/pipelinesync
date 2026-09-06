-- PipelineSync domain schema. All tenant rows are scoped by user_id (TEXT).

create table if not exists workspaces (
  user_id text primary key,
  seeded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists id_counters (
  user_id text not null,
  kind text not null,
  value integer not null default 0,
  primary key (user_id, kind)
);

create table if not exists api_keys (
  id text primary key,
  user_id text not null,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  key_last4 text not null,
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists api_keys_hash_idx on api_keys (key_hash);
create index if not exists api_keys_user_idx on api_keys (user_id);

create table if not exists integrations (
  id text primary key,
  user_id text not null,
  public_id text not null,
  provider text not null,
  name text not null,
  mode text not null default 'sandbox',
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  health_status text not null default 'healthy',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists integrations_user_public_idx on integrations (user_id, public_id);
create index if not exists integrations_user_idx on integrations (user_id);

create table if not exists routing_rules (
  id text primary key,
  user_id text not null,
  public_id text not null,
  name text not null,
  priority integer not null,
  enabled boolean not null default true,
  field text not null,
  operator text not null,
  comparison_value text,
  integration_id text not null,
  stop_processing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists routing_rules_user_public_idx on routing_rules (user_id, public_id);
create index if not exists routing_rules_priority_idx on routing_rules (user_id, priority);
create index if not exists routing_rules_user_idx on routing_rules (user_id);

create table if not exists leads (
  id text primary key,
  user_id text not null,
  public_id text not null,
  first_name text,
  last_name text,
  email text,
  normalized_email text,
  phone text,
  normalized_phone text,
  company text,
  job_title text,
  country text,
  service text,
  budget numeric,
  currency text,
  message text,
  source text,
  external_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  metadata jsonb,
  original_payload jsonb,
  status text not null default 'accepted',
  duplicate_of_id text,
  duplicate_reason text,
  duplicate_detected_at timestamptz,
  idempotency_key text,
  idempotency_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_user_public_idx on leads (user_id, public_id);
create index if not exists leads_normalized_email_idx on leads (user_id, normalized_email);
create index if not exists leads_normalized_phone_idx on leads (user_id, normalized_phone);
create index if not exists leads_source_external_idx on leads (user_id, source, external_id);
create index if not exists leads_created_idx on leads (user_id, created_at desc);
create index if not exists leads_status_idx on leads (user_id, status);
create unique index if not exists leads_idempotency_idx on leads (user_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists routing_decisions (
  id text primary key,
  user_id text not null,
  lead_id text not null,
  matched_rule_id text,
  integration_id text,
  reason text,
  evaluation_log jsonb,
  created_at timestamptz not null default now()
);
create index if not exists routing_decisions_lead_idx on routing_decisions (lead_id);
create index if not exists routing_decisions_user_idx on routing_decisions (user_id);

create table if not exists deliveries (
  id text primary key,
  user_id text not null,
  public_id text not null,
  lead_id text not null,
  integration_id text not null,
  status text not null,
  attempt_count integer not null default 0,
  provider_contact_id text,
  provider_deal_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  next_retry_at timestamptz,
  force_fail boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists deliveries_user_public_idx on deliveries (user_id, public_id);
create index if not exists deliveries_status_idx on deliveries (user_id, status);
create index if not exists deliveries_lead_idx on deliveries (lead_id);
create index if not exists deliveries_created_idx on deliveries (user_id, created_at desc);

create table if not exists delivery_attempts (
  id text primary key,
  user_id text not null,
  delivery_id text not null,
  attempt_number integer not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists delivery_attempts_delivery_idx on delivery_attempts (delivery_id, attempt_number);

create table if not exists audit_events (
  id text primary key,
  user_id text not null,
  actor_type text not null,
  actor_id text,
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  event_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_entity_idx on audit_events (user_id, entity_type, entity_id, created_at);

create table if not exists idempotency_records (
  id text primary key,
  user_id text not null,
  key text not null,
  payload_hash text not null,
  lead_id text,
  response jsonb not null,
  created_at timestamptz not null default now()
);
create unique index if not exists idempotency_user_key_idx on idempotency_records (user_id, key);
