import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  GitBranch,
  LayoutDashboard,
  Menu,
  Plug,
  Search,
  Settings,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { searchLeads } from "@/server/fns";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/deliveries", label: "Deliveries", icon: Activity },
  { to: "/routing", label: "Routing rules", icon: GitBranch },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/intake-simulator", label: "Intake simulator", icon: Webhook },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-sidebar text-sidebar-fg transition-transform duration-200 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
          <Mark />
          <div>
            <p className="text-sm font-semibold tracking-tight">PipelineSync</p>
            <p className="text-[11px] text-sidebar-muted">Lead routing</p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-sm p-1 text-sidebar-muted md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium",
                  active ? "bg-sidebar-active text-white" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3 text-[11px] leading-4 text-sidebar-muted">
          Demo environment. All contacts and companies are fictional.
        </div>
      </aside>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-surface-muted md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-sm border border-border bg-surface-muted px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted sm:inline">
              Sandbox
            </span>
            <span className="hidden items-center gap-1.5 rounded-sm border border-success/20 bg-success-muted px-2 py-1 text-[11px] font-medium text-success sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              API healthy
            </span>
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-surface-muted" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-40 truncate text-xs text-muted lg:inline">
                  {user?.primaryEmail ?? user?.displayName ?? "Operator"}
                </span>
                <UserButton />
              </div>
            )}
          </div>
        </header>
        <div className="px-4 py-5 md:px-6">{children}</div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 text-primary" aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <circle cx="8" cy="12" r="2.1" fill="white" />
      <circle cx="16" cy="12" r="2.1" fill="white" />
      <path d="M10.2 12h3.6" stroke="white" strokeWidth="1.6" />
    </svg>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ public_id: string; first_name: string; last_name: string; company: string }[]>(
    [],
  );
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      searchLeads({ data: q })
        .then(setHits)
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search leads, companies, IDs"
        className="h-9 w-full rounded-md border border-border bg-surface-muted pl-8 text-sm outline-none focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15"
        aria-label="Global search"
      />
      {open && hits.length > 0 ? (
        <ul className="absolute top-10 z-30 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {hits.map((hit) => (
            <li key={hit.public_id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  void navigate({ to: "/leads/$leadId", params: { leadId: hit.public_id } });
                }}
              >
                <span>
                  {hit.first_name} {hit.last_name}
                  <span className="ml-2 text-muted">{hit.company}</span>
                </span>
                <span className="font-mono text-[11px] text-muted">{hit.public_id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
