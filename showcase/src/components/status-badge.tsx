import { Badge } from "@/components/ui/badge";

const deliveryTone: Record<string, string> = {
  queued: "neutral",
  processing: "blue",
  delivered: "green",
  failed: "red",
  retry_scheduled: "amber",
  dead_letter: "red",
};

const leadTone: Record<string, string> = {
  accepted: "blue",
  qualified: "green",
  duplicate: "amber",
};

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

export function DeliveryBadge({ status }: { status: string }) {
  return <Badge tone={deliveryTone[status] ?? "neutral"}>{labelize(status)}</Badge>;
}

export function LeadBadge({ status }: { status: string }) {
  return <Badge tone={leadTone[status] ?? "neutral"}>{labelize(status)}</Badge>;
}

export function DuplicateBadge() {
  return <Badge tone="amber">Duplicate</Badge>;
}

export function SandboxBadge() {
  return <Badge tone="navy">Sandbox</Badge>;
}
