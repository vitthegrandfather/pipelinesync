import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeCsvCell, toCsv } from "./csv.ts";
import { IntakeValidationError, normalizeLead, payloadHash, toE164 } from "./normalize.ts";
import { evaluateOperator, routeLead } from "./routing.ts";

test("lowercases email and trims fields", () => {
  const lead = normalizeLead({
    first_name: "  Maya  ",
    email: "Maya.Chen@Example.com",
    phone: "+44 20 7946 0958",
    country: "gb",
    company: "Northstar Studio",
  });
  assert.equal(lead.email, "maya.chen@example.com");
  assert.equal(lead.first_name, "Maya");
  assert.equal(lead.country, "GB");
});

test("rejects invalid email", () => {
  assert.throws(
    () => normalizeLead({ email: "not-an-email", country: "US" }),
    (err: unknown) => err instanceof IntakeValidationError && err.code === "invalid_email",
  );
});

test("converts national UK numbers to E.164", () => {
  assert.equal(toE164("020 7946 0958", "GB"), "+442079460958");
});

test("rejects unsupported country codes", () => {
  assert.throws(
    () => normalizeLead({ email: "a@example.com", country: "ZZ" }),
    (err: unknown) => err instanceof IntakeValidationError && err.code === "unsupported_country",
  );
});

test("blank strings become null", () => {
  const lead = normalizeLead({ email: "a@example.com", company: "   ", country: "US" });
  assert.equal(lead.company, null);
});

test("payload hash is stable regardless of key order", () => {
  assert.equal(payloadHash({ a: 1, b: 2 }), payloadHash({ b: 2, a: 1 }));
});

test("routing prefers higher-priority budget rule", () => {
  const fallback = { id: "def", name: "Default CRM Sandbox", provider: "webhook" };
  const rules = [
    {
      id: "1",
      public_id: "RULE-011",
      name: "Enterprise",
      priority: 10,
      enabled: true,
      field: "budget",
      operator: "greater_than",
      comparison_value: "4999.99",
      integration_id: "hs",
      integration_name: "HubSpot Sandbox",
      provider: "hubspot",
      stop_processing: true,
    },
    {
      id: "2",
      public_id: "RULE-012",
      name: "UK",
      priority: 20,
      enabled: true,
      field: "country",
      operator: "equals",
      comparison_value: "GB",
      integration_id: "pd",
      integration_name: "Pipedrive Sandbox",
      provider: "pipedrive",
      stop_processing: true,
    },
  ];
  const lead = normalizeLead({
    email: "maya.chen@example.com",
    country: "GB",
    budget: 8500,
    service: "CRM integration",
  });
  const result = routeLead(lead, rules, fallback);
  assert.equal(result.integration_name, "HubSpot Sandbox");
});

test("disabled rules are skipped and default routing applies", () => {
  const fallback = { id: "def", name: "Default CRM Sandbox", provider: "webhook" };
  const rules = [
    {
      id: "1",
      public_id: "RULE-011",
      name: "UK",
      priority: 10,
      enabled: false,
      field: "country",
      operator: "equals",
      comparison_value: "GB",
      integration_id: "pd",
      integration_name: "Pipedrive Sandbox",
      provider: "pipedrive",
      stop_processing: true,
    },
  ];
  const lead = normalizeLead({ email: "oliver.grant@example.com", country: "GB", budget: 1000 });
  const result = routeLead(lead, rules, fallback);
  assert.equal(result.integration_name, "Default CRM Sandbox");
  assert.equal(result.evaluation_log[0]?.skipped, true);
});

test("contains operator matches automation service", () => {
  assert.equal(evaluateOperator("Business automation", "contains", "automation"), true);
  assert.equal(evaluateOperator("CRM integration", "contains", "automation"), false);
});

test("csv formula injection is neutralized", () => {
  assert.equal(sanitizeCsvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(sanitizeCsvCell("+cmd"), "'+cmd");
  assert.equal(sanitizeCsvCell("-2+3"), "'-2+3");
  assert.equal(sanitizeCsvCell("@SUM(1)"), "'@SUM(1)");
  const csv = toCsv(["name"], [["=1+1"]]);
  assert.match(csv, /^name\n'=1\+1\n$/);
});
