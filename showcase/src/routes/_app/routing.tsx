import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, Skeleton } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { ROUTING_FIELDS, ROUTING_OPERATORS } from "@/lib/pipeline/types";
import type { RoutingResult } from "@/lib/pipeline/types";
import {
  deleteRule,
  listIntegrations,
  listLeadOptions,
  listRules,
  saveRule,
  simulateRouting,
  toggleRule,
} from "@/server/fns";

export const Route = createFileRoute("/_app/routing")({ component: RoutingPage });

function RoutingPage() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => listRules() });
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: () => listIntegrations() });
  const leads = useQuery({ queryKey: ["lead-options"], queryFn: () => listLeadOptions() });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [leadId, setLeadId] = useState("");
  const [sim, setSim] = useState<{
    decision: RoutingResult;
  } | null>(null);

  const save = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      priority: number;
      enabled: boolean;
      field: string;
      operator: string;
      comparison_value: string | null;
      integration_id: string;
      stop_processing: boolean;
    }) => saveRule({ data: input }),
    onSuccess: () => {
      toast.success("Rule saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggleRule({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rules"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRule({ data: id }),
    onSuccess: () => {
      toast.success("Rule deleted");
      void qc.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  async function runSim() {
    if (!leadId) return;
    const result = await simulateRouting({ data: { lead_id: leadId } });
    setSim(result);
  }

  if (rules.isLoading) return <Skeleton className="h-80" />;
  if (rules.error) return <ErrorState message="Could not load routing rules." onRetry={() => void rules.refetch()} />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Routing rules</h1>
          <p className="text-sm text-muted">Ordered evaluation. First enabled match with stop processing wins.</p>
        </div>
        <Button onClick={() => setEditing({ name: "", priority: 50, enabled: true, field: "country", operator: "equals", comparison_value: "", integration_id: integrations.data?.[0]?.id, stop_processing: true })}>
          New rule
        </Button>
      </header>

      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-surface-muted text-[11px] tracking-wide text-muted uppercase">
            <tr>
              {["Priority", "Rule", "Condition", "Destination", "Stop", "State", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.data?.map((rule) => (
              <tr key={rule.id} className="border-t border-border">
                <td className="px-3 py-2 tabular-nums">{rule.priority}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{rule.name}</p>
                  <p className="font-mono text-[11px] text-muted">{rule.public_id}</p>
                </td>
                <td className="px-3 py-2 text-muted">
                  {rule.field} {rule.operator.replaceAll("_", " ")} {rule.comparison_value}
                </td>
                <td className="px-3 py-2">{rule.destination}</td>
                <td className="px-3 py-2">{rule.stop_processing ? "yes" : "no"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-sm"
                    onClick={() => toggle.mutate({ id: rule.id, enabled: !rule.enabled })}
                  >
                    <Badge tone={rule.enabled ? "green" : "neutral"}>{rule.enabled ? "enabled" : "disabled"}</Badge>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(rule)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(rule.id)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <form
          className="grid gap-3 rounded-md border border-border bg-surface p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            save.mutate({
              id: editing.id as string | undefined,
              name: String(fd.get("name")),
              priority: Number(fd.get("priority")),
              enabled: fd.get("enabled") === "on",
              field: String(fd.get("field")),
              operator: String(fd.get("operator")),
              comparison_value: String(fd.get("comparison_value") || "") || null,
              integration_id: String(fd.get("integration_id")),
              stop_processing: fd.get("stop_processing") === "on",
            });
          }}
        >
          <h2 className="md:col-span-2 text-sm font-semibold">{editing.id ? "Edit rule" : "Create rule"}</h2>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={String(editing.name ?? "")} />
          </div>
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input id="priority" name="priority" type="number" required defaultValue={Number(editing.priority ?? 50)} />
          </div>
          <div>
            <Label htmlFor="field">Field</Label>
            <Select id="field" name="field" defaultValue={String(editing.field ?? "country")}>
              {ROUTING_FIELDS.map((f) => <option key={f}>{f}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="operator">Operator</Label>
            <Select id="operator" name="operator" defaultValue={String(editing.operator ?? "equals")}>
              {ROUTING_OPERATORS.map((f) => <option key={f} value={f}>{f.replaceAll("_", " ")}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="comparison_value">Value</Label>
            <Input id="comparison_value" name="comparison_value" defaultValue={String(editing.comparison_value ?? "")} />
          </div>
          <div>
            <Label htmlFor="integration_id">Destination</Label>
            <Select id="integration_id" name="integration_id" defaultValue={String(editing.integration_id ?? "")}>
              {integrations.data?.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={Boolean(editing.enabled)} /> Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="stop_processing" defaultChecked={Boolean(editing.stop_processing)} /> Stop processing on match
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" disabled={save.isPending}>Save rule</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Routing simulator</h2>
        <p className="mt-1 text-sm text-muted">Select a stored lead to see which rule would match. Nothing is saved.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-label="Lead to simulate" className="max-w-md">
            <option value="">Select a lead</option>
            {leads.data?.map((l) => (
              <option key={l.public_id} value={l.public_id}>
                {l.public_id} · {l.first_name} {l.last_name} · {l.company}
              </option>
            ))}
          </Select>
          <Button onClick={() => void runSim()} disabled={!leadId}>Simulate</Button>
        </div>
        {sim ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm">
              Destination: <strong>{sim.decision.integration_name}</strong>
            </p>
            <p className="text-sm text-muted">{sim.decision.reason}</p>
            <ol className="space-y-1 text-sm">
              {sim.decision.evaluation_log.map((ev) => (
                <li key={ev.rule_id} className="rounded-md border border-border px-3 py-2">
                  <span className="font-medium">{ev.name}</span>
                  <span className="ml-2 text-muted">{ev.skipped ? "skipped" : ev.matched ? "matched" : "no match"}</span>
                  <p className="text-xs text-muted">{ev.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    </div>
  );
}
