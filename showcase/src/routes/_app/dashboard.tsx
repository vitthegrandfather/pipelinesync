import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Copy, Send, Users, Workflow } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DeliveryBadge, DuplicateBadge, LeadBadge } from "@/components/status-badge";
import { ErrorState, Skeleton } from "@/components/empty-state";
import { getDashboard } from "@/server/fns";
import { formatDateTime, formatPercent } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }
  if (query.error) return <ErrorState message="Could not load dashboard metrics." onRetry={() => void query.refetch()} />;
  const data = query.data!;
  const m = data.metrics;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">Intake health, routing volume, and sandbox delivery status.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total leads" value={String(m.total_leads)} icon={Users} />
        <Metric label="Qualified" value={String(m.qualified_leads)} icon={Workflow} />
        <Metric label="Duplicate rate" value={formatPercent(m.duplicate_rate)} icon={Copy} />
        <Metric label="Delivery success" value={formatPercent(m.delivery_success_rate)} icon={Send} />
        <Metric label="Failed deliveries" value={String(m.failed_deliveries)} icon={AlertTriangle} warn={m.failed_deliveries > 0} />
        <Metric label="Avg duration" value={m.avg_delivery_ms ? `${m.avg_delivery_ms} ms` : "—"} icon={Clock3} />
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        <Card title="Lead volume · 14 days" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.volume} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#E3E7ED" />
                <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Leads by source">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.sources} dataKey="count" nameKey="source" innerRadius={48} outerRadius={72} paddingAngle={2}>
                  {data.sources.map((s, i) => (
                    <Cell key={s.source} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-1 text-xs">
            {data.sources.map((s, i) => (
              <li key={s.source} className="flex justify-between text-muted">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                  {s.source}
                </span>
                <span className="tabular-nums text-foreground">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        <Card title="Recent leads" className="lg:col-span-2" action={<Link to="/leads" className="text-xs font-medium text-primary">View all</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  {["ID", "Contact", "Source", "Destination", "Status", "Created"].map((h) => (
                    <th key={h} className="border-b border-border py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_leads.map((lead) => (
                  <tr key={lead.public_id} className="border-b border-border/70 last:border-0">
                    <td className="py-2 font-mono text-[12px]">
                      <Link to="/leads/$leadId" params={{ leadId: lead.public_id }} className="text-primary">{lead.public_id}</Link>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {lead.first_name} {lead.last_name}
                        {lead.duplicate ? <DuplicateBadge /> : null}
                      </div>
                      <p className="text-xs text-muted">{lead.company}</p>
                    </td>
                    <td className="py-2 text-muted">{lead.source}</td>
                    <td className="py-2">{lead.destination}</td>
                    <td className="py-2"><div className="flex flex-wrap gap-1"><LeadBadge status={lead.status} /><DeliveryBadge status={lead.delivery_status} /></div></td>
                    <td className="py-2 text-xs text-muted">{formatDateTime(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Delivery failures" action={<Link to="/deliveries" className="text-xs font-medium text-primary">Open</Link>}>
          {data.recent_failures.length === 0 ? (
            <p className="py-6 text-sm text-muted">No failed deliveries in this workspace.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recent_failures.map((f) => (
                <li key={f.public_id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/leads/$leadId" params={{ leadId: f.lead_public_id }} className="font-mono text-[12px] text-primary">
                      {f.public_id}
                    </Link>
                    <DeliveryBadge status={f.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{f.provider}</p>
                  <p className="text-xs text-danger">{f.error_message ?? "Provider error"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

const SOURCE_COLORS = ["#2563EB", "#172033", "#16A34A", "#D97706", "#667085", "#7C3AED"];
const tooltipStyle = { border: "1px solid #E3E7ED", borderRadius: 8, fontSize: 12 };

function Metric({
  label,
  value,
  icon: Icon,
  warn,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  warn?: boolean;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-muted">
        <p className="text-[11px] font-medium tracking-wide uppercase">{label}</p>
        <Icon className="size-4" />
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${warn ? "text-danger" : ""}`}>{value}</p>
    </article>
  );
}

function Card({
  title,
  children,
  className = "",
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-md border border-border bg-surface p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
