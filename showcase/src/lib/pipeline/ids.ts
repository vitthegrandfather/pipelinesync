export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export function requestId(): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : Math.random().toString(36).slice(2, 12);
  return `req_${uuid}`;
}

export function formatPublicId(kind: "lead" | "delivery" | "rule", n: number, year = 2026): string {
  if (kind === "lead") return `LD-${year}-${String(n).padStart(6, "0")}`;
  if (kind === "delivery") return `DLV-${year}-${String(n).padStart(6, "0")}`;
  return `RULE-${String(n).padStart(3, "0")}`;
}

export function publicIdNumber(publicId: string): number {
  const match = publicId.match(/(\d+)$/);
  return match ? Number(match[1]) : 1;
}

export function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    return crypto.subtle.digest("SHA-256", encoded).then((buf) => {
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    });
  }
  // Fallback used only in limited test environments.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return Promise.resolve(hash.toString(16).padStart(16, "0"));
}
