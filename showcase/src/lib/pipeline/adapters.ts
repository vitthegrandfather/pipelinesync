import { publicIdNumber } from "./ids.ts";
import type { CRMResult, IntegrationHealth, NormalizedLead, Provider } from "./types.ts";

export interface LeadDTO extends NormalizedLead {
  public_id: string;
  source: string | null;
}

export interface CRMAdapter {
  provider: Provider;
  createOrUpdateContact(lead: LeadDTO): Promise<CRMResult>;
  createDeal(lead: LeadDTO, contact: CRMResult): Promise<CRMResult>;
  healthCheck(): Promise<IntegrationHealth>;
}

function stamp(ms: number): number {
  return ms;
}

function hubspotPayload(lead: LeadDTO) {
  return {
    properties: {
      email: lead.normalized_email,
      firstname: lead.first_name,
      lastname: lead.last_name,
      phone: lead.normalized_phone,
      company: lead.company,
      jobtitle: lead.job_title,
      country: lead.country,
      hs_lead_status: "NEW",
    },
  };
}

function pipedrivePayload(lead: LeadDTO) {
  return {
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.company,
    email: lead.normalized_email,
    phone: lead.normalized_phone,
    org_name: lead.company,
  };
}

function zohoPayload(lead: LeadDTO) {
  return {
    data: [
      {
        Email: lead.normalized_email,
        First_Name: lead.first_name,
        Last_Name: lead.last_name,
        Phone: lead.normalized_phone,
        Company: lead.company,
        Title: lead.job_title,
        Country: lead.country,
      },
    ],
  };
}

function webhookPayload(lead: LeadDTO) {
  return {
    event: "lead.accepted",
    lead_id: lead.public_id,
    contact: {
      email: lead.normalized_email,
      phone: lead.normalized_phone,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      company: lead.company,
    },
  };
}

class SandboxAdapter implements CRMAdapter {
  constructor(
    public provider: Provider,
    private fail: boolean,
  ) {}

  async createOrUpdateContact(lead: LeadDTO): Promise<CRMResult> {
    const started = Date.now();
    const n = publicIdNumber(lead.public_id);
    if (this.fail) {
      return {
        ok: false,
        provider: this.provider,
        payload: { sandbox: true, simulated_failure: true },
        error_code: "sandbox_provider_unavailable",
        error_message: `${displayName(this.provider)} rejected the request (simulated provider failure).`,
        duration_ms: stamp(Date.now() - started + 42),
      };
    }
    const ids = contactIds(this.provider, n);
    return {
      ok: true,
      provider: this.provider,
      contact_id: ids.contact,
      payload: {
        sandbox: true,
        mode: "demo",
        mapped: mapPayload(this.provider, lead),
        contact_id: ids.contact,
      },
      duration_ms: stamp(180 + (n % 40)),
    };
  }

  async createDeal(lead: LeadDTO, contact: CRMResult): Promise<CRMResult> {
    const started = Date.now();
    const n = publicIdNumber(lead.public_id);
    if (this.fail || !contact.ok) {
      return {
        ok: false,
        provider: this.provider,
        payload: { sandbox: true },
        error_code: "sandbox_deal_failed",
        error_message: "Deal was not created because the contact upsert failed.",
        duration_ms: stamp(Date.now() - started + 18),
      };
    }
    const ids = contactIds(this.provider, n);
    return {
      ok: true,
      provider: this.provider,
      contact_id: contact.contact_id,
      deal_id: ids.deal,
      payload: {
        sandbox: true,
        deal_id: ids.deal,
        amount: lead.budget,
        currency: lead.currency,
      },
      duration_ms: stamp(120 + (n % 30)),
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return {
      status: "healthy",
      provider: this.provider,
      mode: "sandbox",
      latency_ms: 18 + (this.provider.length % 7),
      message: `${displayName(this.provider)} sandbox is reachable. No live credentials are in use.`,
      checked_at: new Date().toISOString(),
    };
  }
}

function mapPayload(provider: Provider, lead: LeadDTO) {
  switch (provider) {
    case "hubspot":
      return hubspotPayload(lead);
    case "pipedrive":
      return pipedrivePayload(lead);
    case "zoho":
      return zohoPayload(lead);
    default:
      return webhookPayload(lead);
  }
}

function contactIds(provider: Provider, n: number): { contact: string; deal: string } {
  switch (provider) {
    case "hubspot":
      return { contact: `hubspot-demo-contact-${n}`, deal: `hubspot-demo-deal-${n}` };
    case "pipedrive":
      return { contact: `pipedrive-demo-person-${n}`, deal: `pipedrive-demo-deal-${n}` };
    case "zoho":
      return { contact: `zoho-demo-lead-${n}`, deal: `zoho-demo-deal-${n}` };
    default:
      return { contact: `webhook-demo-record-${n}`, deal: `webhook-demo-event-${n}` };
  }
}

export function displayName(provider: Provider): string {
  switch (provider) {
    case "hubspot":
      return "HubSpot Sandbox";
    case "pipedrive":
      return "Pipedrive Sandbox";
    case "zoho":
      return "Zoho CRM Sandbox";
    default:
      return "Default CRM Sandbox";
  }
}

export function getAdapter(provider: Provider, fail = false): CRMAdapter {
  return new SandboxAdapter(provider, fail);
}

export { mapPayload };
