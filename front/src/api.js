const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("session"));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem("session", JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem("session");
}

function formatError(data) {
  const detail = data?.detail;
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => `${e.loc?.at(-1)}: ${e.msg}`).join(", ");
  return JSON.stringify(detail);
}

export async function api(path, { method = "GET", body } = {}) {
  const session = getSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && session) {
    clearSession();
    window.location.href = "/login";
    return;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatError(data) || `Request failed (${res.status})`);
  return data;
}

export function timeAgo(seconds) {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}
