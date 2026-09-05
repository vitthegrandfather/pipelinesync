import { describe, expect, it } from "vitest";
import { validateIntake } from "../api/client";
import { filterLeads } from "../pages/lead-filters";

describe("intake form validation", () => {
  it("requires email or phone", () => {
    const errors = validateIntake({ email: "", phone: "", budget: "10" });
    expect(errors.email).toMatch(/email or phone/i);
  });

  it("rejects invalid email", () => {
    const errors = validateIntake({ email: "not-an-email", phone: "", budget: "10" });
    expect(errors.email).toMatch(/valid email/i);
  });

  it("rejects negative budget", () => {
    const errors = validateIntake({ email: "a@example.com", phone: "", budget: "-1" });
    expect(errors.budget).toMatch(/zero or greater/i);
  });
});

describe("lead filters", () => {
  const rows = [
    {
      public_id: "LD-2026-001001",
      first_name: "Maya",
      last_name: "Chen",
      company: "Northstar Studio",
      service: "CRM integration",
      source: "website",
      destination: "HubSpot Sandbox",
      status: "qualified",
      delivery_status: "delivered",
      duplicate: false,
      created_at: "2026-01-01",
    },
    {
      public_id: "LD-2026-001002",
      first_name: "Oliver",
      last_name: "Grant",
      company: "Thames Digital",
      service: "Website forms",
      source: "partner",
      destination: "Pipedrive Sandbox",
      status: "accepted",
      delivery_status: "delivered",
      duplicate: false,
      created_at: "2026-01-02",
    },
  ];

  it("filters by query and status", () => {
    expect(filterLeads(rows, "maya", "").map((r) => r.public_id)).toEqual(["LD-2026-001001"]);
    expect(filterLeads(rows, "", "accepted").map((r) => r.public_id)).toEqual(["LD-2026-001002"]);
  });
});
