import {
  FIELD_LIMITS,
  SUPPORTED_COUNTRIES,
  type JsonMap,
  type LeadIntakeInput,
  type NormalizedLead,
} from "./types.ts";

export class IntakeValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "IntakeValidationError";
    this.code = code;
  }
}

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const CALLING_CODES: Record<string, string> = {
  US: "1",
  CA: "1",
  GB: "44",
  DE: "49",
  FR: "33",
  AU: "61",
  NL: "31",
  IE: "353",
  ES: "34",
  IT: "39",
  SE: "46",
  NO: "47",
  DK: "45",
  PL: "48",
  UA: "380",
  IN: "91",
  SG: "65",
  AE: "971",
  JP: "81",
  PT: "351",
  CH: "41",
  AT: "43",
  BE: "32",
  FI: "358",
  CZ: "420",
  RO: "40",
  ZA: "27",
  NZ: "64",
  MX: "52",
};

const PREFIX_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(CALLING_CODES)
    .filter(([cc]) => cc !== "CA")
    .map(([cc, code]) => [code, cc]),
);

function blankToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = blankToNull(raw);
  if (!value) return null;
  return value.toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= FIELD_LIMITS.email;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function toE164(phone: string, country: string | null): string {
  const trimmed = phone.trim();
  let digits = digitsOnly(trimmed);
  if (trimmed.startsWith("00")) digits = digitsOnly(trimmed.slice(2));

  if (trimmed.startsWith("+")) {
    const e164 = `+${digits}`;
    if (digits.length < 8 || digits.length > 15) {
      throw new IntakeValidationError("invalid_phone", "Phone number is not a valid E.164 number.");
    }
    return e164;
  }

  if (country && CALLING_CODES[country]) {
    const code = CALLING_CODES[country];
    if (digits.startsWith(code)) {
      return `+${digits}`;
    }
    // Drop a single leading 0 used as a trunk prefix.
    const national = digits.startsWith("0") ? digits.slice(1) : digits;
    const e164 = `+${code}${national}`;
    const d = digitsOnly(e164);
    if (d.length < 8 || d.length > 15) {
      throw new IntakeValidationError("invalid_phone", "Phone number is not a valid E.164 number.");
    }
    return e164;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  throw new IntakeValidationError(
    "invalid_phone",
    "Phone number could not be converted to E.164. Provide a country or an international number.",
  );
}

export function inferCountryFromE164(e164: string): string | null {
  const digits = digitsOnly(e164);
  const prefixes = Object.keys(PREFIX_TO_COUNTRY).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (digits.startsWith(prefix)) return PREFIX_TO_COUNTRY[prefix] ?? null;
  }
  return null;
}

export function payloadHash(payload: unknown): string {
  const json = JSON.stringify(sortKeys(payload));
  return fnv1a(json);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortKeys(obj[key]);
    return out;
  }
  return value;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeLead(input: LeadIntakeInput): NormalizedLead {
  const first_name = clip(blankToNull(input.first_name), FIELD_LIMITS.first_name);
  const last_name = clip(blankToNull(input.last_name), FIELD_LIMITS.last_name);
  const emailRaw = normalizeEmail(input.email);
  if (emailRaw && !isValidEmail(emailRaw)) {
    throw new IntakeValidationError("invalid_email", "Email address is not valid.");
  }
  const email = clip(emailRaw, FIELD_LIMITS.email);

  let country = blankToNull(input.country);
  if (country) {
    country = country.toUpperCase();
    if (country.length !== 2 || !(SUPPORTED_COUNTRIES as readonly string[]).includes(country)) {
      throw new IntakeValidationError(
        "unsupported_country",
        `Country code "${country}" is not supported.`,
      );
    }
  }

  const phoneRaw = blankToNull(input.phone);
  let phone: string | null = null;
  let normalized_phone: string | null = null;
  if (phoneRaw) {
    if (phoneRaw.length > FIELD_LIMITS.phone) {
      throw new IntakeValidationError("invalid_phone", "Phone number is too long.");
    }
    normalized_phone = toE164(phoneRaw, country);
    phone = normalized_phone;
  }

  if (!email && !normalized_phone) {
    throw new IntakeValidationError(
      "missing_contact",
      "A lead must include a valid email or phone number.",
    );
  }

  const currency = clip(blankToNull(input.currency)?.toUpperCase() ?? null, FIELD_LIMITS.currency);
  let budget: number | null = null;
  if (input.budget !== null && input.budget !== undefined && String(input.budget).trim() !== "") {
    const n = typeof input.budget === "number" ? input.budget : Number(input.budget);
    if (!Number.isFinite(n) || n < 0) {
      throw new IntakeValidationError("invalid_budget", "Budget must be a non-negative number.");
    }
    budget = Math.round(n * 100) / 100;
  }

  const metadata: JsonMap | null =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as JsonMap)
      : null;

  return {
    first_name,
    last_name,
    email,
    normalized_email: email,
    phone,
    normalized_phone,
    company: clip(blankToNull(input.company), FIELD_LIMITS.company),
    job_title: clip(blankToNull(input.job_title), FIELD_LIMITS.job_title),
    country: country ?? (normalized_phone ? inferCountryFromE164(normalized_phone) : null),
    service: clip(blankToNull(input.service), FIELD_LIMITS.service),
    budget,
    currency: currency ?? (budget !== null ? "USD" : null),
    message: clip(blankToNull(input.message), FIELD_LIMITS.message),
    source: clip(blankToNull(input.source), FIELD_LIMITS.source),
    utm_source: clip(blankToNull(input.utm_source), FIELD_LIMITS.utm),
    utm_medium: clip(blankToNull(input.utm_medium), FIELD_LIMITS.utm),
    utm_campaign: clip(blankToNull(input.utm_campaign), FIELD_LIMITS.utm),
    external_id: clip(blankToNull(input.external_id), FIELD_LIMITS.external_id),
    metadata,
  };
}
