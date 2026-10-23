import { Fragment, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { timeAgo } from "../api";

const DEFAULT_CENTER = [24.8607, 67.0011];
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

const busIcon = L.divIcon({ className: "bus-icon", html: "🚌", iconSize: [34, 34], iconAnchor: [17, 17] });

function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15, { animate: false });
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], animate: false });
    // Only refit when the set of routes/stops changes, not on every location poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

/**
 * routes: [{ id, name, stops: [{id, name, latitude, longitude}], bus?: { bus_number, driver? } }]
 */
export default function MapView({ routes = [], highlightStopId, onMapClick, height = 450 }) {
  const stopPoints = useMemo(
    () => routes.flatMap((r) => r.stops.map((s) => [s.latitude, s.longitude])),
    [routes]
  );
  // While stops are being added by clicking, don't re-zoom on every click or the next click lands in the wrong place.
  const fitKey = onMapClick ? "editing" : routes.map((r) => `${r.id}:${r.stops.length}`).join("|");

  return (
    <MapContainer center={stopPoints[0] || DEFAULT_CENTER} zoom={13} style={{ height }} className="map">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds points={stopPoints} fitKey={fitKey} />
      {onMapClick && <ClickHandler onClick={onMapClick} />}

      {routes.map((route, i) => {
        const color = COLORS[i % COLORS.length];
        const driver = route.bus?.driver;
        return (
          <Fragment key={route.id}>
            <Polyline positions={route.stops.map((s) => [s.latitude, s.longitude])} pathOptions={{ color, weight: 4, opacity: 0.7 }} />
            {route.stops.map((stop, idx) => {
              const mine = highlightStopId != null && stop.id === highlightStopId;
              return (
                <CircleMarker
                  key={stop.id ?? idx}
                  center={[stop.latitude, stop.longitude]}
                  radius={mine ? 10 : 6}
                  pathOptions={{ color: mine ? "#f59e0b" : color, fillColor: mine ? "#fbbf24" : "#fff", fillOpacity: 1, weight: 3 }}
                >
                  <Tooltip>{idx + 1}. {stop.name}{mine ? " (your stop)" : ""}</Tooltip>
                </CircleMarker>
              );
            })}
            {driver?.latitude != null && (
              <Marker position={[driver.latitude, driver.longitude]} icon={busIcon}>
                <Popup>
                  <b>{route.bus.bus_number}</b> · {route.name}<br />
                  Driver: {driver.name} ({driver.phone})<br />
                  {driver.on_duty ? "On duty" : "Off duty"} · updated {timeAgo(driver.location_age_seconds)}
                </Popup>
              </Marker>
            )}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
