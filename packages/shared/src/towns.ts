import { haversineKm, isInPhilippines, type LatLng } from './geo';
import { slugify } from './slug';

/** Pricing tier of a town; plan prices are set per tier (M9). */
export const TOWN_TIERS = ['A', 'B', 'C'] as const;
export type TownTier = (typeof TOWN_TIERS)[number];

/** Default radius around the town center inside which delivery pins are accepted. */
export const DEFAULT_TOWN_RADIUS_KM = 15;

export function townId(name: string, province: string): string {
  return `${slugify(name)}--${slugify(province)}`;
}

/** Deterministic, so re-importing the same CSV updates rather than duplicates. */
export function barangayId(townIdValue: string, name: string): string {
  return `${townIdValue}__${slugify(name)}`;
}

export interface TownGeo {
  center: LatLng;
  radiusKm: number;
}

/** A delivery pin must be in the Philippines and within the town's service radius. */
export function isPinInTown(pin: LatLng, town: TownGeo): boolean {
  return isInPhilippines(pin) && haversineKm(pin, town.center) <= town.radiusKm;
}

/** Natural sort for barangay names so "Barangay 2" comes before "Barangay 10". */
export function compareBarangayNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}
