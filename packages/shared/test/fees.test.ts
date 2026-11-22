import { describe, expect, it } from 'vitest';
import {
  canChangeRates,
  computeDeliveryFee,
  DEFAULT_RATE_CARD,
  findFixedFare,
  isNightHour,
  nextRateChangeAt,
  normalizePlate,
  rateCardSchema,
  registerRiderInput,
  riderEligibility,
  roundUpHalfKm,
  updateServiceAreaInput,
  type RateCard,
} from '../src';

const at = (local: string) => new Date(`${local}+08:00`);
const NOON = at('2026-11-23T12:00');

const card = (over: Partial<RateCard> = {}): RateCard => ({ ...DEFAULT_RATE_CARD, ...over, surcharges: { ...DEFAULT_RATE_CARD.surcharges, ...over.surcharges } });
const quote = (c: RateCard, km: number, extra: Partial<Parameters<typeof computeDeliveryFee>[0]> = {}) =>
  computeDeliveryFee({ card: c, distanceKm: km, fromBarangayId: 'pob', toBarangayId: 'mabini', at: NOON, ...extra });

describe('roundUpHalfKm', () => {
  it.each([
    [0, 0],
    [0.1, 0.5],
    [0.5, 0.5],
    [0.51, 1],
    [3.2, 3.5],
    [3.5, 3.5],
    [3.5000000001, 3.5],
    [7.01, 7.5],
  ])('%s km -> %s km', (km, billed) => {
    expect(roundUpHalfKm(km)).toBe(billed);
  });
  it('treats bad input as zero', () => {
    expect(roundUpHalfKm(-2)).toBe(0);
    expect(roundUpHalfKm(NaN)).toBe(0);
  });
});

