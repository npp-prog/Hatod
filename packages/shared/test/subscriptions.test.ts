import { describe, expect, it } from 'vitest';
import { creditValue, DAY_MS, switchPlan, extendPeriod, nextStatusChange, shopTakesOrders, sortShopsForHome, subscriptionStatus, trialEndFor, visibleMenuLimit } from '../src';

const now = Date.parse('2026-11-23T12:00:00+08:00');
const sub = (over = {}) => ({ planCode: 'shop_standard' as const, trialEndsAt: now - 10 * DAY_MS, currentPeriodEnd: null as number | null, balance: 0, ...over });

describe('subscriptionStatus', () => {
  it('trial until the trial ends', () => {
    expect(subscriptionStatus(sub({ trialEndsAt: now + DAY_MS }), now)).toBe('trial');
  });
  it('unpaid after the trial: 3 days of grace, then lapsed', () => {
    expect(subscriptionStatus(sub({ trialEndsAt: now - 2 * DAY_MS }), now)).toBe('grace');
    expect(subscriptionStatus(sub({ trialEndsAt: now - 3 * DAY_MS }), now)).toBe('lapsed');
  });
  it('active while paid; grace for 3 days after; then lapsed', () => {
    expect(subscriptionStatus(sub({ currentPeriodEnd: now + DAY_MS }), now)).toBe('active');
    expect(subscriptionStatus(sub({ currentPeriodEnd: now - DAY_MS }), now)).toBe('grace');
    expect(subscriptionStatus(sub({ currentPeriodEnd: now - 3 * DAY_MS - 1 }), now)).toBe('lapsed');
  });
  it('free Basic is always active', () => {
    expect(subscriptionStatus(sub({ planCode: 'shop_basic', trialEndsAt: 0 }), now)).toBe('active');
  });
  it('Rider Daily is active while the balance covers a day', () => {
    expect(subscriptionStatus(sub({ planCode: 'rider_daily', balance: 5 }), now, 5)).toBe('active');
    expect(subscriptionStatus(sub({ planCode: 'rider_daily', balance: 4 }), now, 5)).toBe('lapsed');
    expect(subscriptionStatus(sub({ planCode: 'rider_daily', balance: 0, trialEndsAt: now + DAY_MS }), now, 5)).toBe('trial');
  });
});

describe('periods', () => {
  it('extends from the current end when still paid, from today when not', () => {
    expect(extendPeriod(now + 5 * DAY_MS, now, 'month', 1)).toBe(now + 35 * DAY_MS);
    expect(extendPeriod(now - 5 * DAY_MS, now, 'month', 2)).toBe(now + 60 * DAY_MS);
    expect(extendPeriod(null, now, 'week', 1)).toBe(now + 7 * DAY_MS);
  });
  it('knows when the status changes next', () => {
    expect(nextStatusChange(sub({ trialEndsAt: now + DAY_MS }), now)).toBe(now + DAY_MS);
    expect(nextStatusChange(sub({ currentPeriodEnd: now + 2 * DAY_MS }), now)).toBe(now + 2 * DAY_MS);
    expect(nextStatusChange(sub({ currentPeriodEnd: now - DAY_MS }), now)).toBe(now + 2 * DAY_MS);
    expect(nextStatusChange(sub({ planCode: 'shop_basic' }), now)).toBeNull();
  });
  it('a new town trial is the town\'s date, or 60 days', () => {
    expect(trialEndFor(now + 10 * DAY_MS, now)).toBe(now + 10 * DAY_MS);
    expect(trialEndFor(null, now)).toBe(now + 60 * DAY_MS);
    expect(trialEndFor(now - DAY_MS, now)).toBe(now + 60 * DAY_MS);
  });
});

