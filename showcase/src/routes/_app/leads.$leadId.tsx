import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, Skeleton } from "@/components/empty-state";
import { JsonViewer } from "@/components/json-viewer";
import { DeliveryBadge, DuplicateBadge, LeadBadge, SandboxBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getLead, retryDelivery, simulateFailureOnDelivery } from "@/server/fns";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_app/leads/$leadId")({ component: LeadDetailPage });

const TABS = ["Summary", "Attribution", "Routing", "Deliveries", "Audit log", "Raw payload"] as const;

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Summary");
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["lead", leadId], queryFn: () => getLead({ data: leadId }) });
  const retry = useMutation({
    mutationFn: (id: string) => retryDelivery({ data: id }),
    onSuccess: () => {
      toast.success("Delivery retried");
      void qc.invalidateQueries({ queryKey: ["lead", leadId] });
      void qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const fail = useMutation({
    mutationFn: (id: string) => simulateFailureOnDelivery({ data: id }),
    onSuccess: () => {
      toast.message("Sandbox failure simulated");
      void qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
  });

  if (query.isLoading) return <Skeleton className="h-96" />;
  if (query.error) return <ErrorState message="Lead could not be loaded." onRetry={() => void query.refetch()} />;
  const lead = query.data!;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-muted">{lead.public_id}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {String(lead.first_name ?? "")} {String(lead.last_name ?? "")}
          </h1>
          <LeadBadge status={lead.status} />
          {lead.duplicate ? <DuplicateBadge /> : null}
          {lead.delivery ? <DeliveryBadge status={lead.delivery.status} /> : null}
        </div>
        <p className="text-sm text-muted">{String(lead.company ?? "—")} · {String(lead.job_title ?? "—")}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === item ? "border-primary font-medium text-foreground" : "border-transparent text-muted"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Summary" ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Contact" className="lg:col-span-2">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Item k="Email" v={String(lead.email ?? "—")} />
              <Item k="Normalized email" v={String(lead.normalized_email ?? "—")} mono />
              <Item k="Phone" v={String(lead.phone ?? "—")} />
              <Item k="Normalized phone" v={String(lead.normalized_phone ?? "—")} mono />
              <Item k="Country" v={String(lead.country ?? "—")} />
              <Item k="Service" v={String(lead.service ?? "—")} />
              <Item k="Budget" v={formatMoney(lead.budget, String(lead.currency ?? "USD"))} />
              <Item k="Source" v={String(lead.source ?? "—")} />
            </dl>
            <p className="mt-3 text-sm leading-6 text-foreground">{String(lead.message ?? "")}</p>
          </Panel>
          <Panel title="Duplicate analysis">
            {lead.duplicate ? (
              <p className="text-sm">
                Detected via {String(lead.duplicate_reason ?? "match")} at {formatDateTime(lead.duplicate_detected_at)}.
                Original record:{" "}
                {lead.duplicate_of_id ? (
                  <Link className="font-mono text-primary" to="/leads/$leadId" params={{ leadId: lead.duplicate_of_id }}>
                    {lead.duplicate_of_id}
                  </Link>
                ) : "—"}
              </p>
            ) : (
              <p className="text-sm text-muted">No duplicate match on email, phone, or source + external ID.</p>
            )}
            {lead.related_duplicates.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {lead.related_duplicates.map((id) => (
                  <li key={id}>
                    Later duplicate: <Link className="font-mono text-primary" to="/leads/$leadId" params={{ leadId: id }}>{id}</Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {tab === "Attribution" ? (
        <Panel title="Original source and UTM">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Item k="Source" v={String(lead.source ?? "—")} />
            <Item k="External ID" v={String(lead.external_id ?? "—")} mono />
            <Item k="utm_source" v={String(lead.utm_source ?? "—")} />
            <Item k="utm_medium" v={String(lead.utm_medium ?? "—")} />
            <Item k="utm_campaign" v={String(lead.utm_campaign ?? "—")} />
            <Item k="Created" v={formatDateTime(lead.created_at)} />
          </dl>
          {lead.metadata ? <div className="mt-4"><JsonViewer value={lead.metadata} label="Metadata" /></div> : null}
        </Panel>
      ) : null}

      {tab === "Routing" ? (
        <Panel title="Routing decision">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{lead.destination ?? "Unassigned"}</p>
            <SandboxBadge />
          </div>
          <p className="text-sm text-muted">{lead.routing.reason}</p>
          {lead.routing.matched_rule ? (
            <p className="mt-1 font-mono text-xs text-muted">
              {lead.routing.matched_rule.public_id} · {lead.routing.matched_rule.name}
            </p>
          ) : null}
          <ol className="mt-4 space-y-2">
            {(lead.routing.evaluation_log as { public_id: string; name: string; matched: boolean; skipped: boolean; detail: string }[]).map((ev) => (
              <li key={ev.public_id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ev.name}</span>
                  <span className={ev.matched ? "text-success" : "text-muted"}>{ev.skipped ? "skipped" : ev.matched ? "matched" : "no match"}</span>
                </div>
                <p className="text-xs text-muted">{ev.detail}</p>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {tab === "Deliveries" && lead.delivery ? (
        <Panel title="Delivery attempts">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{lead.delivery.public_id}</span>
            <DeliveryBadge status={lead.delivery.status} />
            <SandboxBadge />
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Item k="CRM contact ID" v={String(lead.delivery.provider_contact_id ?? "—")} mono />
            <Item k="CRM deal ID" v={String(lead.delivery.provider_deal_id ?? "—")} mono />
            <Item k="Attempts" v={String(lead.delivery.attempt_count)} />
            <Item k="Error" v={String(lead.delivery.error_message ?? "—")} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {(lead.delivery.status === "failed" || lead.delivery.status === "dead_letter" || lead.delivery.status === "retry_scheduled") ? (
              <Button onClick={() => retry.mutate(lead.delivery!.id)} disabled={retry.isPending}>Retry delivery</Button>
            ) : null}
            <Button variant="secondary" onClick={() => fail.mutate(lead.delivery!.id)} disabled={fail.isPending}>
              Simulate failure
            </Button>
          </div>
          <ol className="mt-4 space-y-2">
            {lead.delivery.attempts.map((a) => (
              <li key={a.attempt_number} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Attempt {a.attempt_number}</span>
                  <DeliveryBadge status={a.status} />
                </div>
                <p className="text-xs text-muted">{formatDateTime(a.created_at)} · {a.duration_ms ?? "—"} ms</p>
                {a.error_message ? <p className="mt-1 text-xs text-danger">{String(a.error_message)}</p> : null}
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <JsonViewer value={lead.delivery.request_payload} label="Request payload" />
            <JsonViewer value={lead.delivery.response_payload} label="Sandbox response" />
          </div>
        </Panel>
      ) : null}

      {tab === "Audit log" ? (
        <Panel title="Audit trail">
          <ol className="relative space-y-4 border-l border-border pl-4">
            {lead.audit.map((ev, i) => (
              <li key={`${ev.event_type}-${i}`}>
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-border bg-surface" />
                <p className="text-sm font-medium">{ev.event_type}</p>
                <p className="text-xs text-muted">{ev.actor_type} · {formatDateTime(ev.created_at)}</p>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {tab === "Raw payload" ? <JsonViewer value={lead.original_payload} label="Original webhook payload" /> : null}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-border bg-surface p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted uppercase">{k}</dt>
      <dd className={mono ? "font-mono text-sm break-all" : "text-sm"}>{v}</dd>
    </div>
  );
}
