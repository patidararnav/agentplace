import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { mockVendors } from '@/data/mock';
import type { MapVendor } from '@/types';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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
  const { userLocation, lastPrompt } = useApp();
  const [vendors, setVendors] = useState<MapVendor[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [statusText, setStatusText] = useState('Placing agents on map...');

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [37.4419, -122.143];

  useEffect(() => {
    setVendors(mockVendors.map((v) => ({ ...v, active: true })));
    setActiveCount(mockVendors.length);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setVendors((prev) => prev.map((v, i) => (i === 0 ? { ...v, active: false } : v)));
      setActiveCount(4);
      setStatusText('Agents finalizing negotiations...');
    }, 3000);
    const t2 = setTimeout(() => {
      setVendors((prev) => prev.map((v, i) => (i <= 1 ? { ...v, active: false } : v)));
      setActiveCount(3);
    }, 5000);
    const t3 = setTimeout(() => {
      setVendors((prev) => prev.map((v, i) => (i <= 2 ? { ...v, active: false } : v)));
      setActiveCount(2);
      setStatusText('Ranking results...');
    }, 7000);
    const t4 = setTimeout(() => {
      setVendors((prev) => prev.map((v) => ({ ...v, active: false })));
      setActiveCount(0);
      setStatusText('Done — preparing results');
    }, 8500);
    const t5 = setTimeout(() => navigate('/customer/results'), 10000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [navigate]);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Agent Place</h1>
              {lastPrompt && (
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  &ldquo;{lastPrompt}&rdquo;
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            {activeCount > 0 ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {activeCount} active
              </>
            ) : (
              'Complete'
            )}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${((mockVendors.length - activeCount) / mockVendors.length) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{statusText}</span>
        </div>
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
            attribution='&copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <CircleMarker
            center={center}
            radius={14}
            pathOptions={{ color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 0.15, weight: 2 }}
          />
          <CircleMarker
            center={center}
            radius={6}
            pathOptions={{ color: '#4F46E5', fillColor: '#4F46E5', fillOpacity: 1, weight: 0 }}
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
                    pathOptions={{ color: '#14B8A6', weight: 2, opacity: 0.7, dashArray: '6,8' }}
                  />
                )}
                <CircleMarker
                  center={[loc.lat, loc.lng]}
                  radius={8}
                  pathOptions={{
                    color: isActive ? '#14B8A6' : '#475569',
                    fillColor: isActive ? '#14B8A6' : '#475569',
                    fillOpacity: isActive ? 0.9 : 0.4,
                    weight: 0,
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
