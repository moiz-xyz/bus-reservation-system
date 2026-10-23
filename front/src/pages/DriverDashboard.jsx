import { useEffect, useRef, useState } from "react";
import { api, timeAgo } from "../api";
import { usePolling } from "../hooks";
import Layout from "../components/Layout.jsx";
import MapView from "../components/MapView.jsx";

const SEND_EVERY_MS = 5000;

/** Points between consecutive stops, used to fake a drive for testing. */
function buildPath(stops, stepsBetween = 8) {
  const path = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    for (let s = 0; s < stepsBetween; s++) {
      const t = s / stepsBetween;
      path.push([a.latitude + (b.latitude - a.latitude) * t, a.longitude + (b.longitude - a.longitude) * t]);
    }
  }
  const last = stops.at(-1);
  if (last) path.push([last.latitude, last.longitude]);
  return path;
}

/** Lets a driver register the bus they drive, or edit it later. */
function BusForm({ me, onSaved, onCancel }) {
  const editing = Boolean(me.bus);
  const [form, setForm] = useState({
    bus_number: me.bus?.bus_number ?? "",
    plate_number: me.bus?.plate_number ?? "",
    model: me.bus?.model ?? "",
    capacity: me.bus?.capacity ?? 40,
    route_id: me.route?.id ?? "",
  });
  const [routes, setRoutes] = useState([]);
  const [newRoute, setNewRoute] = useState({ name: "", start_point: "", end_point: "", stops: [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // True once the bus is saved, so a retry after a failed route step edits it instead of re-registering.
  const busSaved = useRef(editing);
  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setRouteField = (key) => (e) => setNewRoute({ ...newRoute, [key]: e.target.value });
  const creatingRoute = form.route_id === "new";

  const addStop = ({ lat, lng }) =>
    setNewRoute((r) => ({
      ...r,
      stops: [...r.stops, { name: `Stop ${r.stops.length + 1}`, latitude: +lat.toFixed(6), longitude: +lng.toFixed(6) }],
    }));
  const renameStop = (i, name) =>
    setNewRoute((r) => ({ ...r, stops: r.stops.map((st, idx) => (idx === i ? { ...st, name } : st)) }));
  const removeStop = (i) => setNewRoute((r) => ({ ...r, stops: r.stops.filter((_, idx) => idx !== i) }));

  useEffect(() => {
    api("/driver/available-routes").then(setRoutes).catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (creatingRoute && newRoute.stops.length < 2) {
      setError("Click on the map to add at least 2 stops for your route.");
      return;
    }
    setSaving(true);
    try {
      const routeId = form.route_id && !creatingRoute ? Number(form.route_id) : null;
      let updated = await api("/driver/bus", {
        method: busSaved.current ? "PUT" : "POST",
        body: { ...form, capacity: Number(form.capacity), route_id: routeId },
      });
      busSaved.current = true;
      if (creatingRoute) {
        updated = await api("/driver/route", { method: "POST", body: newRoute });
      }
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card register-bus" onSubmit={save}>
      <h2>{editing ? "✏️ Edit my bus" : "🚌 Register your bus"}</h2>
      {!editing && <p className="muted">Fill in the details of the bus you drive. Passengers on your route will see these details.</p>}
      <div className="grid two">
        <label>Bus number<input value={form.bus_number} onChange={setField("bus_number")} placeholder="e.g. B-103" required /></label>
        <label>Plate number<input value={form.plate_number} onChange={setField("plate_number")} placeholder="e.g. KHI-4321" required /></label>
        <label>Bus model<input value={form.model} onChange={setField("model")} placeholder="e.g. Hino 2023" /></label>
        <label>Number of seats<input type="number" min="1" max="200" value={form.capacity} onChange={setField("capacity")} required /></label>
      </div>
      <label>Route I drive
        <select value={form.route_id} onChange={setField("route_id")}>
          <option value="">— no route yet (admin can allocate one) —</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.start_point} → {r.end_point})</option>)}
          <option value="new">➕ Create a new route…</option>
        </select>
      </label>
      {routes.length === 0 && !creatingRoute && (
        <p className="muted small">All existing routes already have a bus. Choose "➕ Create a new route…" to make your own.</p>
      )}

      {creatingRoute && (
        <div className="new-route">
          <h3>New route</h3>
          <label>Route name<input value={newRoute.name} onChange={setRouteField("name")} placeholder="e.g. Route 3 - Malir to Saddar" required /></label>
          <div className="row">
            <label className="grow">Start point<input value={newRoute.start_point} onChange={setRouteField("start_point")} required /></label>
            <label className="grow">End point<input value={newRoute.end_point} onChange={setRouteField("end_point")} required /></label>
          </div>
          <p className="muted small">👇 Click on the map to add your stops in order (at least 2).</p>
          <MapView routes={[{ id: "new", name: newRoute.name || "New route", stops: newRoute.stops }]} onMapClick={addStop} height={320} />
          {newRoute.stops.map((st, i) => (
            <div className="row stop-row" key={i}>
              <span className="muted">{i + 1}.</span>
              <input className="grow" value={st.name} onChange={(e) => renameStop(i, e.target.value)} required />
              <button type="button" className="btn small danger" onClick={() => removeStop(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Register bus"}</button>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

/** Everyone booked on the driver's bus, with their ticket numbers. */
function PassengerList({ passengers, hasRoute }) {
  const tickets = passengers.filter((p) => p.current_ticket);
  const total = tickets.reduce((sum, p) => sum + p.current_ticket.price, 0);

  return (
    <div className="card passenger-list">
      <div className="row spread wrap">
        <h2>🎫 Passengers & tickets ({passengers.length})</h2>
        {tickets.length > 0 && (
          <span className="muted">{tickets.length} ticket{tickets.length === 1 ? "" : "s"} · <b className="live">Rs {total.toLocaleString()}</b></span>
        )}
      </div>
      {!hasRoute ? (
        <p className="muted">Choose your route with ✏️ Edit my bus. Passengers who book it will appear here.</p>
      ) : passengers.length === 0 ? (
        <p className="muted">No passengers have booked your route yet. This list updates by itself.</p>
      ) : (
        <table>
          <thead><tr><th>#</th><th>Ticket number</th><th>Passenger</th><th>Pickup stop</th><th>Price</th><th>Booked</th></tr></thead>
          <tbody>
            {passengers.map((p, i) => {
              const t = p.current_ticket;
              return (
                <tr key={t?.ticket_number ?? `no-ticket-${i}`}>
                  <td>{i + 1}</td>
                  <td>{t ? <span className="ticket-badge">{t.ticket_number}</span> : <span className="warn small">No ticket</span>}</td>
                  <td><b>{p.name}</b></td>
                  <td>{p.stop?.name || <span className="muted">not chosen</span>}</td>
                  <td>{t ? `Rs ${t.price}` : "—"}</td>
                  <td className="muted small">{t ? new Date(t.created_at + "Z").toLocaleString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function DriverDashboard() {
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState("off"); // off | gps | simulate
  const [message, setMessage] = useState("");
  const [editingBus, setEditingBus] = useState(false);
  const watchId = useRef(null);
  const simTimer = useRef(null);
  const lastSent = useRef(0);

  // Refresh regularly so new bookings show up in the passenger count.
  usePolling(() => api("/driver/me").then(setMe).catch((e) => setMessage(e.message)), 15000);
  useEffect(() => stopSharing, []);

  async function sendLocation(latitude, longitude) {
    try {
      const updated = await api("/driver/location", { method: "POST", body: { latitude, longitude } });
      setMe((prev) => ({ ...prev, ...updated }));
      setMessage("");
    } catch (e) {
      setMessage(e.message);
    }
  }

  function stopSharing() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (simTimer.current) clearInterval(simTimer.current);
    watchId.current = null;
    simTimer.current = null;
    setMode("off");
  }

  function startGps() {
    if (!navigator.geolocation) return setMessage("This browser does not support GPS location.");
    stopSharing();
    setMode("gps");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        sendLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => { setMessage(`GPS error: ${err.message}`); stopSharing(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  function startSimulation() {
    const stops = me?.route?.stops || [];
    if (stops.length < 2) return setMessage("Your route needs at least 2 stops to simulate.");
    stopSharing();
    setMode("simulate");
    const path = buildPath(stops);
    let i = 0;
    const tick = () => { sendLocation(...path[i]); i = (i + 1) % path.length; };
    tick();
    simTimer.current = setInterval(tick, 3000);
  }

  async function goOffDuty() {
    stopSharing();
    const updated = await api("/driver/duty", { method: "PUT", body: { on_duty: false } });
    setMe((prev) => ({ ...prev, ...updated }));
  }

  if (!me) return <Layout title="Driver"><div className="card">{message || "Loading…"}</div></Layout>;

  const { bus, route, passengers } = me;
  const countAtStop = (stopId) => passengers.filter((p) => p.stop?.id === stopId).length;
  const mapRoutes = route ? [{ ...route, bus: { ...bus, driver: me } }] : [];

  if (!bus) {
    return (
      <Layout title="Driver" tags={["No bus registered yet"]}>
        <BusForm me={me} onSaved={setMe} />
      </Layout>
    );
  }

  return (
    <Layout title="Driver" tags={[`Bus ${bus.bus_number}`, route?.name]}>
      {editingBus && (
        <BusForm me={me} onSaved={(updated) => { setMe(updated); setEditingBus(false); }} onCancel={() => setEditingBus(false)} />
      )}
      <div className="grid four">
        <div className="card stat">
          <span className="label">My bus</span>
          <b>{bus.bus_number}</b>
          <span className="muted">{bus.plate_number} · {bus.model || "—"} · {bus.capacity} seats</span>
          {!editingBus && <button className="link-btn" onClick={() => setEditingBus(true)}>✏️ Edit my bus</button>}
        </div>
        <div className="card stat">
          <span className="label">My route</span>
          <b>{route ? route.name : "Not allocated"}</b>
          <span className="muted">{route ? `${route.stops.length} stops` : "Pick one with ✏️ Edit my bus"}</span>
        </div>
        <div className="card stat">
          <span className="label">Passengers</span>
          <b className="big-number">{passengers.length}<span className="muted"> / {bus.capacity}</span></b>
          <span className="muted">{Math.max(bus.capacity - passengers.length, 0)} seats free</span>
        </div>
        <div className="card stat">
          <span className="label">Status</span>
          <b className={me.on_duty ? "live" : "warn"}>{me.on_duty ? "● On duty" : "Off duty"}</b>
          <span className="muted">Last location sent {timeAgo(me.location_age_seconds)}</span>
        </div>
      </div>

      <PassengerList passengers={passengers} hasRoute={Boolean(route)} />

      <div className="card">
        <h2>Share my location with passengers</h2>
        <div className="row wrap">
          <button className="btn" onClick={startGps} disabled={mode === "gps"}>
            {mode === "gps" ? "📡 Sharing GPS…" : "📡 Start sharing GPS"}
          </button>
          <button className="btn secondary" onClick={startSimulation} disabled={mode === "simulate" || !route}>
            {mode === "simulate" ? "Simulating…" : "🧪 Simulate drive (testing)"}
          </button>
          {mode !== "off" && <button className="btn secondary" onClick={stopSharing}>Pause</button>}
          <button className="btn danger" onClick={goOffDuty}>End shift (off duty)</button>
        </div>
        <p className="muted small">Keep this page open while driving. Your position is sent every few seconds.</p>
        {message && <div className="error">{message}</div>}
      </div>

      {route && (
        <div className="card">
          <h2>Route map</h2>
          <MapView routes={mapRoutes} />
          <ol className="stops">
            {route.stops.map((s) => (
              <li key={s.id}>{s.name}{countAtStop(s.id) > 0 && <b> · {countAtStop(s.id)} waiting</b>}</li>
            ))}
          </ol>
        </div>
      )}

    </Layout>
  );
}
