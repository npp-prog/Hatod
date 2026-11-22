import { manilaParts } from './hours';

/**
 * Delivery fees. Every rider sets their own rate card; Hatod only computes
 * and shows the estimate. The rider collects the fee directly. Hatod adds
 * nothing on top: no platform fee, no commission.
 */
export interface FixedFare {
  fromBarangayId: string;
  toBarangayId: string;
  fee: number;
}

export interface NightSurcharge {
  /** Hour (0–23, Manila) the surcharge starts. */
  fromHour: number;
  /** Hour (0–23) it stops; may be earlier than fromHour (runs past midnight). */
  untilHour: number;
  amount: number;
}

export interface RateCard {
  base: number;
  perKm: number;
  minimum: number;
  fixedFares: FixedFare[];
  surcharges: {
    night: NightSurcharge | null;
    /** Charged while the rider has their "raining" switch on. */
    rain: number;
    /** Per additional stop (pabili, Phase 2). */
    extraStop: number;
  };
}

export const DEFAULT_RATE_CARD: RateCard = {
  base: 30,
  perKm: 10,
  minimum: 40,
  fixedFares: [],
  surcharges: { night: null, rain: 0, extraStop: 0 },
};

/** Road distance in km, rounded UP to the next 0.5 km (3.2 -> 3.5, 3.5 -> 3.5). */
export function roundUpHalfKm(km: number): number {
  if (!(km > 0)) return 0;
  // The small epsilon keeps 3.5000000001 from floating-point noise at 3.5.
  return Math.ceil(km * 2 - 1e-9) / 2;
}

/** Fixed fare for a pair of barangays, in either direction. */
export function findFixedFare(card: RateCard, a: string, b: string): FixedFare | null {
  return card.fixedFares.find((f) => (f.fromBarangayId === a && f.toBarangayId === b) || (f.fromBarangayId === b && f.toBarangayId === a)) ?? null;
}

export function isNightHour(n: NightSurcharge, hour: number): boolean {
  return n.fromHour < n.untilHour ? hour >= n.fromHour && hour < n.untilHour : hour >= n.fromHour || hour < n.untilHour;
}

export interface FeeBreakdown {
  /** Set when a fixed fare was used instead of base + distance. */
  fixedFare: number | null;
  base: number;
  distance: number;
  /** Amount added to reach the rider's minimum fee (0 if not needed). */
  minimumTopUp: number;
  night: number;
  rain: number;
  extraStops: number;
}

export interface FeeQuote {
  fee: number;
  breakdown: FeeBreakdown;
  /** Distance used for pricing (rounded up to 0.5 km). */
  billedKm: number;
  /** true when the distance is a straight-line estimate because routing failed. */
  estimate: boolean;
}

/**
 * The delivery fee for one trip with one rider's rate card.
 *   fixed fare for the shop barangay <-> drop-off barangay, if the rider set one
 *   otherwise max(minimum, base + perKm × billedKm), rounded up to a whole peso
 *   plus night (Manila hour), rain (rider's switch) and extra-stop surcharges
 */
export function computeDeliveryFee(opts: {
  card: RateCard;
  distanceKm: number;
  fromBarangayId: string;
  toBarangayId: string;
  at: Date;
  rainOn?: boolean;
  extraStops?: number;
  estimate?: boolean;
}): FeeQuote {
  const { card } = opts;
  const billedKm = roundUpHalfKm(opts.distanceKm);
  const fixed = findFixedFare(card, opts.fromBarangayId, opts.toBarangayId);

  let base = 0;
  let distance = 0;
  let minimumTopUp = 0;
  if (!fixed) {
    base = card.base;
    distance = Math.ceil(card.perKm * billedKm - 1e-9);
    minimumTopUp = Math.max(0, card.minimum - (base + distance));
  }
  const night = card.surcharges.night && isNightHour(card.surcharges.night, Math.floor(manilaParts(opts.at).minutes / 60)) ? card.surcharges.night.amount : 0;
  const rain = opts.rainOn ? card.surcharges.rain : 0;
  const extraStops = Math.max(0, opts.extraStops ?? 0) * card.surcharges.extraStop;

  const tripFee = fixed ? fixed.fee : base + distance + minimumTopUp;
  return {
    fee: tripFee + night + rain + extraStops,
    breakdown: { fixedFare: fixed ? fixed.fee : null, base, distance, minimumTopUp, night, rain, extraStops },
    billedKm,
    estimate: !!opts.estimate,
  };
}
