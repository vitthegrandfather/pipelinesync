import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

type Integration = {
  id: string;
  public_id: string;
  provider: string;
  name: string;
  mode: string;
  enabled: boolean;
  health_status: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  success_count: number;
  failure_count: number;
};

type Health = { status: string; provider: string; mode: string; latency_ms: number; message: string };

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api<{ items: Integration[] }>("/api/v1/integrations"),
  });
  const test = useMutation({
    mutationFn: (id: string) => api<Health>(`/api/v1/integrations/${id}/test`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
  const toggle = useMutation({
    mutationFn: (row: Integration) =>
      api(`/api/v1/integrations/${row.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  return (
    <div>
      <h1 className="page-title">Integrations</h1>
      <div className="notice">Sandbox adapters only. No live HubSpot, Pipedrive, or Zoho credentials are used.</div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {(data?.items ?? []).map((row) => (
          <div className="card stack" key={row.id}>
            <h3>{row.name}</h3>
            <div>
              <span className="badge info">{row.mode}</span>{" "}
              <span className={`badge ${row.health_status === "healthy" ? "success" : "warning"}`}>{row.health_status}</span>
            </div>
            <p className="muted">
              {row.success_count} delivered · {row.failure_count} failed
            </p>
            <p className="muted">Last success {row.last_success_at ?? "—"}</p>
            <div className="row">
              <button className="btn" onClick={() => toggle.mutate(row)}>
                {row.enabled ? "Enabled" : "Disabled"}
              </button>
              <button className="btn primary" onClick={() => test.mutate(row.id)}>
                Test connection
              </button>
            </div>
            {test.data && test.variables === row.id ? <p className="muted">{test.data.message}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
