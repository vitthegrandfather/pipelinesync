import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ErrorState, Skeleton } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { SandboxBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listIntegrations, testIntegration, toggleIntegration } from "@/server/fns";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/integrations")({ component: IntegrationsPage });

function IntegrationsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["integrations"], queryFn: () => listIntegrations() });
  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggleIntegration({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
  const test = useMutation({
    mutationFn: (id: string) => testIntegration({ data: id }),
    onSuccess: (health) => {
      toast.success(health.message);
      void qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (query.isLoading) return <Skeleton className="h-72" />;
  if (query.error) return <ErrorState message="Could not load integrations." onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted">Demo connectors only. No live HubSpot, Pipedrive, or Zoho credentials are used.</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {query.data?.map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{item.name}</h2>
                <p className="text-xs text-muted capitalize">{item.provider} · {item.mode}</p>
              </div>
              <div className="flex gap-1">
                <SandboxBadge />
                <Badge tone={item.health_status === "healthy" ? "green" : "amber"}>{item.health_status}</Badge>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-[11px] text-muted uppercase">Successful</dt>
                <dd className="tabular-nums">{item.success_count}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted uppercase">Failed</dt>
                <dd className="tabular-nums">{item.failure_count}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-muted uppercase">Last successful delivery</dt>
                <dd>{item.last_success_at ? formatDateTime(item.last_success_at) : "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => test.mutate(item.id)} disabled={test.isPending}>
                Test connection
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggle.mutate({ id: item.id, enabled: !item.enabled })}
              >
                {item.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
