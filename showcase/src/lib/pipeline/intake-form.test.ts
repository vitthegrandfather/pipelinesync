import assert from "node:assert/strict";
import { test } from "node:test";
import { intakeSchema, leadFilterSchema } from "../../server/schemas.ts";
import { IntakeValidationError, normalizeLead } from "./normalize.ts";

test("intake form schema accepts a complete fictional payload", () => {
  const parsed = intakeSchema.parse({
    first_name: "Maya",
    last_name: "Chen",
    email: "maya.chen@example.com",
    phone: "+44 20 7946 0958",
    company: "Northstar Studio",
    country: "GB",
    service: "CRM integration",
    budget: 8500,
    simulate_failure: false,
  });
  assert.equal(parsed.email, "maya.chen@example.com");
});

test("intake form validation rejects empty objects without contact details", () => {
  const parsed = intakeSchema.parse({});
  assert.throws(() => normalizeLead(parsed), IntakeValidationError);
});

test("lead filters default to first page", () => {
  const parsed = leadFilterSchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.duplicate, "all");
});

test("invalid duplicate filter is rejected", () => {
  assert.throws(() => leadFilterSchema.parse({ duplicate: "maybe" }));
});
