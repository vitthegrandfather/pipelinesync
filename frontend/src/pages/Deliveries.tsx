import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";

type Delivery = {
  id: string;
  public_id: string;
  lead_public_id: string;
  provider: string;
  status: string;
  attempt_count: number;
  error_message: string | null;
  duration_ms: number | null;
  next_retry_at: string | null;
  created_at: string;
};

export function DeliveriesPage() {
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["deliveries", status],
    queryFn: () => api<{ items: Delivery[] }>(`/api/v1/deliveries?status=${encodeURIComponent(status)}`),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/api/v1/deliveries/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
  return (
    <div>
      <h1 className="page-title">Deliveries</h1>
      <div className="row" style={{ margin: "12px 0" }}>
        <select aria-label="Filter delivery status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
          <option value="retry_scheduled">Retry scheduled</option>
          <option value="dead_letter">Dead letter</option>
        </select>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Delivery</th><th>Lead</th><th>Provider</th><th>Status</th><th>Attempts</th><th>Error</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.public_id}</td>
                <td className="mono">{row.lead_public_id}</td>
                <td>{row.provider} <span className="badge info">Sandbox</span></td>
                <td><span className={`badge ${row.status === "delivered" ? "success" : row.status === "failed" || row.status === "dead_letter" ? "danger" : "warning"}`}>{row.status}</span></td>
                <td>{row.attempt_count}</td>
                <td>{row.error_message}</td>
                <td>
                  {["failed", "dead_letter", "retry_scheduled"].includes(row.status) ? (
                    <button className="btn primary" onClick={() => retry.mutate(row.id)}>Retry delivery</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
