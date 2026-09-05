import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

type Settings = {
  api_keys: { id: string; name: string; masked: string; active: boolean; last_used_at: string | null; created_at: string }[];
  notice: string;
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/api/v1/settings") });
  const reset = useMutation({
    mutationFn: () => api("/api/v1/demo/reset", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <div className="notice">{data?.notice}</div>
      <div className="card">
        <h3>API keys</h3>
        <p className="muted">Hashes are stored. The raw demo key is `demo-api-key`.</p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Active</th>
              <th>Last used</th>
            </tr>
          </thead>
          <tbody>
            {(data?.api_keys ?? []).map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td className="mono">{key.masked}</td>
                <td>{key.active ? "Yes" : "No"}</td>
                <td>{key.last_used_at ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Reset demo data</h3>
        <p className="muted">Restores 22 fictional leads, sandbox integrations, and default routing rules.</p>
        <button className="btn danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
          {reset.isPending ? "Resetting…" : "Reset demo data"}
        </button>
        {reset.isSuccess ? <p className="muted">Demo workspace restored.</p> : null}
      </div>
    </div>
  );
}
