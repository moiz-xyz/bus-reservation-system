import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, saveSession } from "../api";

const ACCOUNT_TYPES = [
  { id: "user", icon: "🧍", label: "Passenger", hint: "Track the bus on my route" },
  { id: "driver", icon: "🚌", label: "Bus Driver", hint: "Share my bus location" },
];

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get("role") === "driver" ? "driver" : "user");
  const [form, setForm] = useState({ name: "", email: "", phone: "", license_number: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { license_number, ...rest } = form;
      const body = role === "driver" ? { ...rest, license_number } : rest;
      const session = await api(`/auth/${role}/register`, { method: "POST", body });
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
        <h1>Create account</h1>

        <span className="field-title">Account type</span>
        <div className="role-picker">
          {ACCOUNT_TYPES.map((t) => (
            <label key={t.id} className={role === t.id ? "role-option selected" : "role-option"}>
              <input type="radio" name="role" value={t.id} checked={role === t.id} onChange={() => setRole(t.id)} />
              <span className="role-icon">{t.icon}</span>
              <b>{t.label}</b>
              <span className="muted small">{t.hint}</span>
            </label>
          ))}
        </div>

        <label>Full name<input value={form.name} onChange={set("name")} required minLength={2} /></label>
        <label>Email<input type="email" value={form.email} onChange={set("email")} required /></label>
        <label>Phone<input value={form.phone} onChange={set("phone")} required minLength={5} /></label>
        {role === "driver" && (
          <label>Driving license number<input value={form.license_number} onChange={set("license_number")} required minLength={3} /></label>
        )}
        <label>Password<input type="password" value={form.password} onChange={set("password")} required /></label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading}>
          {loading ? "Creating…" : `Create ${role === "driver" ? "driver" : "passenger"} account`}
        </button>
        <p className="muted center">Already registered? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
