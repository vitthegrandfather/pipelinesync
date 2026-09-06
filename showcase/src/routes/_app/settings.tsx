import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ErrorState, Skeleton } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSettings, resetDemo } from "@/server/fns";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });
  const reset = useMutation({
    mutationFn: () => resetDemo(),
    onSuccess: () => {
      toast.success("Demo data restored");
      void qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (query.isLoading) return <Skeleton className="h-64" />;
  if (query.error) return <ErrorState message="Could not load settings." onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Workspace keys, sandbox notices, and demo reset.</p>
      </header>
      <section className="rounded-md border border-warning/30 bg-warning-muted p-4 text-sm text-foreground">
        Demo environment. All contacts and companies are fictional. CRM providers use deterministic sandbox adapters.
      </section>
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-muted">Raw secrets are never shown after creation. Masked values only.</p>
        <ul className="mt-3 divide-y divide-border">
          {query.data?.api_keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm font-medium">{key.name}</p>
                <p className="font-mono text-xs text-muted">{key.masked}</p>
              </div>
              <Badge tone={key.active ? "green" : "neutral"}>{key.active ? "active" : "revoked"}</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Reset demo data</h2>
        <p className="mt-1 text-sm text-muted">
          Restores the original 22 fictional leads, routing rules, integrations, and delivery history for this workspace.
        </p>
        <Button className="mt-3" variant="danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
          {reset.isPending ? "Resetting…" : "Reset demo data"}
        </Button>
      </section>
      <p className="text-xs text-muted">Last key created {query.data?.api_keys[0] ? formatDateTime(query.data.api_keys[0].created_at) : "—"}</p>
    </div>
  );
}
