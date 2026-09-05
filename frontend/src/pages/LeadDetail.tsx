import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export function LeadDetailPage() {
  const { leadId = "" } = useParams();
  const [tab, setTab] = useState("Summary");
  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api<Record<string, unknown>>(`/api/v1/leads/${leadId}`),
  });
  const { data: audit } = useQuery({
    queryKey: ["audit", leadId],
    queryFn: () => api<{ items: { event_type: string; created_at: string; event_data: unknown }[] }>(`/api/v1/leads/${leadId}/audit`),
  });
  if (isLoading) return <p>Loading lead…</p>;
  if (!data) return <p role="alert">Lead not found.</p>;
  const tabs = ["Summary", "Attribution", "Routing", "Deliveries", "Audit log", "Raw payload"];
  return (
    <div>
      <p className="muted"><Link to="/leads">Leads</Link> / {String(data.public_id)}</p>
      <h1 className="page-title">{String(data.first_name)} {String(data.last_name)}</h1>
      {data.duplicate ? <span className="badge warning">Duplicate of {String(data.duplicate_of_public_id || "")}</span> : null}
      <div className="tabs">
        {tabs.map((name) => (
          <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab === "Summary" && (
        <div className="card">
          <p>{String(data.email)} · {String(data.phone)}</p>
          <p>{String(data.company)} · {String(data.job_title)}</p>
          <p>{String(data.service)} · {String(data.country)} · {String(data.budget)} {String(data.currency)}</p>
          <p>Normalized email {String(data.normalized_email)} · phone {String(data.normalized_phone)}</p>
        </div>
      )}
      {tab === "Attribution" && (
        <div className="card">
          <p>Source {String(data.source)} · External {String(data.external_id)}</p>
          <p>UTM {String(data.utm_source)} / {String(data.utm_medium)} / {String(data.utm_campaign)}</p>
        </div>
      )}
      {tab === "Routing" && <pre>{JSON.stringify(data.routing, null, 2)}</pre>}
      {tab === "Deliveries" && <pre>{JSON.stringify(data.deliveries, null, 2)}</pre>}
      {tab === "Audit log" && <pre>{JSON.stringify(audit?.items ?? [], null, 2)}</pre>}
      {tab === "Raw payload" && <pre>{JSON.stringify(data.original_payload, null, 2)}</pre>}
    </div>
  );
}
