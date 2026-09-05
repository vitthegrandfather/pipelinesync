import { FormEvent, useState } from "react";
import { ApiError, api, intakeSchemaFields, validateIntake } from "../api/client";

type Step = { id: string; label: string; status: string; timestamp: string; detail?: string | null };
type Result = {
  lead_id: string;
  status: string;
  duplicate: boolean;
  assigned_destination: string;
  delivery_status: string;
  steps: Step[];
};

const PRESETS: Record<string, Record<string, string>> = {
  new: {
    ...intakeSchemaFields,
    first_name: "Jordan",
    last_name: "Hale",
    email: "jordan.hale@example.com",
    phone: "+1 415 555 0199",
    company: "Cedar & Co",
    country: "US",
    service: "Website forms",
    budget: "1800",
    source: "website",
  },
  maya: {
    ...intakeSchemaFields,
    first_name: "Maya",
    last_name: "Chen",
    email: "maya.chen@example.com",
    phone: "+44 20 7946 0958",
    company: "Northstar Studio",
    country: "GB",
    service: "CRM integration",
    budget: "8500",
    source: "website",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "crm_automation_q3",
  },
};

export function IntakeSimulatorPage() {
  const [values, setValues] = useState(PRESETS.new);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fail, setFail] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function set(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validateIntake(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    setError("");
    try {
      const body = {
        ...values,
        budget: values.budget ? Number(values.budget) : null,
        simulate_failure: fail,
      };
      const data = await api<Result>("/api/v1/intake/simulate", { method: "POST", body: JSON.stringify(body) });
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Intake failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1.1fr 0.9fr" }}>
      <form className="card stack" onSubmit={onSubmit}>
        <h1 className="page-title">Intake simulator</h1>
        <p className="muted">Runs the same pipeline as the public webhook. Sandbox destinations only.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => setValues(PRESETS.new)}>
            New contact
          </button>
          <button type="button" className="btn" onClick={() => setValues(PRESETS.maya)}>
            Maya Chen (duplicate)
          </button>
        </div>
        {["first_name", "last_name", "email", "phone", "company", "country", "service", "budget", "source"].map((field) => (
          <div className="field" key={field}>
            <label htmlFor={field}>{field.replace("_", " ")}</label>
            <input id={field} value={values[field] ?? ""} onChange={(e) => set(field, e.target.value)} />
            {errors[field] ? (
              <span className="muted" role="alert">
                {errors[field]}
              </span>
            ) : null}
          </div>
        ))}
        <label className="row">
          <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
          Simulate provider failure
        </label>
        {error ? (
          <div role="alert" className="notice">
            {error}
          </div>
        ) : null}
        <button className="btn primary" disabled={pending} type="submit">
          {pending ? "Processing…" : "Submit lead"}
        </button>
      </form>
      <div className="card">
        <h3>Processing timeline</h3>
        {!result ? <p className="muted">Submit a lead to see validation, routing, and delivery.</p> : null}
        {result ? (
          <>
            <p>
              {result.lead_id} · {result.duplicate ? "Duplicate" : result.status} · {result.assigned_destination} ·{" "}
              {result.delivery_status}
            </p>
            <ul className="timeline">
              {result.steps.map((step) => (
                <li key={step.id}>
                  <strong>{step.label}</strong>
                  <div className="muted">{step.detail}</div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
