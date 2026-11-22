import type { VerificationStatus } from './shops';

export const VEHICLE_TYPES = ['motorcycle', 'bicycle', 'tricycle'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Documents a rider uploads; checked in person by the town coordinator. */
export const RIDER_DOCS = ['governmentId', 'license', 'orcr', 'clearance'] as const;
export type RiderDocKey = (typeof RIDER_DOCS)[number];
/** Riders on a bicycle need no license or OR/CR. */
export function requiredRiderDocs(vehicle: VehicleType): RiderDocKey[] {
  return vehicle === 'bicycle' ? ['governmentId', 'clearance'] : [...RIDER_DOCS];
}

export const RIDER_LIMITS = {
  maxKmMax: 30,
  maxKmDefault: 8,
  fixedFaresMax: 50,
  vehicleDescMax: 60,
  baseMax: 1000,
  perKmMax: 200,
  minimumMax: 2000,
  fixedFareMax: 3000,
  surchargeMax: 500,
} as const;

/** Riders may change their rate card once per 24 hours after verification, so prices stay predictable. */
export const RATE_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function nextRateChangeAt(rateUpdatedAtMs: number | null, verified: boolean): number | null {
  if (!verified || rateUpdatedAtMs === null) return null;
  return rateUpdatedAtMs + RATE_CHANGE_INTERVAL_MS;
}

export function canChangeRates(rateUpdatedAtMs: number | null, verified: boolean, nowMs: number): boolean {
  const next = nextRateChangeAt(rateUpdatedAtMs, verified);
  return next === null || nowMs >= next;
}

/** "ABC 1234", "123 ABC", "1234-567890" (MV file number while waiting for plates). Upper-cased, single spaces. */
export function normalizePlate(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}
export const PLATE_RE = /^[A-Z0-9][A-Z0-9 -]{1,14}[A-Z0-9]$/;

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'lapsed';

export type IneligibleReason = 'not_verified' | 'suspended' | 'offline' | 'subscription' | 'area' | 'too_far';

/**
 * Whether a rider can be offered a trip. Order matters only for the reason
 * shown; every condition must hold.
 */
export function riderEligibility(
  rider: { verified: boolean; status: 'active' | 'suspended'; online: boolean; servedBarangayIds: string[]; maxKm: number },
  subscription: SubscriptionStatus | null,
  trip: { dropoffBarangayId: string; billedKm: number },
): { eligible: true } | { eligible: false; reason: IneligibleReason } {
  if (!rider.verified) return { eligible: false, reason: 'not_verified' };
  if (rider.status !== 'active') return { eligible: false, reason: 'suspended' };
  if (!rider.online) return { eligible: false, reason: 'offline' };
  if (subscription !== 'trial' && subscription !== 'active' && subscription !== 'grace') return { eligible: false, reason: 'subscription' };
  if (!rider.servedBarangayIds.includes(trip.dropoffBarangayId)) return { eligible: false, reason: 'area' };
  if (trip.billedKm > rider.maxKm) return { eligible: false, reason: 'too_far' };
  return { eligible: true };
}

export type RiderVerificationStatus = VerificationStatus;
