export interface LatLng {
  lat: number;
  lng: number;
}

/** Rough bounding box of the Philippines, used to reject obviously wrong pins. */
export const PH_BOUNDS = { minLat: 4.2, maxLat: 21.5, minLng: 116.0, maxLng: 127.0 } as const;

export function isInPhilippines(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= PH_BOUNDS.minLat &&
    p.lat <= PH_BOUNDS.maxLat &&
    p.lng >= PH_BOUNDS.minLng &&
    p.lng <= PH_BOUNDS.maxLng
  );
}

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (straight-line) distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounds coordinates to 6 decimals (~10 cm) so stored pins stay small and stable. */
export function roundLatLng(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
}
