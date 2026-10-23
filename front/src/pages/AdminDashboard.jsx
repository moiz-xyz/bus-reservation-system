import { useEffect, useState } from "react";
import { api, timeAgo } from "../api";
import { usePolling } from "../hooks";
import Layout from "../components/Layout.jsx";
import MapView from "../components/MapView.jsx";

const TABS = ["Live map", "Routes", "Buses", "Drivers", "Users"];

function useList(path) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const reload = () => api(path).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [path]);
  return { items, reload, error, setError };
}

async function confirmDelete(path, label, reload, setError) {
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    await api(path, { method: "DELETE" });
    reload();
  } catch (e) {
    setError(e.message);
  }
}

// ---------------- Live map ----------------
function LiveTab() {
  const [routes, setRoutes] = useState([]);
  usePolling(() => api("/admin/live").then(setRoutes).catch(() => {}), 5000);

  return (
    <>
      <div className="card"><MapView routes={routes} height={520} /></div>
      <div className="card">
        <table>
          <thead><tr><th>Route</th><th>Bus</th><th>Driver</th><th>Status</th><th>Last update</th></tr></thead>
          <tbody>
            {routes.map((r) => {
              const d = r.bus?.driver;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.bus?.bus_number || <span className="warn">no bus</span>}</td>
                  <td>{d ? `${d.name} (${d.phone})` : <span className="warn">no driver</span>}</td>
                  <td>{d ? (d.on_duty ? <span className="live">● on duty</span> : "off duty") : "—"}</td>
                  <td>{d ? timeAgo(d.location_age_seconds) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------- Routes ----------------
const emptyRoute = { name: "", start_point: "", end_point: "", fare: 200, stops: [] };

function RoutesTab() {
  const routes = useList("/admin/routes");
  const buses = useList("/admin/buses");
  const [form, setForm] = useState(emptyRoute);
  const [editingId, setEditingId] = useState(null);

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setStop = (i, key, value) =>
    setForm({ ...form, stops: form.stops.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)) });
  const removeStop = (i) => setForm({ ...form, stops: form.stops.filter((_, idx) => idx !== i) });
  const addStopAt = ({ lat, lng }) =>
    setForm((f) => ({
      ...f,
      stops: [...f.stops, { name: `Stop ${f.stops.length + 1}`, latitude: +lat.toFixed(6), longitude: +lng.toFixed(6) }],
    }));

  function edit(route) {
    setEditingId(route.id);
    setForm({
      name: route.name,
      start_point: route.start_point,
      end_point: route.end_point,
      fare: route.fare,
      stops: route.stops.map(({ name, latitude, longitude }) => ({ name, latitude, longitude })),
    });
  }

  function reset() {
    setEditingId(null);
    setForm(emptyRoute);
  }

  async function save(e) {
    e.preventDefault();
    const body = {
      ...form,
      fare: Number(form.fare),
      stops: form.stops.map((s) => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) })),
    };
    try {
      await api(editingId ? `/admin/routes/${editingId}` : "/admin/routes", { method: editingId ? "PUT" : "POST", body });
      reset();
      routes.reload();
      routes.setError("");
    } catch (err) {
      routes.setError(err.message);
    }
  }

  async function allocate(routeId, busId) {
    try {
      await api(`/admin/routes/${routeId}/bus`, { method: "PUT", body: { bus_id: busId ? Number(busId) : null } });
      routes.reload();
      buses.reload();
    } catch (err) {
      routes.setError(err.message);
    }
  }

  const draft = { id: "draft", name: form.name || "New route", stops: form.stops.map((s) => ({ ...s, latitude: Number(s.latitude), longitude: Number(s.longitude) })) };

  return (
    <>
      <div className="card">
        <h2>Routes & bus allocation</h2>
        {routes.error && <div className="error">{routes.error}</div>}
        <table>
          <thead><tr><th>Name</th><th>From → To</th><th>Stops</th><th>Ticket price</th><th>Allocated bus (driver)</th><th></th></tr></thead>
          <tbody>
            {routes.items.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.start_point} → {r.end_point}</td>
                <td>{r.stops.length}</td>
                <td><b>Rs {r.fare}</b></td>
                <td>
                  <select value={r.bus?.id ?? ""} onChange={(e) => allocate(r.id, e.target.value)}>
                    <option value="">— none —</option>
                    {buses.items.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bus_number} ({b.driver ? b.driver.name : "no driver"}){b.route && b.route.id !== r.id ? ` · now on ${b.route.name}` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => edit(r)}>Edit</button>
                  <button className="btn small danger" onClick={() => confirmDelete(`/admin/routes/${r.id}`, r.name, routes.reload, routes.setError)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two">
        <form className="card" onSubmit={save}>
          <h2>{editingId ? "Edit route" : "Create route"}</h2>
          <label>Route name<input value={form.name} onChange={setField("name")} required /></label>
          <div className="row">
            <label className="grow">Start point<input value={form.start_point} onChange={setField("start_point")} required /></label>
            <label className="grow">End point<input value={form.end_point} onChange={setField("end_point")} required /></label>
          </div>
          <label>Ticket price (Rs)<input type="number" min="0" value={form.fare} onChange={setField("fare")} required /></label>
          <h3>Stops <span className="muted small">(click on the map to add a stop)</span></h3>
          {form.stops.map((s, i) => (
            <div className="row stop-row" key={i}>
              <span className="muted">{i + 1}.</span>
              <input value={s.name} onChange={(e) => setStop(i, "name", e.target.value)} placeholder="Stop name" required />
              <input value={s.latitude} onChange={(e) => setStop(i, "latitude", e.target.value)} placeholder="Lat" required />
              <input value={s.longitude} onChange={(e) => setStop(i, "longitude", e.target.value)} placeholder="Lng" required />
              <button type="button" className="btn small danger" onClick={() => removeStop(i)}>✕</button>
            </div>
          ))}
          {editingId && <p className="muted small">If you change the stops, passengers on this route will need to pick their stop again. A new price applies to tickets booked from now on.</p>}
          <div className="row">
            <button className="btn">{editingId ? "Save changes" : "Create route"}</button>
            {editingId && <button type="button" className="btn secondary" onClick={reset}>Cancel</button>}
          </div>
        </form>
        <div className="card">
          <MapView routes={[draft]} onMapClick={addStopAt} height={420} />
        </div>
      </div>
    </>
  );
}

// ---------------- Buses ----------------
const emptyBus = { bus_number: "", plate_number: "", model: "", capacity: 40 };

function BusesTab() {
  const buses = useList("/admin/buses");
  const drivers = useList("/admin/drivers");
  const [form, setForm] = useState(emptyBus);
  const [editingId, setEditingId] = useState(null);
  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      await api(editingId ? `/admin/buses/${editingId}` : "/admin/buses", {
        method: editingId ? "PUT" : "POST",
        body: { ...form, capacity: Number(form.capacity) },
      });
      setForm(emptyBus);
      setEditingId(null);
      buses.reload();
      buses.setError("");
    } catch (err) {
      buses.setError(err.message);
    }
  }

  async function assign(busId, driverId) {
    try {
      await api(`/admin/buses/${busId}/driver`, { method: "PUT", body: { driver_id: driverId ? Number(driverId) : null } });
      buses.reload();
      drivers.reload();
    } catch (err) {
      buses.setError(err.message);
    }
  }

  return (
    <div className="grid two wide-left">
      <div className="card">
        <h2>Buses</h2>
        {buses.error && <div className="error">{buses.error}</div>}
        <table>
          <thead><tr><th>Bus #</th><th>Plate</th><th>Model</th><th>Seats</th><th>Driver</th><th>Route</th><th></th></tr></thead>
          <tbody>
            {buses.items.map((b) => (
              <tr key={b.id}>
                <td><b>{b.bus_number}</b></td>
                <td>{b.plate_number}</td>
                <td>{b.model}</td>
                <td>{b.capacity}</td>
                <td>
                  <select value={b.driver?.id ?? ""} onChange={(e) => assign(b.id, e.target.value)}>
                    <option value="">— none —</option>
                    {drivers.items.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}{d.bus && d.bus.id !== b.id ? ` · now on ${d.bus.bus_number}` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{b.route?.name || <span className="muted">—</span>}</td>
                <td className="actions">
                  <button className="btn small secondary" onClick={() => { setEditingId(b.id); setForm({ bus_number: b.bus_number, plate_number: b.plate_number, model: b.model, capacity: b.capacity }); }}>Edit</button>
                  <button className="btn small danger" onClick={() => confirmDelete(`/admin/buses/${b.id}`, `bus ${b.bus_number}`, buses.reload, buses.setError)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={save}>
        <h2>{editingId ? "Edit bus" : "Add bus"}</h2>
        <label>Bus number<input value={form.bus_number} onChange={setField("bus_number")} required /></label>
        <label>Plate number<input value={form.plate_number} onChange={setField("plate_number")} required /></label>
        <label>Model<input value={form.model} onChange={setField("model")} /></label>
        <label>Capacity<input type="number" min="1" max="200" value={form.capacity} onChange={setField("capacity")} required /></label>
        <div className="row">
          <button className="btn">{editingId ? "Save" : "Add bus"}</button>
          {editingId && <button type="button" className="btn secondary" onClick={() => { setEditingId(null); setForm(emptyBus); }}>Cancel</button>}
        </div>
      </form>
    </div>
  );
}

// ---------------- Drivers & users ----------------
function AccountForm({ kind, onCreated }) {
  const isDriver = kind === "driver";
  const empty = { name: "", email: "", phone: "", license_number: "", password: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError("");
    setDone("");
    const { license_number, ...rest } = form;
    try {
      await api(isDriver ? "/admin/drivers" : "/admin/users", {
        method: "POST",
        body: isDriver ? { ...rest, license_number } : rest,
      });
      setDone(`Account created. ${form.name} can now log in with ${form.email}.`);
      setForm(empty);
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Add {isDriver ? "driver" : "passenger"}</h2>
      <label>Full name<input value={form.name} onChange={setField("name")} required minLength={2} /></label>
      <label>Email<input type="email" value={form.email} onChange={setField("email")} required /></label>
      <label>Phone<input value={form.phone} onChange={setField("phone")} required minLength={5} /></label>
      {isDriver && (
        <label>License number<input value={form.license_number} onChange={setField("license_number")} required minLength={3} /></label>
      )}
      <label>Password<input value={form.password} onChange={setField("password")} required /></label>
      {error && <div className="error">{error}</div>}
      {done && <div className="success">{done}</div>}
      <button className="btn">Create account</button>
    </form>
  );
}

function DriversTab() {
  const drivers = useList("/admin/drivers");
  return (
    <div className="grid two wide-left">
    <div className="card">
      <h2>Drivers</h2>
      {drivers.error && <div className="error">{drivers.error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>License</th><th>Bus</th><th>Duty</th><th>Last location</th><th></th></tr></thead>
        <tbody>
          {drivers.items.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td><td>{d.email}</td><td>{d.phone}</td><td>{d.license_number}</td>
              <td>{d.bus?.bus_number || <span className="muted">—</span>}</td>
              <td>{d.on_duty ? <span className="live">● on</span> : "off"}</td>
              <td>{timeAgo(d.location_age_seconds)}</td>
              <td><button className="btn small danger" onClick={() => confirmDelete(`/admin/drivers/${d.id}`, d.name, drivers.reload, drivers.setError)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <AccountForm kind="driver" onCreated={drivers.reload} />
    </div>
  );
}

function UsersTab() {
  const users = useList("/admin/users");
  return (
    <div className="grid two wide-left">
    <div className="card">
      <h2>Passengers</h2>
      {users.error && <div className="error">{users.error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Route</th><th>Stop</th><th>Ticket</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          {users.items.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td><td>{u.phone}</td>
              <td>{u.route?.name || <span className="muted">—</span>}</td>
              <td>{u.stop?.name || <span className="muted">—</span>}</td>
              <td>{u.current_ticket ? <>{u.current_ticket.ticket_number}<div className="muted small">Rs {u.current_ticket.price}</div></> : <span className="muted">—</span>}</td>
              <td>{new Date(u.created_at + "Z").toLocaleDateString()}</td>
              <td><button className="btn small danger" onClick={() => confirmDelete(`/admin/users/${u.id}`, u.name, users.reload, users.setError)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <AccountForm kind="user" onCreated={users.reload} />
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState(TABS[0]);
  const views = { "Live map": LiveTab, Routes: RoutesTab, Buses: BusesTab, Drivers: DriversTab, Users: UsersTab };
  const View = views[tab];

  return (
    <Layout title="Admin">
      <div className="tabs page-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <View />
    </Layout>
  );
}