describe('computeDeliveryFee', () => {
  it('matches the plan example: base 30, ₱10/km, min 40, 3.2 km -> 3.5 km -> ₱65', () => {
    const q = quote(card({ base: 30, perKm: 10, minimum: 40 }), 3.2);
    expect(q.billedKm).toBe(3.5);
    expect(q.fee).toBe(65);
    expect(q.breakdown).toEqual({ fixedFare: null, base: 30, distance: 35, minimumTopUp: 0, night: 0, rain: 0, extraStops: 0 });
  });
  it('tops up to the minimum on short trips', () => {
    const q = quote(card({ base: 20, perKm: 8, minimum: 40 }), 0.8);
    expect(q.fee).toBe(40);
    expect(q.breakdown).toMatchObject({ base: 20, distance: 8, minimumTopUp: 12 });
  });
  it('rounds a fractional distance charge up to a whole peso', () => {
    // 7 × 3.5 = 24.5 -> 25
    expect(quote(card({ base: 30, perKm: 7, minimum: 0 }), 3.4).fee).toBe(55);
  });
  it('uses a fixed fare instead of the formula, in either direction', () => {
    const c = card({ fixedFares: [{ fromBarangayId: 'mabini', toBarangayId: 'pob', fee: 60 }] });
    const q = quote(c, 9);
    expect(q.fee).toBe(60);
    expect(q.breakdown).toMatchObject({ fixedFare: 60, base: 0, distance: 0, minimumTopUp: 0 });
  });
  it('a fixed fare can be within one barangay', () => {
    const c = card({ fixedFares: [{ fromBarangayId: 'pob', toBarangayId: 'pob', fee: 35 }] });
    expect(computeDeliveryFee({ card: c, distanceKm: 1, fromBarangayId: 'pob', toBarangayId: 'pob', at: NOON }).fee).toBe(35);
  });
  it('adds surcharges on top of a fixed fare too', () => {
    const c = card({
      fixedFares: [{ fromBarangayId: 'pob', toBarangayId: 'mabini', fee: 60 }],
      surcharges: { night: { fromHour: 20, untilHour: 5, amount: 15 }, rain: 10, extraStop: 20 },
    });
    const q = quote(c, 2, { at: at('2026-11-23T21:30'), rainOn: true, extraStops: 2 });
    expect(q.fee).toBe(60 + 15 + 10 + 40);
    expect(q.breakdown).toMatchObject({ night: 15, rain: 10, extraStops: 40 });
  });
  it('charges night only during night hours in Manila time', () => {
    const c = card({ surcharges: { night: { fromHour: 20, untilHour: 5, amount: 15 }, rain: 0, extraStop: 0 } });
    expect(quote(c, 3, { at: at('2026-11-23T19:59') }).breakdown.night).toBe(0);
    expect(quote(c, 3, { at: at('2026-11-23T20:00') }).breakdown.night).toBe(15);
    expect(quote(c, 3, { at: at('2026-11-24T04:59') }).breakdown.night).toBe(15);
    expect(quote(c, 3, { at: at('2026-11-24T05:00') }).breakdown.night).toBe(0);
    // 12:30 UTC is 20:30 in Manila
    expect(quote(c, 3, { at: new Date('2026-11-23T12:30:00Z') }).breakdown.night).toBe(15);
  });
  it('charges rain only while the rider has it switched on', () => {
    const c = card({ surcharges: { night: null, rain: 10, extraStop: 0 } });
    expect(quote(c, 3).breakdown.rain).toBe(0);
    expect(quote(c, 3, { rainOn: true }).breakdown.rain).toBe(10);
  });
  it('flags straight-line estimates', () => {
    expect(quote(card(), 3, { estimate: true }).estimate).toBe(true);
    expect(quote(card(), 3).estimate).toBe(false);
  });
  it('never adds anything for Hatod: the fee is exactly the breakdown total', () => {
    const c = card({ base: 25, perKm: 9, minimum: 45, surcharges: { night: { fromHour: 22, untilHour: 4, amount: 20 }, rain: 15, extraStop: 10 } });
    for (const km of [0.3, 1, 2.2, 4.9, 7.5, 12]) {
      const q = quote(c, km, { rainOn: true, extraStops: 1, at: at('2026-11-23T23:00') });
      const b = q.breakdown;
      expect(q.fee).toBe((b.fixedFare ?? b.base + b.distance + b.minimumTopUp) + b.night + b.rain + b.extraStops);
    }
  });
});

describe('isNightHour / findFixedFare', () => {
  it('handles same-day windows too', () => {
    expect(isNightHour({ fromHour: 18, untilHour: 22, amount: 1 }, 21)).toBe(true);
    expect(isNightHour({ fromHour: 18, untilHour: 22, amount: 1 }, 23)).toBe(false);
  });
  it('returns null when no fixed fare matches', () => {
    expect(findFixedFare(card(), 'a', 'b')).toBeNull();
  });
});

describe('riderEligibility', () => {
  const rider = { verified: true, status: 'active' as const, online: true, servedBarangayIds: ['mabini', 'pob'], maxKm: 8 };
  const trip = { dropoffBarangayId: 'mabini', billedKm: 3.5 };
  it('accepts a verified, online, subscribed rider serving the barangay within range', () => {
    expect(riderEligibility(rider, 'active', trip)).toEqual({ eligible: true });
    expect(riderEligibility(rider, 'trial', trip).eligible).toBe(true);
    expect(riderEligibility(rider, 'grace', trip).eligible).toBe(true);
  });
  it.each([
    [{ verified: false }, 'active', trip, 'not_verified'],
    [{ status: 'suspended' }, 'active', trip, 'suspended'],
    [{ online: false }, 'active', trip, 'offline'],
    [{}, 'lapsed', trip, 'subscription'],
    [{}, null, trip, 'subscription'],
    [{}, 'active', { dropoffBarangayId: 'tabuc', billedKm: 2 }, 'area'],
    [{}, 'active', { dropoffBarangayId: 'mabini', billedKm: 8.5 }, 'too_far'],
  ] as const)('refuses %o / %s -> %s', (over, sub, t, reason) => {
    expect(riderEligibility({ ...rider, ...over }, sub, t)).toEqual({ eligible: false, reason });
  });
  it('allows exactly maxKm', () => {
    expect(riderEligibility(rider, 'active', { dropoffBarangayId: 'pob', billedKm: 8 }).eligible).toBe(true);
  });
});

