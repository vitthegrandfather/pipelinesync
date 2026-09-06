import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "bg-surface-muted text-muted border-border",
  blue: "bg-info-muted text-primary border-primary/20",
  green: "bg-success-muted text-success border-success/20",
  amber: "bg-warning-muted text-warning border-warning/25",
  red: "bg-danger-muted text-danger border-danger/20",
  navy: "bg-sidebar text-sidebar-fg border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tones[tone] ?? tones.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}
