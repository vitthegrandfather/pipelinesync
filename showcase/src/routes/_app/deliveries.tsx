import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Skeleton } from "@/components/empty-state";
import { DeliveryBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { listDeliveries, retryDelivery } from "@/server/fns";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/deliveries")({ component: DeliveriesPage });

function DeliveriesPage() {
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["deliveries", status, provider],
    queryFn: () => listDeliveries({ data: { status: status || undefined, provider: provider || undefined } }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryDelivery({ data: id }),
    onSuccess: () => {
      toast.success("Retry queued and processed in sandbox mode");
      void qc.invalidateQueries({ queryKey: ["deliveries"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Deliveries</h1>
        <p className="text-sm text-muted">Sandbox CRM jobs, retries, and dead-lettered payloads.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {["queued", "processing", "delivered", "failed", "retry_scheduled", "dead_letter"].map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </Select>
        <Select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Filter by provider">
          <option value="">All providers</option>
          <option value="hubspot">HubSpot</option>
          <option value="pipedrive">Pipedrive</option>
          <option value="zoho">Zoho</option>
          <option value="webhook">Default webhook</option>
        </Select>
      </div>
      {query.isLoading ? <Skeleton className="h-72" /> : null}
      {query.error ? <ErrorState message="Could not load deliveries." onRetry={() => void query.refetch()} /> : null}
      {query.data && query.data.length === 0 ? (
        <EmptyState title="No deliveries" description="Submit a lead from the intake simulator." />
      ) : null}
      {query.data && query.data.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-surface-muted text-[11px] tracking-wide text-muted uppercase">
              <tr>
                {["Delivery", "Lead", "Provider", "Status", "Attempts", "Last error", "Duration", "Next retry", "Created", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-[12px]">{row.public_id}</td>
                  <td className="px-3 py-2">
                    <Link className="font-mono text-[12px] text-primary" to="/leads/$leadId" params={{ leadId: row.lead_public_id }}>
                      {row.lead_public_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.provider}</td>
                  <td className="px-3 py-2"><DeliveryBadge status={row.status} /></td>
                  <td className="px-3 py-2 tabular-nums">{row.attempt_count}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-xs text-danger">{row.error_message ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted">{row.duration_ms ? `${row.duration_ms} ms` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{row.next_retry_at ? formatDateTime(row.next_retry_at) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-2">
                    {row.status === "failed" || row.status === "dead_letter" || row.status === "retry_scheduled" || row.status === "queued" ? (
                      <Button size="sm" variant="secondary" onClick={() => retry.mutate(row.id)} disabled={retry.isPending}>
                        Retry
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
