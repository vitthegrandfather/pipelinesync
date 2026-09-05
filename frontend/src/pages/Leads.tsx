import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { filterLeads } from "./lead-filters";

type LeadRow = {
  public_id: string;
  first_name: string;
  last_name: string;
  company: string;
  service: string;
  source: string;
  destination: string;
  status: string;
  delivery_status: string;
  duplicate: boolean;
  created_at: string;
};

export function LeadsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { data } = useQuery({
    queryKey: ["leads", q, status],
    queryFn: () =>
      api<{ items: LeadRow[]; total: number }>(
        `/api/v1/leads?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page_size=50`,
      ),
  });
  const visible = useMemo(() => filterLeads(data?.items ?? [], q, status), [data?.items, q, status]);

  async function exportCsv() {
    const token = localStorage.getItem("ps_token");
    const response = await fetch("/api/v1/leads/export.csv", { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipelinesync-leads.csv";
    a.click();
  }

  return (
    <div>
      <h1 className="page-title">Leads</h1>
      <div className="row" style={{ margin: "12px 0" }}>
        <input aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="qualified">Qualified</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Contact</th><th>Company</th><th>Service</th><th>Source</th>
              <th>Destination</th><th>Lead</th><th>Delivery</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.public_id}>
                <td className="mono"><Link to={`/leads/${row.public_id}`}>{row.public_id}</Link></td>
                <td>{row.first_name} {row.last_name} {row.duplicate ? <span className="badge warning">Duplicate</span> : null}</td>
                <td>{row.company}</td>
                <td>{row.service}</td>
                <td>{row.source}</td>
                <td>{row.destination}</td>
                <td><span className="badge">{row.status}</span></td>
                <td><span className={`badge ${row.delivery_status === "delivered" ? "success" : row.delivery_status === "failed" ? "danger" : "warning"}`}>{row.delivery_status}</span></td>
                <td>{row.created_at?.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
