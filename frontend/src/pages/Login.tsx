import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, login } from "../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@pipelinesync.demo");
  const [password, setPassword] = useState("demo12345");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login">
      <form className="card stack" onSubmit={onSubmit}>
        <h1 className="page-title">PipelineSync</h1>
        <p className="muted">Local demo administrator. Contacts and companies are fictional.</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error ? <div role="alert" className="notice">{error}</div> : null}
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