describe('rate change limit', () => {
  const t0 = Date.parse('2026-11-23T08:00:00+08:00');
  it('is unlimited before verification', () => {
    expect(canChangeRates(t0, false, t0 + 1000)).toBe(true);
    expect(nextRateChangeAt(t0, false)).toBeNull();
  });
  it('is once per 24 hours after verification', () => {
    expect(canChangeRates(t0, true, t0 + 23 * 3600_000)).toBe(false);
    expect(canChangeRates(t0, true, t0 + 24 * 3600_000)).toBe(true);
    expect(canChangeRates(null, true, t0)).toBe(true);
  });
});

describe('rateCardSchema', () => {
  it('accepts the default card', () => {
    expect(rateCardSchema.safeParse(DEFAULT_RATE_CARD).success).toBe(true);
  });
  it('refuses a card that charges nothing', () => {
    const r = rateCardSchema.safeParse(card({ base: 0, perKm: 0, minimum: 0 }));
    expect(r.error?.issues[0]?.message).toBe('free_rate_card');
  });
  it('refuses duplicate fixed fares regardless of direction', () => {
    const r = rateCardSchema.safeParse(
      card({ fixedFares: [{ fromBarangayId: 'a', toBarangayId: 'b', fee: 50 }, { fromBarangayId: 'b', toBarangayId: 'a', fee: 55 }] }),
    );
    expect(r.error?.issues[0]?.message).toBe('duplicate_fixed_fare');
  });
  it('refuses centavos and a night window that starts and ends at the same hour', () => {
    expect(rateCardSchema.safeParse(card({ perKm: 9.5 })).success).toBe(false);
    expect(rateCardSchema.safeParse(card({ surcharges: { night: { fromHour: 20, untilHour: 20, amount: 10 }, rain: 0, extraStop: 0 } })).success).toBe(false);
  });
});

describe('registerRiderInput', () => {
  const ok = {
    townId: 't1',
    vehicleType: 'motorcycle',
    vehicleDesc: 'Honda XRM, red',
    plateNo: ' 123  abc ',
    emergencyContact: { name: 'Maria Rider', phone: '+639171234567', relation: 'Wife' },
  };
  it('normalizes the plate', () => {
    expect(registerRiderInput.parse(ok).plateNo).toBe('123 ABC');
    expect(normalizePlate('abc-1234')).toBe('ABC-1234');
  });
  it('needs a plate for motor vehicles but not bicycles', () => {
    expect(registerRiderInput.safeParse({ ...ok, plateNo: '' }).error?.issues[0]?.message).toBe('bad_plate');
    expect(registerRiderInput.safeParse({ ...ok, vehicleType: 'bicycle', plateNo: '' }).success).toBe(true);
  });
  it('checks the emergency contact', () => {
    expect(registerRiderInput.safeParse({ ...ok, emergencyContact: { ...ok.emergencyContact, phone: '0917' } }).success).toBe(false);
  });
});

describe('updateServiceAreaInput', () => {
  it('needs at least one barangay and a sensible max distance', () => {
    expect(updateServiceAreaInput.safeParse({ servedBarangayIds: [], maxKm: 5 }).success).toBe(false);
    expect(updateServiceAreaInput.safeParse({ servedBarangayIds: ['a'], maxKm: 0 }).success).toBe(false);
    expect(updateServiceAreaInput.safeParse({ servedBarangayIds: ['a'], maxKm: 8 }).success).toBe(true);
  });
});
