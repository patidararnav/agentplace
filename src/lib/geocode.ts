/**
 * Geocoding via OpenStreetMap Nominatim.
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 * One request per second; identify app via User-Agent.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "AgentPlace/1.0 (hackathon demo; address-to-coordinates)";

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
}

/** Convert an address string to lat/lng. Returns null if not found or on error. */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: "1",
  });
  const url = `${NOMINATIM_URL}/search?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return {
      lat,
      lng: lon,
      displayName: first.display_name,
    };
  } catch {
    return null;
  }
}

/** Convert lat/lng to a display address. Returns null on error. */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
  });
  const url = `${NOMINATIM_URL}/reverse?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = data?.display_name ?? data?.address;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}
