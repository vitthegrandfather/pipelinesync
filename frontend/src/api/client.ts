const API = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function token(): string | null {
  return localStorage.getItem("ps_token");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new ApiError(data?.error?.code || "error", data?.error?.message || response.statusText, response.status);
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await api<{ access_token: string; user: { email: string; name: string } }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("ps_token", data.access_token);
  return data;
}

export function logout() {
  localStorage.removeItem("ps_token");
}

export const intakeSchemaFields = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  country: "US",
  service: "CRM integration",
  budget: "2500",
  source: "website",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  message: "",
};

export function validateIntake(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.email && !values.phone) errors.email = "Email or phone is required.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Enter a valid email.";
  if (values.budget && Number(values.budget) < 0) errors.budget = "Budget must be zero or greater.";
  return errors;
}
