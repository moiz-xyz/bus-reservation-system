import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, saveSession } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // The server finds the account and tells us whether it's a passenger, driver or admin.
      const session = await api("/auth/login", { method: "POST", body: { email, password } });
      saveSession(session);
      navigate(`/${session.role}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>🚌 Bus Tracker</h1>
        <p className="muted">Passengers, bus drivers and admins all sign in here. You'll go to your own dashboard automatically.</p>
        <label>Email or username
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        <div className="divider"><span>or</span></div>
        <Link className="btn secondary center" to="/register">➕ Create new account</Link>
      </form>
    </div>
  );
}
