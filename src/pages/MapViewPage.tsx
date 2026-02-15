import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
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
  const { userLocation, lastPrompt } = useApp();
  const [vendors, setVendors] = useState<MapVendor[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [statusText, setStatusText] = useState('Placing agents on map...');

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [37.4419, -122.143];

  // Map page is placeholder — no mock timers. Real orchestration uses AgentMatchingPage.
  useEffect(() => {
    setVendors([]);
    setActiveCount(0);
    setStatusText('Use /customer/agents for real-time orchestration');
  }, []);

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="px-6 py-4 flex-shrink-0 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-12 w-12" />
            <div>
              <h1 className="text-base font-semibold text-foreground">AgentPlace</h1>
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
                width: `${vendors.length > 0 ? ((vendors.length - activeCount) / vendors.length) * 100 : 0}%`,
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
            pathOptions={{ color: '#fafafa', fillColor: '#fafafa', fillOpacity: 0.15, weight: 2 }}
          />
          <CircleMarker
            center={center}
            radius={6}
            pathOptions={{ color: '#fafafa', fillColor: '#fafafa', fillOpacity: 1, weight: 0 }}
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
                    pathOptions={{ color: '#a3a3a3', weight: 2, opacity: 0.7, dashArray: '6,8' }}
                  />
                )}
                <CircleMarker
                  center={[loc.lat, loc.lng]}
                  radius={8}
                  pathOptions={{
                    color: isActive ? '#fafafa' : '#525252',
                    fillColor: isActive ? '#fafafa' : '#525252',
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
