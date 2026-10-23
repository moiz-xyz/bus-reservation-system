import { useEffect, useState } from "react";
import { api, timeAgo } from "../api";
import { usePolling } from "../hooks";
import Layout from "../components/Layout.jsx";
import MapView from "../components/MapView.jsx";

const formatPrice = (amount) => `Rs ${amount.toLocaleString()}`;

function TicketCard({ ticket, isNew }) {
  return (
    <div className={isNew ? "ticket new" : "ticket"}>
      <div className="ticket-main">
        {isNew && <div className="ticket-flash">✅ Ticket booked!</div>}
        <span className="label">🎫 Ticket number</span>
        <div className="ticket-number">{ticket.ticket_number}</div>
        <div className="muted small">
          {ticket.route_name}{ticket.stop_name && ` · Stop: ${ticket.stop_name}`} · {new Date(ticket.created_at + "Z").toLocaleString()}
        </div>
      </div>
      <div className="ticket-price">
        <span className="label">Price</span>
        <b>{formatPrice(ticket.price)}</b>
      </div>
    </div>
  );
}

function RoutePicker({ current, onSaved, onCancel }) {
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState(current?.route?.id ?? "");
  const [stopId, setStopId] = useState(current?.stop?.id ?? "");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api("/routes").then(setRoutes).catch((e) => setError(e.message));
  }, []);

  // Show who drives the selected route before the passenger books it.
  useEffect(() => {
    setPreview(null);
    if (!routeId) return;
    let cancelled = false;
    api(`/user/routes/${routeId}/preview`)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [routeId]);

  const route = routes.find((r) => r.id === Number(routeId));

  async function save(e) {
    e.preventDefault();
    try {
      await api("/user/route", {
        method: "PUT",
        body: { route_id: Number(routeId), stop_id: stopId ? Number(stopId) : null },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid two">
      <form className="card" onSubmit={save}>
        <h2>Choose your route</h2>
        <label>Route
          <select value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(""); }} required>
            <option value="">— select a route —</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {formatPrice(r.fare)}
              </option>
            ))}
          </select>
        </label>
        {route && (
          <label>Your pickup stop
            <select value={stopId} onChange={(e) => setStopId(e.target.value)}>
              <option value="">— optional —</option>
              {route.stops.map((s) => <option key={s.id} value={s.id}>{s.sequence + 1}. {s.name}</option>)}
            </select>
          </label>
        )}
        {route && preview && (
          <div className="driver-preview">
            <span className="label">Bus & driver on this route</span>
            {preview.bus ? (
              <div className="details">
                <div><span>Bus</span><b>{preview.bus.bus_number} · {preview.bus.plate_number}</b></div>
                <div><span>Model / seats</span><b>{preview.bus.model || "—"} · {preview.bus.capacity} seats</b></div>
                <div><span>Driver</span><b>{preview.driver_name || "Not assigned yet"}</b></div>
                {preview.driver_phone && (
                  <div><span>Driver phone</span><b><a href={`tel:${preview.driver_phone}`}>📞 {preview.driver_phone}</a></b></div>
                )}
              </div>
            ) : (
              <p className="warn">No bus runs this route yet.</p>
            )}
          </div>
        )}
        {route && (
          <div className="price-box">
            <span>Ticket price</span>
            <b>{formatPrice(route.fare)}</b>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button className="btn" disabled={!routeId}>
            {route ? `Book ticket · ${formatPrice(route.fare)}` : "Book ticket"}
          </button>
          {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
      <div className="card">
        <MapView routes={route ? [route] : routes} highlightStopId={Number(stopId)} height={380} />
      </div>
    </div>
  );
}

function Tracking({ onChangeRoute }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  usePolling(async () => {
    try {
      setData(await api("/user/tracking"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, 5000);

  if (!data) return <div className="card">{error || "Loading…"}</div>;

  const { route, my_stop, status, is_live, distance_km, eta_minutes, near_stop } = data;
  const bus = route.bus;
  const driver = bus?.driver;
  const hasLocation = driver?.latitude != null;

  return (
    <>
      <div className="grid two">
        <div className="card">
          <h2>🚌 Your allocated bus</h2>
          {bus ? (
            <div className="details">
              <div><span>Bus number</span><b className="big-number">{bus.bus_number}</b></div>
              <div><span>Plate number</span><b>{bus.plate_number}</b></div>
              <div><span>Model</span><b>{bus.model || "—"}</b></div>
              <div><span>Seats</span><b>{bus.capacity}</b></div>
              <div><span>Driver</span><b>{driver ? driver.name : "Not assigned yet"}</b></div>
              <div><span>Driver phone</span><b>{driver ? <a href={`tel:${driver.phone}`}>📞 {driver.phone}</a> : "—"}</b></div>
              <div><span>Route</span><b>{route.name}</b></div>
              <div><span>From → To</span><b>{route.start_point} → {route.end_point}</b></div>
            </div>
          ) : (
            <p className="warn">No bus has been allocated to {route.name} yet. Check back soon.</p>
          )}
        </div>

        <div className="card">
          <h2>📍 Bus location</h2>
          <div className="details">
            <div><span>Status</span><b className={is_live ? "live" : "warn"}>{is_live ? "● Live" : status}</b></div>
            <div><span>Bus is near</span><b>{near_stop || "—"}</b></div>
            {my_stop && <div><span>Your stop</span><b>{my_stop.name}</b></div>}
            {distance_km != null && <div><span>Distance to your stop</span><b>{distance_km} km</b></div>}
            {eta_minutes != null && <div><span>Arrives in about</span><b>{eta_minutes} min</b></div>}
            <div><span>Last updated</span><b>{timeAgo(driver?.location_age_seconds)}</b></div>
          </div>
          {hasLocation && (
            <a
              className="btn secondary maps-link"
              href={`https://www.google.com/maps?q=${driver.latitude},${driver.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open bus location in Google Maps ↗
            </a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Live location</h2>
          <button className="btn secondary" onClick={onChangeRoute}>Change route / stop</button>
        </div>
        <MapView routes={[route]} highlightStopId={my_stop?.id} />
        <p className="muted small">Refreshes every 5 seconds. Tap the 🚌 for details.</p>
      </div>
    </>
  );
}

export default function UserDashboard() {
  const [me, setMe] = useState(null);
  const [picking, setPicking] = useState(false);
  const [justBooked, setJustBooked] = useState(false);

  const load = () => api("/user/me").then(setMe);
  useEffect(() => { load(); }, []);

  if (!me) return <Layout title="Passenger"><div className="card">Loading…</div></Layout>;

  return (
    <Layout
      title="Passenger"
      tags={[me.current_ticket?.ticket_number, me.route?.name, me.stop && `Stop: ${me.stop.name}`]}
    >
      {!me.route || picking ? (
        <RoutePicker
          current={me}
          onSaved={() => { setPicking(false); setJustBooked(true); load(); }}
          onCancel={me.route ? () => setPicking(false) : null}
        />
      ) : (
        <>
          {me.current_ticket && <TicketCard ticket={me.current_ticket} isNew={justBooked} />}
          <Tracking onChangeRoute={() => { setJustBooked(false); setPicking(true); }} />
        </>
      )}
    </Layout>
  );
}
