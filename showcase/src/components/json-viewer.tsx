import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JsonViewer({ value, label = "JSON" }: { value: unknown; label?: string }) {
  const text = JSON.stringify(value ?? {}, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-md border border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-sidebar-muted">{label}</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-sidebar-fg hover:bg-white/10"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-[12px] leading-5 text-sidebar-fg">{text}</pre>
    </div>
  );
}
