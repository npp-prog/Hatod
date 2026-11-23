import { estimateRoadKm, type LatLng } from '@hatod/shared';
import { logger } from 'firebase-functions';
import { ORS_API_KEY, secretValue } from '../params';

/**
 * Road distance in km from OpenRouteService. Falls back to the straight-line
 * estimate (× 1.3) when no key is set, the service is slow, or it fails, and
 * says so, so the fee is labelled "estimate".
 */
export async function roadDistanceKm(from: LatLng, to: LatLng): Promise<{ km: number; estimate: boolean }> {
  const key = secretValue(ORS_API_KEY);
  if (!key) return { km: estimateRoadKm(from, to), estimate: true };
  try {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
    const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`ors_${res.status}`);
    const json = (await res.json()) as { features?: { properties?: { summary?: { distance?: number } } }[] };
    const meters = json.features?.[0]?.properties?.summary?.distance;
    if (typeof meters !== 'number') throw new Error('ors_no_distance');
    return { km: meters / 1000, estimate: false };
  } catch (e) {
    logger.warn('Routing failed; using estimate', { error: String(e) });
    return { km: estimateRoadKm(from, to), estimate: true };
  }
}
