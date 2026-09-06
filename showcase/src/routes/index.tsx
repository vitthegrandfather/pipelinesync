import { createFileRoute, Navigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
          <p className="text-[11px] font-medium tracking-wide text-primary uppercase">PipelineSync</p>
          <h1 className="mt-1 text-xl font-semibold">Operations console</h1>
          <p className="mt-2 text-sm text-muted">Loading the sandbox workspace. All contacts and companies are fictional.</p>
        </div>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Navigate to="/dashboard" />;
}
