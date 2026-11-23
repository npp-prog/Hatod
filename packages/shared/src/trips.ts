import { computeDeliveryFee, type FeeQuote, type RateCard } from './fees';
import { haversineKm, type LatLng } from './geo';
import { riderEligibility, type SubscriptionStatus } from './riders';

/** Roads are rarely straight: when routing is unavailable, straight-line distance × 1.3 is the estimate. */
export const ROAD_FACTOR = 1.3;
export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * ROAD_FACTOR;
}

/** Rider approximate location is rounded to 2 decimals (about 1 km) for privacy. */
export function coarseLatLng(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

export interface RiderForQuote {
  id: string;
  verified: boolean;
  status: 'active' | 'suspended' | 'banned';
  online: boolean;
  rainOn: boolean;
  servedBarangayIds: string[];
  maxKm: number;
  rateCard: RateCard;
  ratingAvg: number;
  ratingCount: number;
  approxLocation?: LatLng | null;
}

export interface RiderOption<R extends RiderForQuote = RiderForQuote> {
  rider: R;
  quote: FeeQuote;
  /** Straight-line km from the rider's approximate location to the shop; null when unknown. */
  kmFromShop: number | null;
}

export type RiderSort = 'price' | 'rating' | 'nearest';

/**
 * Riders who can take this trip, each with their own fee, sorted as asked.
 * Ties fall back to price, then rating, so the list is stable.
 */
export function riderOptions<R extends RiderForQuote>(
  riders: R[],
  trip: { shopGeo: LatLng; shopBarangayId: string; dropoffGeo: LatLng; dropoffBarangayId: string; distanceKm: number; estimate: boolean; at: Date },
  subscriptionOf: (riderId: string) => SubscriptionStatus | null,
  sort: RiderSort = 'price',
): RiderOption<R>[] {
  const options: RiderOption<R>[] = [];
  for (const rider of riders) {
    const quote = computeDeliveryFee({
      card: rider.rateCard,
      distanceKm: trip.distanceKm,
      fromBarangayId: trip.shopBarangayId,
      toBarangayId: trip.dropoffBarangayId,
      at: trip.at,
      rainOn: rider.rainOn,
      estimate: trip.estimate,
    });
    const ok = riderEligibility(rider, subscriptionOf(rider.id), { dropoffBarangayId: trip.dropoffBarangayId, billedKm: quote.billedKm });
    if (!ok.eligible) continue;
    options.push({ rider, quote, kmFromShop: rider.approxLocation ? haversineKm(rider.approxLocation, trip.shopGeo) : null });
  }
  const byPrice = (a: RiderOption, b: RiderOption) => a.quote.fee - b.quote.fee;
  const byRating = (a: RiderOption, b: RiderOption) => b.rider.ratingAvg - a.rider.ratingAvg || b.rider.ratingCount - a.rider.ratingCount;
  const byNear = (a: RiderOption, b: RiderOption) => (a.kmFromShop ?? Infinity) - (b.kmFromShop ?? Infinity);
  const chain = sort === 'rating' ? [byRating, byPrice] : sort === 'nearest' ? [byNear, byPrice, byRating] : [byPrice, byRating];
  return options.sort((a, b) => {
    for (const f of chain) {
      const d = f(a, b);
      if (d !== 0) return d;
    }
    return a.rider.id.localeCompare(b.rider.id);
  });
}
