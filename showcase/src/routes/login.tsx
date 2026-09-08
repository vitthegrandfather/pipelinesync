import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted">
        Loading session…
      </main>
    );
  }
  if (user) return <Navigate to="/dashboard" />;

  async function enterDemo() {
    setError(null);
    setBusy(true);
    try {
      const credentials = {
        email: "admin@pipelinesync.demo",
        password: "demo12345",
      };
      let result = await authClient.signIn.email(credentials);

      if (result.error) {
        const signUp = await authClient.signUp.email({
          ...credentials,
          name: "Demo Operator",
        });
        if (signUp.error) {
          result = await authClient.signIn.email(credentials);
          if (result.error) throw new Error(result.error.message);
        }
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo workspace is temporarily unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="text-[11px] font-medium tracking-wide text-primary uppercase">PipelineSync</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Operations console</h1>
        <p className="mt-1 text-sm text-muted">
          Sandbox environment. All contacts and companies are fictional.
        </p>

        <div className="mt-6 rounded-md border border-border bg-background p-4">
          <p className="text-sm font-medium">Portfolio demo</p>
          <p className="mt-1 text-sm leading-5 text-muted">
            Open a shared sandbox with fictional leads, routing rules, and delivery history.
          </p>
        </div>

        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        <Button
          type="button"
          className="mt-4 w-full"
          disabled={busy || !authEnabled}
          onClick={enterDemo}
        >
          {busy ? "Opening workspace…" : "Enter demo workspace"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted">
          No account or personal information required.
        </p>
      </div>
    </main>
  );
}
