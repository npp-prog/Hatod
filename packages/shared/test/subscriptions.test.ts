import { describe, expect, it } from 'vitest';
import { DAY_MS, extendPeriod, nextStatusChange, shopTakesOrders, sortShopsForHome, subscriptionStatus, trialEndFor, visibleMenuLimit } from '../src';

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
