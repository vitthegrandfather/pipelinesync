import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/empty-state";
import { DeliveryBadge, DuplicateBadge, LeadBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { exportLeadsCsv, listLeads } from "@/server/fns";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/leads/")({ component: LeadsPage });

type Filters = {
  q: string;
  status: string;
  duplicate: "all" | "yes" | "no";
  source: string;
  service: string;
  country: string;
  destination: string;
  delivery_status: string;
  from: string;
  to: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  page_size: number;
};

const INITIAL: Filters = {
  q: "",
  status: "",
  duplicate: "all",
  source: "",
  service: "",
  country: "",
  destination: "",
  delivery_status: "",
  from: "",
  to: "",
  sort: "created_at",
  dir: "desc",
  page: 1,
  page_size: 12,
};

function LeadsPage() {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["leads", filters],
    queryFn: () => listLeads({ data: filters }),
  });

  function patch(partial: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...partial, page: partial.page ?? 1 }));
  }

  const pages = useMemo(
    () => Math.max(1, Math.ceil((query.data?.total ?? 0) / filters.page_size)),
    [query.data, filters.page_size],
  );

  async function onExport() {
    const res = await exportLeadsCsv({ data: filters });
    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted">Search, filter, and export the current workspace.</p>
        </div>
        <Button variant="secondary" onClick={() => void onExport()}>
          <Download className="size-4" /> Export CSV
        </Button>
      </header>

      <div className="grid gap-2 rounded-md border border-border bg-surface p-3 md:grid-cols-4 xl:grid-cols-8">
        <Input placeholder="Search name, email, company, ID" value={filters.q} onChange={(e) => patch({ q: e.target.value })} aria-label="Search leads" />
        <Select value={filters.status} onChange={(e) => patch({ status: e.target.value })} aria-label="Lead status">
          <option value="">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="qualified">Qualified</option>
          <option value="duplicate">Duplicate</option>
        </Select>
        <Select value={filters.duplicate} onChange={(e) => patch({ duplicate: e.target.value as Filters["duplicate"] })} aria-label="Duplicate state">
          <option value="all">Duplicates: all</option>
          <option value="yes">Duplicates only</option>
          <option value="no">New only</option>
        </Select>
        <Select value={filters.source} onChange={(e) => patch({ source: e.target.value })} aria-label="Source">
          <option value="">All sources</option>
          {(query.data?.facets.sources ?? []).map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={filters.service} onChange={(e) => patch({ service: e.target.value })} aria-label="Service">
          <option value="">All services</option>
          {(query.data?.facets.services ?? []).map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={filters.country} onChange={(e) => patch({ country: e.target.value })} aria-label="Country">
          <option value="">All countries</option>
          {(query.data?.facets.countries ?? []).map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={filters.delivery_status} onChange={(e) => patch({ delivery_status: e.target.value })} aria-label="Delivery status">
          <option value="">All deliveries</option>
          {["queued", "processing", "delivered", "failed", "retry_scheduled", "dead_letter"].map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </Select>
        <Button variant="ghost" onClick={() => setFilters(INITIAL)}>Reset filters</Button>
      </div>

      {query.isLoading ? <Skeleton className="h-80" /> : null}
      {query.error ? <ErrorState message="Could not load leads. Check filters and try again." onRetry={() => void query.refetch()} /> : null}
      {query.data && query.data.items.length === 0 ? (
        <EmptyState title="No leads match these filters" description="Clear filters or submit a lead from the intake simulator." />
      ) : null}

      {query.data && query.data.items.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-surface-muted text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  {["ID", "Contact", "Company", "Service", "Source", "Destination", "Lead", "Delivery", "Created"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((lead) => (
                  <tr
                    key={lead.public_id}
                    className="cursor-pointer border-t border-border hover:bg-surface-muted"
                    onClick={() => void navigate({ to: "/leads/$leadId", params: { leadId: lead.public_id } })}
                  >
                    <td className="px-3 py-2 font-mono text-[12px] text-primary">{lead.public_id}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {lead.first_name} {lead.last_name}
                        {lead.duplicate ? <DuplicateBadge /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{lead.company}</td>
                    <td className="px-3 py-2 text-muted">{lead.service}</td>
                    <td className="px-3 py-2 text-muted">{lead.source}</td>
                    <td className="px-3 py-2">{lead.destination}</td>
                    <td className="px-3 py-2"><LeadBadge status={lead.status} /></td>
                    <td className="px-3 py-2"><DeliveryBadge status={lead.delivery_status} /></td>
                    <td className="px-3 py-2 text-xs text-muted">{formatDateTime(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {query.data.items.map((lead) => (
              <Link
                key={lead.public_id}
                to="/leads/$leadId"
                params={{ leadId: lead.public_id }}
                className="block rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{lead.first_name} {lead.last_name}</p>
                  <DeliveryBadge status={lead.delivery_status} />
                </div>
                <p className="text-xs text-muted">{lead.company} · {lead.service}</p>
                <p className="mt-1 font-mono text-[11px] text-primary">{lead.public_id}</p>
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-muted">
            <p>{query.data.total} leads</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={filters.page <= 1} onClick={() => patch({ page: filters.page - 1 })}>Previous</Button>
              <span className="px-2 py-1 tabular-nums">{filters.page} / {pages}</span>
              <Button variant="secondary" size="sm" disabled={filters.page >= pages} onClick={() => patch({ page: filters.page + 1 })}>Next</Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
