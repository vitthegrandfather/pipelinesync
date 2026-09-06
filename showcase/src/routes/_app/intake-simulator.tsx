import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { JsonViewer } from "@/components/json-viewer";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { SUPPORTED_COUNTRIES } from "@/lib/pipeline/types";
import { submitIntake } from "@/server/fns";
import type { IntakeResult } from "@/lib/pipeline/types";

export const Route = createFileRoute("/_app/intake-simulator")({ component: IntakePage });

const PRESETS = {
  new_lead: {
    first_name: "Jordan",
    last_name: "Hale",
    email: "jordan.hale@example.com",
    phone: "+1 206 555 0148",
    company: "Cedar & Pine",
    job_title: "Revenue Operations Lead",
    country: "US",
    service: "Website forms",
    budget: 3200,
    currency: "USD",
    message: "We need reliable form-to-CRM routing with UTM preservation.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "ops_intake",
    external_id: "FORM-22018",
  },
  maya: {
    first_name: "Maya",
    last_name: "Chen",
    email: "maya.chen@example.com",
    phone: "+44 20 7946 0958",
    company: "Northstar Studio",
    job_title: "Operations Manager",
    country: "GB",
    service: "CRM integration",
    budget: 8500,
    currency: "USD",
    message: "We need to connect three website forms to our CRM and preserve campaign attribution.",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "crm_automation_q3",
    external_id: "FORM-10482",
  },
  uk: {
    first_name: "Isla",
    last_name: "Bennett",
    email: "isla.bennett@example.com",
    phone: "+44 113 496 0182",
    company: "Humber Works",
    job_title: "Marketing Manager",
    country: "GB",
    service: "Lead capture",
    budget: 2100,
    currency: "USD",
    message: "UK inbound form currently emails a shared inbox.",
    source: "website",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    external_id: "FORM-8811",
  },
  automation: {
    first_name: "Noah",
    last_name: "Petit",
    email: "noah.petit@example.com",
    phone: "+33 4 72 55 0190",
    company: "Atelier Circuit",
    job_title: "COO",
    country: "FR",
    service: "Business automation",
    budget: 3600,
    currency: "USD",
    message: "Automate partner and inbound demo routing.",
    source: "partner",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    external_id: "PARTNER-19",
  },
};

type FormState = (typeof PRESETS)["new_lead"] & { simulate_failure: boolean };

function IntakePage() {
  const [form, setForm] = useState<FormState>({ ...PRESETS.new_lead, simulate_failure: false });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);

  const payload = useMemo(() => {
    const { simulate_failure, ...body } = form;
    void simulate_failure;
    return {
      ...body,
      metadata: { landing_page: "/crm-automation", language: "en" },
    };
  }, [form]);

  const mutation = useMutation({
    mutationFn: () =>
      submitIntake({
        data: {
          ...payload,
          simulate_failure: form.simulate_failure,
          idempotency_key: `sim_${crypto.randomUUID()}`,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      toast.success(data.duplicate ? "Duplicate lead stored" : "Lead accepted");
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Intake simulator</h1>
        <p className="text-sm text-muted">Submit a fictional lead and watch validation, routing, and sandbox delivery.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setForm({ ...PRESETS.new_lead, simulate_failure: false })}>New contact</Button>
        <Button size="sm" variant="secondary" onClick={() => setForm({ ...PRESETS.maya, simulate_failure: false })}>Maya Chen (duplicate)</Button>
        <Button size="sm" variant="secondary" onClick={() => setForm({ ...PRESETS.uk, simulate_failure: false })}>UK lead</Button>
        <Button size="sm" variant="secondary" onClick={() => setForm({ ...PRESETS.automation, simulate_failure: false })}>Automation</Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="min-w-0 space-y-3 rounded-md border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Select id="country" value={form.country} onChange={(e) => set("country", e.target.value)}>
                {SUPPORTED_COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="service">Service</Label>
              <Select id="service" value={form.service} onChange={(e) => set("service", e.target.value)}>
                {["CRM integration", "Business automation", "Website forms", "Lead capture", "Data migration", "Customer support tooling"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input id="budget" type="number" min={0} value={form.budget} onChange={(e) => set("budget", Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="source">Source</Label>
              <Select id="source" value={form.source} onChange={(e) => set("source", e.target.value)}>
                {["website", "webinar", "partner", "inbound", "linkedin", "referral"].map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="external_id">External ID</Label>
              <Input id="external_id" value={form.external_id} onChange={(e) => set("external_id", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="utm_source">utm_source</Label>
              <Input id="utm_source" value={form.utm_source} onChange={(e) => set("utm_source", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="utm_medium">utm_medium</Label>
              <Input id="utm_medium" value={form.utm_medium} onChange={(e) => set("utm_medium", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="utm_campaign">utm_campaign</Label>
              <Input id="utm_campaign" value={form.utm_campaign} onChange={(e) => set("utm_campaign", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" value={form.message} onChange={(e) => set("message", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.simulate_failure}
              onChange={(e) => set("simulate_failure", e.target.checked)}
            />
            Simulate provider failure <span className="text-muted">(demo control)</span>
          </label>
          <FieldError>{error}</FieldError>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Processing…" : "Submit lead"}</Button>
        </form>

        <div className="min-w-0 space-y-3">
          <div className="rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">Request preview</h2>
            <p className="mt-2 font-mono text-[12px] text-muted">POST /api/v1/intake/leads</p>
            <p className="font-mono text-[12px] text-muted">X-API-Key: ps_demo_••••••••4f82</p>
            <p className="font-mono text-[12px] text-muted">Idempotency-Key: sim_…</p>
            <div className="mt-3">
              <JsonViewer value={payload} label="JSON payload" />
            </div>
          </div>
          {result ? (
            <div className="rounded-md border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold">Processing timeline</h2>
              <ol className="mt-3 space-y-2">
                {result.steps.map((s) => (
                  <li key={s.id} className="flex gap-3">
                    <span
                      className={`mt-1 size-2.5 shrink-0 rounded-full ${s.status === "ok" ? "bg-success" : s.status === "warn" ? "bg-warning" : "bg-danger"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted">{s.timestamp} · {s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: result.lead_id }}
                  className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                >
                  Open lead
                </Link>
                <span className="text-xs text-muted">
                  {result.lead_id} · {result.assigned_destination} · {result.delivery_status}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
