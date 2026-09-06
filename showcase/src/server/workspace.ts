import { getSql } from "@/lib/db";
import { ensureWorkspace } from "@/lib/pipeline/seed";

export async function withWorkspace(userId: string) {
  const sql = await getSql();
  await ensureWorkspace(sql, userId);
  return sql;
}

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}
