import { useEffect, useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap, Marker, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { mockVendors } from '@/data/mock';

// Curved arch from user to vendor (quadratic Bezier, control point perpendicular = nice arch)
// trimStart/trimEnd: 0–1, exclude that fraction from start/end so line doesn't overlap markers
function getArcPath(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  numPoints = 32,
  trimStart = 0.12,
  trimEnd = 0.08
): [number, number][] {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const midLat = (from.lat + to.lat) / 2;
  const midLng = (from.lng + to.lng) / 2;
  const bulge = 0.032;
  const ctrlLat = midLat - dLng * bulge;
  const ctrlLng = midLng + dLat * bulge;
  const path: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = (1 - t) * (1 - t) * from.lat + 2 * (1 - t) * t * ctrlLat + t * t * to.lat;
    const lng = (1 - t) * (1 - t) * from.lng + 2 * (1 - t) * t * ctrlLng + t * t * to.lng;
    path.push([lat, lng]);
  }
  const startIdx = Math.floor(path.length * trimStart);
  const endIdx = Math.ceil(path.length * (1 - trimEnd));
  return path.slice(startIdx, endIdx + 1);
}

// Home icon for user location (primary brand color)
const homeIcon = L.divIcon({
  className: 'home-marker',
  html: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

interface MapVendorState {
  id: number;
  name: string;
  position: { lat: number; lng: number };
  active: boolean;
  lineOpacity: number;
  lineDrawProgress: number;
  markerOpacity: number;
}

const defaultCenter: [number, number] = [37.4419, -122.143];

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
  const center: [number, number] = useMemo(
    () =>
      userLocation
        ? [userLocation.lat, userLocation.lng]
        : defaultCenter,
    [userLocation?.lat, userLocation?.lng]
  );

  const [vendorStates, setVendorStates] = useState<MapVendorState[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [statusText, setStatusText] = useState('Searching for vendors...');

  // Initialize from mock vendors
  useEffect(() => {
    const initial = mockVendors
      .filter((v) => v.home_location)
      .map((v, i) => ({
        id: v.vendor_id ?? i,
        name: v.name,
        position: v.home_location!,
        active: true,
        lineOpacity: 0,
        lineDrawProgress: 0,
        markerOpacity: 0,
      }));
    setVendorStates(initial);
    setActiveCount(initial.length);
  }, []);

  // Animate lines (draw along path + opacity) and markers in
  useEffect(() => {
    if (vendorStates.length === 0) return;
    const duration = 900;
    const steps = 36;
    const stepMs = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      const ease = 1 - (1 - t) * (1 - t);
      const drawEase = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setVendorStates((prev) =>
        prev.map((v) => ({
          ...v,
          lineOpacity: v.active ? ease : 0,
          lineDrawProgress: v.active ? drawEase : 0,
          markerOpacity: ease,
        }))
      );
      if (step >= steps) clearInterval(interval);
    }, stepMs);
    return () => clearInterval(interval);
  }, [vendorStates.length]);

  // Deactivate vendors one by one, update bar, then navigate
  useEffect(() => {
    if (vendorStates.length === 0) return;
    const t1 = setTimeout(() => {
      setVendorStates((prev) =>
        prev.map((v, i) => (i === 0 ? { ...v, active: false, lineOpacity: 0 } : v))
      );
      setActiveCount((c) => c - 1);
      setStatusText('Negotiating with vendors...');
    }, 4000);
    const t2 = setTimeout(() => {
      setVendorStates((prev) =>
        prev.map((v, i) => (i <= 1 ? { ...v, active: false, lineOpacity: 0 } : v))
      );
      setActiveCount((c) => Math.max(0, c - 1));
      setStatusText('Finalizing quotes...');
    }, 7000);
    const t3 = setTimeout(() => {
      setVendorStates((prev) =>
        prev.map((v) => ({ ...v, active: false, lineOpacity: 0 }))
      );
      setActiveCount(0);
      setStatusText('Done! Preparing results...');
    }, 10000);
    const t4 = setTimeout(() => navigate('/response'), 11500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [navigate, vendorStates.length]);

  return (
    <div className="h-svh flex flex-col bg-background overflow-hidden">
      {/* Header — keep bar and aesthetic */}
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
                  "{lastPrompt}"
                </p>
              )}
            </div>
          </div>
          <Badge
            variant="secondary"
            className="gap-1.5 px-3 py-1"
          >
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

        {/* Status bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${vendorStates.length ? ((vendorStates.length - activeCount) / vendorStates.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {statusText}
          </span>
        </div>
      </header>

      {/* Map — explicit min-height so Leaflet gets a real height */}
      <div
        className="flex-1 relative min-h-0 w-full"
        style={{ minHeight: 360 }}
      >
        <MapContainer
          center={center}
          zoom={13}
          className="h-full w-full"
          style={{ height: '100%', minHeight: 360, background: '#0F172A' }}
        >
          <MapCenter center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Lines and vendor dots first (below home icon) */}
          {vendorStates.map((v) => {
            const fullArcPath = getArcPath(
              { lat: center[0], lng: center[1] },
              v.position
            );
            const visibleCount = Math.max(
              2,
              Math.ceil(fullArcPath.length * v.lineDrawProgress)
            );
            const visiblePath = fullArcPath.slice(0, visibleCount);
            return (
              <Fragment key={v.id}>
                {v.active && v.lineOpacity > 0 && visiblePath.length >= 2 && (
                  <Polyline
                    positions={visiblePath}
                    pathOptions={{
                      color: '#14B8A6',
                      weight: 3,
                      opacity: v.lineOpacity,
                      dashArray: '8, 6',
                    }}
                  />
                )}
                <CircleMarker
                  center={[v.position.lat, v.position.lng]}
                  radius={12}
                  pathOptions={{
                    color: v.active ? '#14B8A6' : '#64748b',
                    fillColor: v.active ? '#14B8A6' : '#64748b',
                    fillOpacity: v.markerOpacity,
                    weight: 3,
                  }}
                />
              </Fragment>
            );
          })}

          {/* Home icon last so it renders on top of lines and vendor dots */}
          <Marker position={[center[0], center[1]]} icon={homeIcon} />
        </MapContainer>
      </div>
    </div>
  );
}
