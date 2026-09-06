import { createFileRoute } from "@tanstack/react-router";
import { ingestLead } from "@/lib/pipeline/intake";
import { IntakeValidationError } from "@/lib/pipeline/normalize";
import { requestId, sha256Hex } from "@/lib/pipeline/ids";
import { getSql } from "@/lib/db";

const WINDOW_MS = 60_000;
const LIMIT = 60;
const hits = new Map<string, { n: number; reset: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (cur.n >= LIMIT) return false;
  cur.n += 1;
  return true;
}

function errorBody(code: string, message: string, reqId: string) {
  return { error: { code, message, request_id: reqId } };
}

export const Route = createFileRoute("/api/v1/intake/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reqId = request.headers.get("x-request-id") || requestId();
        const headers = { "x-request-id": reqId };
        try {
          const apiKey = request.headers.get("x-api-key");
          if (!apiKey) {
            return Response.json(errorBody("unauthorized", "Missing API key.", reqId), { status: 401, headers });
          }
          if (!rateLimit(apiKey)) {
            return Response.json(errorBody("rate_limited", "Too many intake requests.", reqId), { status: 429, headers });
          }
          const sql = await getSql();
          const hash = await sha256Hex(apiKey);
          const keyRow = await sql.query<{ user_id: string; id: string; active: boolean }>(
            `select user_id, id, active from api_keys where key_hash = $1`,
            [hash],
          );
          if (!keyRow[0] || !keyRow[0].active) {
            return Response.json(errorBody("unauthorized", "Invalid API key.", reqId), { status: 401, headers });
          }
          await sql.query(`update api_keys set last_used_at = now() where id = $1`, [keyRow[0].id]);
          const idempotency = request.headers.get("idempotency-key");
          if (!idempotency) {
            return Response.json(errorBody("missing_idempotency_key", "Idempotency-Key header is required.", reqId), {
              status: 422,
              headers,
            });
          }
          const payload = (await request.json()) as Record<string, unknown>;
          const result = await ingestLead(sql, keyRow[0].user_id, payload, {
            idempotencyKey: idempotency,
            processNow: true,
            actor: { type: "api", id: keyRow[0].id },
          });
          const status = result.replayed ? 200 : 201;
          return Response.json(
            {
              lead_id: result.lead_id,
              status: result.status === "duplicate" ? "accepted" : "accepted",
              duplicate: result.duplicate,
              assigned_destination: result.assigned_destination,
              delivery_status: result.delivery_status,
            },
            { status, headers },
          );
        } catch (err) {
          if (err instanceof IntakeValidationError) {
            const status = (err as IntakeValidationError & { httpStatus?: number }).httpStatus ?? 422;
            return Response.json(errorBody(err.code, err.message, reqId), { status, headers });
          }
          const message = err instanceof Error ? err.message : "Unexpected error";
          return Response.json(errorBody("internal_error", message, reqId), { status: 500, headers });
        }
      },
    },
  },
});
