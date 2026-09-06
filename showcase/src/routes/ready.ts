import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/ready")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          await sql.query("select 1 as ok");
          return Response.json({ status: "ready", database: "ok" });
        } catch {
          return Response.json({ status: "not_ready", database: "error" }, { status: 503 });
        }
      },
    },
  },
});
