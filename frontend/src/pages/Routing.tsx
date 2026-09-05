import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../api/client";

type Rule = {
  id: string;
  public_id: string;
  name: string;
  priority: number;
  enabled: boolean;
  field: string;
  operator: string;
  comparison_value: string;
  destination: string;
  provider: string;
  integration_id: string;
};

type Sim = {
  matched_rule_id: string | null;
  integration_name: string;
  provider: string;
  reason: string;
  evaluation_log: { public_id: string; name: string; matched: boolean; skipped: boolean; detail: string }[];
};

export function RoutingPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["rules"], queryFn: () => api<{ items: Rule[] }>("/api/v1/routing-rules") });
  const { data: integrations } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api<{ items: { id: string; name: string }[] }>("/api/v1/integrations"),
  });
  const [sim, setSim] = useState<Sim | null>(null);
  const [form, setForm] = useState({
    email: "oliver.grant@example.com",
    country: "GB",
    service: "Website forms",
    budget: "2400",
  });

  const toggle = useMutation({
    mutationFn: (rule: Rule) =>
      api(`/api/v1/routing-rules/${rule.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  async function simulate(event: FormEvent) {
    event.preventDefault();
    const result = await api<Sim>("/api/v1/routing-rules/simulate", {
      method: "POST",
      body: JSON.stringify({
        email: form.email,
        country: form.country,
        service: form.service,
        budget: Number(form.budget),
      }),
    });
    setSim(result);
  }

  return (
    <div>
      <h1 className="page-title">Routing rules</h1>
      <p className="muted">First enabled match wins. Lower priority numbers are evaluated first.</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Priority</th>
              <th>Condition</th>
              <th>Destination</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((rule) => (
              <tr key={rule.id}>
                <td className="mono">{rule.public_id}</td>
                <td>{rule.name}</td>
                <td>{rule.priority}</td>
                <td>
                  {rule.field} {rule.operator} {rule.comparison_value}
                </td>
                <td>
                  {rule.destination} <span className="badge info">Sandbox</span>
                </td>
                <td>
                  <button className="btn" onClick={() => toggle.mutate(rule)}>
                    {rule.enabled ? "On" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="page-title" style={{ marginTop: 24 }}>
        Simulator
      </h2>
      <form className="card stack" onSubmit={simulate}>
        <div className="row">
          <div className="field">
            <label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label>Country</label>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div className="field">
            <label>Service</label>
            <input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          </div>
          <div className="field">
            <label>Budget</label>
            <input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
        </div>
        <p className="muted">Destinations: {(integrations?.items ?? []).map((i) => i.name).join(" · ")}</p>
        <button className="btn primary" type="submit">
          Simulate routing
        </button>
      </form>
      {sim ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p>
            <strong>{sim.integration_name}</strong> · {sim.reason}
          </p>
          <ul className="timeline">
            {sim.evaluation_log.map((row) => (
              <li key={row.public_id}>
                {row.public_id} {row.name} — {row.skipped ? "skipped" : row.matched ? "matched" : "no match"} · {row.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
