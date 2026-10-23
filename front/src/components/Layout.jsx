import { useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../api";

const ROLES = {
  user: { icon: "🧍", label: "Passenger" },
  driver: { icon: "🚌", label: "Bus Driver" },
  admin: { icon: "👨‍💼", label: "Admin" },
};

/** `tags` are extra badges under the name, e.g. the driver's bus number. */
export default function Layout({ title, tags = [], children }) {
  const navigate = useNavigate();
  const session = getSession();
  const role = ROLES[session?.role] || ROLES.user;

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🚌 Bus Tracker <span className="muted">· {title}</span></div>
        <div className="row">
          <span className="muted">{session?.name}</span>
          <button className="btn secondary" onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="content">
        <div className="welcome">
          <div className="avatar">{role.icon}</div>
          <div>
            <h1>Welcome, {session?.name}</h1>
            <div className="tags">
              <span className="tag">{role.label}</span>
              {tags.filter(Boolean).map((t) => <span className="tag" key={t}>{t}</span>)}
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
