# PipelineSync demo

Demo environment. All contacts and companies are fictional. CRM connectors run in sandbox mode.

## Sign in

- Email: `admin@pipelinesync.demo`
- Password: `demo12345`

The workspace seeds 22 fictional leads, four sandbox integrations, and four routing rules.

## Walkthrough

1. Open **Overview**. Confirm lead volume, duplicate rate, and failed deliveries.
2. Open **Intake simulator**.
   - **New contact** → Submit lead. Watch the processing timeline.
   - **Maya Chen (duplicate)** → Submit. Duplicate is stored, not deleted.
   - Check **Simulate provider failure**, submit, then open **Deliveries** and **Retry delivery**.
3. Open a lead. Inspect attribution, routing log, sandbox CRM ids, attempts, and the raw payload.
4. Open **Routing rules**. Simulate a UK lead (Pipedrive Sandbox) versus an enterprise budget (HubSpot Sandbox).
5. Open **Integrations**. Every card is labelled Sandbox. **Test connection** never calls a live CRM.
6. Export CSV from **Leads**.
7. **Settings → Reset demo data** restores the original seed.

## Screenshot plan

| Shot | What to capture |
| --- | --- |
| Dashboard | Metrics, 14-day volume, recent failures |
| Intake | Completed simulator with timeline |
| Lead details | Contact, UTM, routing, CRM result |
| Failed delivery | Attempt history and Retry |
| Routing | Ordered rules and simulator result |