describe('what a plan allows', () => {
  it('in-app orders need a paid plan in good standing', () => {
    expect(shopTakesOrders({ planCode: 'shop_standard', subscriptionStatus: 'grace' })).toBe(true);
    expect(shopTakesOrders({ planCode: 'shop_standard', subscriptionStatus: 'lapsed' })).toBe(false);
    expect(shopTakesOrders({ planCode: 'shop_basic', subscriptionStatus: 'active' })).toBe(false);
    expect(shopTakesOrders({})).toBe(true);
  });
  it('Basic and lapsed shops show 10 items', () => {
    expect(visibleMenuLimit({ planCode: 'shop_basic', subscriptionStatus: 'active' })).toBe(10);
    expect(visibleMenuLimit({ planCode: 'shop_plus', subscriptionStatus: 'active' })).toBeNull();
  });
  it('Shop Plus is featured within open shops', () => {
    const always = { mon: [{ open: '00:00', close: '24:00' }] };
    const shops = [
      { name: 'A', hours: always, closedOn: null, ratingAvg: 5, ratingCount: 10 },
      { name: 'B plus', hours: always, closedOn: null, ratingAvg: 3, ratingCount: 10, planCode: 'shop_plus' as const, subscriptionStatus: 'active' as const },
      { name: 'C plus closed', hours: {}, closedOn: null, ratingAvg: 5, ratingCount: 10, planCode: 'shop_plus' as const, subscriptionStatus: 'active' as const },
    ];
    expect(sortShopsForHome(shops, new Date(now)).map((s) => s.name)).toEqual(['B plus', 'A', 'C plus closed']);
  });
});

describe('switching plans carries over value, not time', () => {
  const D = 86_400_000;
  const now = 1_800_000_000_000;
  const standard = { code: 'shop_standard' as const, price: 199, period: 'month' as const };
  const plus = { code: 'shop_plus' as const, price: 399, period: 'month' as const };
  const basic = { code: 'shop_basic' as const, price: 0, period: 'month' as const };
  const daily = { code: 'rider_daily' as const, price: 5, period: 'day' as const };
  const monthly = { code: 'rider_monthly' as const, price: 69, period: 'month' as const };
  const paid = (days: number) => ({ currentPeriodEnd: now + days * D, trialEndsAt: now - 100 * D, balance: 0, credit: 0 });

  it('12 months of Standard become about 6 months of Plus, not 12', () => {
    const r = switchPlan(paid(360), standard, plus, now);
    expect(r.planCode).toBe('shop_plus');
    const days = (r.currentPeriodEnd! - now) / D;
    expect(days).toBeCloseTo((360 * 199) / 399, 3);
  });

  it('switching back and forth never grows paid time', () => {
    const there = switchPlan(paid(30), standard, plus, now);
    const back = switchPlan({ ...paid(0), ...there }, plus, standard, now);
    expect(back.currentPeriodEnd! - now).toBeLessThanOrEqual(30 * D + 1);
  });

  it('Basic parks the value as credit and gives it back as time later', () => {
    const parked = switchPlan(paid(30), standard, basic, now);
    expect(parked).toMatchObject({ planCode: 'shop_basic', currentPeriodEnd: null });
    expect(parked.credit).toBeCloseTo(199, 5);
    const again = switchPlan({ ...paid(0), ...parked }, basic, standard, now + 10 * D);
    expect((again.currentPeriodEnd! - (now + 10 * D)) / D).toBeCloseTo(30, 3);
    expect(again.credit).toBe(0);
  });

  it('monthly rider time becomes prepaid load on Rider Daily; load stays as load', () => {
    const r = switchPlan(paid(30), monthly, daily, now);
    expect(r.balance).toBe(69);
    const m = switchPlan({ ...paid(0), currentPeriodEnd: null, balance: 40 }, daily, monthly, now);
    expect(m).toMatchObject({ planCode: 'rider_monthly', currentPeriodEnd: null, balance: 40 });
  });

  it('trial time is free and is not converted; a running grace period keeps its date', () => {
    const inTrial = { currentPeriodEnd: null, trialEndsAt: now + 20 * D, balance: 0, credit: 0 };
    expect(switchPlan(inTrial, standard, plus, now)).toMatchObject({ planCode: 'shop_plus', currentPeriodEnd: null });
    const inGrace = { ...paid(-1) };
    expect(switchPlan(inGrace, standard, plus, now).currentPeriodEnd).toBe(now - D);
  });

  it('a payment priced for another plan is credited by its peso value', () => {
    const r = creditValue(paid(0), plus, 199, now);
    expect((r.currentPeriodEnd! - now) / D).toBeCloseTo((199 / 399) * 30, 3);
  });
});
