import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon in bundlers (e.g. Vite)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});
import { useApp } from '@/context/AppContext';
import { mockVendors } from '@/data/mock';
import type { MapVendor } from '@/types';

// Arc helper: points from user to vendor with a curved arc (bulge)
function getArcPoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  numPoints = 24
): [number, number][] {
  const bulge = 0.15;
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = (1 - t) * from.lat + t * to.lat + bulge * Math.sin(Math.PI * t);
    const lng = (1 - t) * from.lng + t * to.lng;
    points.push([lat, lng]);
  }
  return points;
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [map, center]);
  return null;
}

export function MapViewPage() {
  const navigate = useNavigate();
  const { userLocation } = useApp();
  const [vendors, setVendors] = useState<MapVendor[]>([]);

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [37.4419, -122.143];

  useEffect(() => {
    // Start with all vendors active (with lines)
    setVendors(
      mockVendors.map((v) => ({
        ...v,
        active: true,
      }))
    );
  }, []);

  // Simulate: after 4s, first vendor goes inactive; after 7s, second; after 10s, third → then go to response
  useEffect(() => {
    const t1 = setTimeout(() => {
      setVendors((prev) => prev.map((v, i) => (i === 0 ? { ...v, active: false } : v)));
    }, 4000);
    const t2 = setTimeout(() => {
      setVendors((prev) => prev.map((v, i) => (i <= 1 ? { ...v, active: false } : v)));
    }, 7000);
    const t3 = setTimeout(() => {
      setVendors((prev) => prev.map((v) => ({ ...v, active: false })));
    }, 10000);
    const t4 = setTimeout(() => navigate('/response'), 11500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [navigate]);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="border-b border-border/50 px-4 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Finding vendors</h1>
        <p className="text-sm text-muted-foreground">Agent is negotiating with nearby vendors. Lines show active conversations.</p>
      </header>

      <div className="flex-1 relative min-h-0">
        <MapContainer
          center={center}
          zoom={13}
          className="h-full w-full"
          style={{ background: '#0F172A' }}
        >
          <MapCenter center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* User home */}
          <CircleMarker
            center={[center[0], center[1]]}
            radius={12}
            pathOptions={{
              color: '#4F46E5',
              fillColor: '#4F46E5',
              fillOpacity: 1,
              weight: 2,
            }}
          />

          {vendors.map((vendor) => {
            const loc = vendor.home_location;
            if (!loc) return null;
            const isActive = vendor.active;
            const arcPoints = getArcPoints(
              { lat: center[0], lng: center[1] },
              { lat: loc.lat, lng: loc.lng }
            );

            return (
              <div key={vendor.name}>
                {isActive && (
                  <Polyline
                    positions={arcPoints}
                    pathOptions={{
                      color: '#14B8A6',
                      weight: 2,
                      opacity: 0.9,
                      dashArray: '8,8',
                    }}
                  />
                )}
                <CircleMarker
                  center={[loc.lat, loc.lng]}
                  radius={10}
                  pathOptions={{
                    color: isActive ? '#14B8A6' : '#64748b',
                    fillColor: isActive ? '#14B8A6' : '#64748b',
                    fillOpacity: 1,
                    weight: 2,
                  }}
                />
              </div>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
