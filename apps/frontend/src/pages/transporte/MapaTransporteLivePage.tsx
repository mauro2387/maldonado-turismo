import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { useStops } from '@hooks/useTransport';

// Fix default icon
// @ts-ignore
delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
});

type VehiclePosition = {
  id: string;
  vehicle_id?: string;
  route_id?: number | null;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  recorded_at?: string;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

function MapController({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function MapaTransporteLivePage() {
  const { stops } = useStops();

  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [center] = useState<LatLngExpression>([-34.911, -54.957]);
  const intervalRef = useRef<number | null>(null);

  async function fetchPositions() {
    try {
      const res = await fetch(`${API_BASE}/transport/vehicles`);
      if (!res.ok) return;
      const data = await res.json();
      // normalize numbers
      const mapped = (data || []).map((r: any) => ({
        id: r.id || r.vehicle_id || `${r.vehicle_id}_${r.recorded_at}`,
        vehicle_id: r.vehicle_id,
        route_id: r.route_id,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        heading: r.heading ? Number(r.heading) : null,
        speed: r.speed ? Number(r.speed) : null,
        recorded_at: r.recorded_at,
      }));
      setPositions(mapped);
    } catch (err) {
      // ignore network errors for now
      console.warn('fetchPositions error', err);
    }
  }

  useEffect(() => {
    // initial fetch
    fetchPositions();
    // poll every 5s
    intervalRef.current = window.setInterval(fetchPositions, 5000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <MapController center={center} zoom={13} />
        <TileLayer url={import.meta.env.VITE_MAP_TILES || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />

        {/* stops as small markers */}
        {stops?.map((s: any) => (
          <Marker key={`stop-${s.id}`} position={[Number(s.lat), Number(s.lng)]}>
            <Popup>
              <strong>{s.name}</strong>
              <div>{s.address}</div>
            </Popup>
          </Marker>
        ))}

        {/* vehicles */}
        {positions.map((v) => (
          <Marker
            key={`veh-${v.id}`}
            position={[v.latitude, v.longitude]}
            // rotate marker could be implemented with a custom icon; keep default for now
          >
            <Popup>
              <div>
                <strong>{v.vehicle_id || v.id}</strong>
                <div>route: {v.route_id ?? '—'}</div>
                <div>speed: {v.speed ?? '—'} km/h</div>
                <div>updated: {v.recorded_at ?? ''}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
