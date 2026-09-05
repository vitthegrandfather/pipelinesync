import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { Link } from "react-router-dom";

type Dash = {
  metrics: {
    total_leads: number;
    qualified_leads: number;
    duplicate_rate: number;
    delivery_success_rate: number;
    failed_deliveries: number;
    avg_delivery_ms: number;
  };
  volume: { day: string; count: number }[];
  sources: { source: string; count: number }[];
  recent_leads: { public_id: string; first_name: string; last_name: string; company: string; delivery_status: string }[];
  recent_failures: { public_id: string; lead_public_id: string; provider: string; error_message: string | null; id: string }[];
};

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dash>("/api/v1/dashboard/summary"),
  });
  if (isLoading) return <p>Loading dashboard…</p>;
  if (error || !data) return <p role="alert">Unable to load dashboard metrics.</p>;
  const m = data.metrics;
  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="muted">Sandbox CRM routing health for the demo workspace.</p>
      <div className="notice">Demo environment. All contacts and companies are fictional.</div>
      <div className="grid metrics">
        {[
          ["Total leads", m.total_leads],
          ["Qualified", m.qualified_leads],
          ["Duplicate rate", `${m.duplicate_rate.toFixed(1)}%`],
          ["Delivery success", `${m.delivery_success_rate.toFixed(1)}%`],
          ["Failed deliveries", m.failed_deliveries],
          ["Avg delivery", `${m.avg_delivery_ms} ms`],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <h3>{label}</h3>
            <div className="metric">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginTop: 12 }}>
        <div className="card">
          <h3>Lead volume · 14 days</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.volume}>
                <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Leads by source</h3>
          {data.sources.map((s) => (
            <div key={s.source} className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span>{s.source}</span>
              <strong>{s.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
        <div className="card">
          <h3>Recent leads</h3>
          {data.recent_leads.map((l) => (
            <div key={l.public_id}>
              <Link to={`/leads/${l.public_id}`}>{l.public_id}</Link> {l.first_name} {l.last_name} · {l.company}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Recent failures</h3>
          {data.recent_failures.length === 0 ? <p className="muted">No failed deliveries.</p> : null}
          {data.recent_failures.map((f) => (
            <div key={f.id}>
              <Link to={`/deliveries`}>{f.public_id}</Link> · {f.provider}
              <div className="muted">{f.error_message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
